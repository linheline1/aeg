import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuditRepo, CustomsCnpjRow, CustomsCnpjsRepo, repoRoot } from '../common/mock-db';

function cnpjDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function validCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

function money(value: unknown, label: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000_000) {
    throw new BadRequestException(`${label} inválido`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export interface CnpjInput {
  cnpj?: string;
  company_name?: string;
  status?: 'active' | 'disabled';
  quota_limit_usd?: number;
  quota_used_usd?: number;
}

@Injectable()
export class CustomsCnpjService {
  constructor(
    @Inject('CustomsCnpjsRepo') private readonly repo: CustomsCnpjsRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  serialize(row: CustomsCnpjRow) {
    const certificate = (prefix: 'cert_a1' | 'ecpf') => {
      const name = row[`${prefix}_file_name` as keyof CustomsCnpjRow];
      if (!name) return null;
      return {
        file_name: name,
        size_bytes: row[`${prefix}_size_bytes` as keyof CustomsCnpjRow],
        uploaded_at: row[`${prefix}_uploaded_at` as keyof CustomsCnpjRow]
      };
    };
    const limit = Number(row.quota_limit_usd) || 0;
    const used = Number(row.quota_used_usd) || 0;
    return {
      id: row.id,
      cnpj: row.cnpj,
      company_name: row.company_name,
      status: row.status,
      quota_limit_usd: limit,
      quota_used_usd: used,
      quota_available_usd: Math.round((limit - used) * 100) / 100,
      quota_used_percent: limit > 0 ? Math.round((used / limit) * 10000) / 100 : 0,
      certificates: { a1: certificate('cert_a1'), ecpf: certificate('ecpf') },
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  async list() {
    return (await this.repo.findAll()).map(row => this.serialize(row));
  }

  private validate(input: CnpjInput, existing?: CustomsCnpjRow) {
    const result: Partial<CustomsCnpjRow> = {};
    if (input.cnpj !== undefined || !existing) {
      const digits = cnpjDigits(input.cnpj || '');
      if (!validCnpj(digits)) throw new BadRequestException('CNPJ inválido');
      result.cnpj = formatCnpj(digits);
    }
    if (input.company_name !== undefined || !existing) {
      const companyName = String(input.company_name || '').trim();
      if (!companyName) throw new BadRequestException('Informe a razão social');
      if (companyName.length > 200) throw new BadRequestException('A razão social deve ter no máximo 200 caracteres');
      result.company_name = companyName;
    }
    if (input.status !== undefined) {
      if (!['active', 'disabled'].includes(input.status)) throw new BadRequestException('Status inválido');
      result.status = input.status;
    }
    if (input.quota_limit_usd !== undefined || !existing) {
      result.quota_limit_usd = money(input.quota_limit_usd, 'Limite');
    }
    if (input.quota_used_usd !== undefined || !existing) {
      result.quota_used_usd = money(input.quota_used_usd, 'Limite utilizado');
    }
    return result;
  }

  async create(input: CnpjInput, actor: { username: string; role: string }) {
    const values = this.validate(input);
    if (await this.repo.findByCnpj(values.cnpj!)) throw new ConflictException('Este CNPJ já está cadastrado');
    const saved = await this.repo.insert({
      cnpj: values.cnpj!,
      company_name: values.company_name!,
      status: values.status || 'active',
      quota_limit_usd: values.quota_limit_usd!,
      quota_used_usd: values.quota_used_usd!
    });
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role, action: 'customs_cnpj.create',
      target_type: 'customs_cnpj', target_id: saved.id,
      detail: { cnpj: saved.cnpj, company_name: saved.company_name }
    });
    return this.serialize(saved);
  }

  async update(id: string, input: CnpjInput, actor: { username: string; role: string }, admin = false) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('CNPJ não encontrado');
    const allowed = admin ? input : {
      quota_limit_usd: input.quota_limit_usd,
      quota_used_usd: input.quota_used_usd
    };
    const values = this.validate(allowed, existing);
    if (values.cnpj && values.cnpj !== existing.cnpj) {
      const duplicate = await this.repo.findByCnpj(values.cnpj);
      if (duplicate && duplicate.id !== id) throw new ConflictException('Este CNPJ já está cadastrado');
    }
    const saved = await this.repo.update(id, values);
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role, action: 'customs_cnpj.update',
      target_type: 'customs_cnpj', target_id: id,
      detail: { cnpj: existing.cnpj, changes: values }
    });
    return this.serialize(saved!);
  }

  async uploadCertificate(
    id: string,
    kind: 'a1' | 'ecpf',
    file: Express.Multer.File | undefined,
    actor: { username: string; role: string }
  ) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      if (file) try { fs.unlinkSync(file.path); } catch { /* arquivo já ausente */ }
      throw new NotFoundException('CNPJ não encontrado');
    }
    if (!file) throw new BadRequestException('Selecione um certificado .pfx ou .p12');
    const prefix = kind === 'a1' ? 'cert_a1' : 'ecpf';
    const oldPath = existing[`${prefix}_file_path` as keyof CustomsCnpjRow] as string | null | undefined;
    const patch: Partial<CustomsCnpjRow> = {
      [`${prefix}_file_path`]: path.relative(repoRoot(), file.path).replace(/\\/g, '/'),
      [`${prefix}_file_name`]: path.basename(file.originalname).slice(0, 255),
      [`${prefix}_mime_type`]: 'application/x-pkcs12',
      [`${prefix}_size_bytes`]: file.size,
      [`${prefix}_uploaded_at`]: new Date().toISOString()
    } as Partial<CustomsCnpjRow>;
    try {
      const saved = await this.repo.update(id, patch);
      if (oldPath) try { fs.unlinkSync(path.join(repoRoot(), oldPath)); } catch { /* arquivo antigo já ausente */ }
      await this.auditRepo.entry({
        actor_username: actor.username, actor_role: actor.role, action: 'customs_cnpj.certificate_upload',
        target_type: 'customs_cnpj', target_id: id,
        detail: { cnpj: existing.cnpj, kind, file_name: file.originalname, size_bytes: file.size }
      });
      return this.serialize(saved!);
    } catch (error) {
      try { fs.unlinkSync(file.path); } catch { /* arquivo já ausente */ }
      throw error;
    }
  }

  async certificate(id: string, kind: 'a1' | 'ecpf') {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('CNPJ não encontrado');
    const prefix = kind === 'a1' ? 'cert_a1' : 'ecpf';
    const relative = row[`${prefix}_file_path` as keyof CustomsCnpjRow] as string | null | undefined;
    const name = row[`${prefix}_file_name` as keyof CustomsCnpjRow] as string | null | undefined;
    if (!relative) throw new NotFoundException('Certificado não encontrado');
    const absolute = path.join(repoRoot(), relative);
    if (!fs.existsSync(absolute)) throw new NotFoundException('Arquivo do certificado não encontrado');
    return { absolute, name: name || `${kind}.pfx` };
  }
}
