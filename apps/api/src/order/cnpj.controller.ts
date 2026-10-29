import {
  Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards,
  BadGatewayException, BadRequestException, ForbiddenException, GatewayTimeoutException, NotFoundException
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { ClientCnpjsRepo, QuotesRepo, AuditRepo } from '../common/mock-db';

interface CnpjAddress {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
}

interface CreateCnpjBody {
  cnpj?: string;
  company_name?: string;
  ie?: string;
  is_default?: boolean;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  endereco?: CnpjAddress;
  registry_snapshot?: Record<string, any>;
  queried_at?: string;
}

/** CNPJ 相关工具：格式化 + 校验位验证 */
function cnpjDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}
function formatCnpj(d: string): string {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}
/** 标准 CNPJ 校验位算法（14 位） */
function isValidCnpj(d: string): boolean {
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false; // 全同号无效
  const calc = (len: number): number => {
    let sum = 0;
    let weight = len - 7; // 12位→5起；13位→6起
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAddress(value: unknown): CnpjAddress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return {
    logradouro: optionalText(source.logradouro),
    numero: optionalText(source.numero),
    complemento: optionalText(source.complemento),
    bairro: optionalText(source.bairro),
    municipio: optionalText(source.municipio),
    uf: optionalText(source.uf),
    cep: optionalText(source.cep)
  };
}

function normalizeSnapshot(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, any>;
  const fields = [
    'cnpj', 'razaoSocial', 'nomeFantasia', 'situacaoCadastral', 'dataSituacaoCadastral',
    'dataInicioAtividades', 'matriz', 'naturezaJuridica', 'logradouro', 'numero',
    'complemento', 'bairro', 'municipio', 'uf', 'cep', 'cnaes'
  ];
  return Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]]));
}

/**
 * M9 客户端：开票 CNPJ 维护 + 订单绑定
 *   GET    /api/client/cnpjs                    我的 CNPJ 列表（默认在前）
 *   GET    /api/client/cnpjs/lookup?cnpj=...    OpenCNPJ 查询（仅返回结果，不落库）
 *   POST   /api/client/cnpjs                    新增（cnpj + company_name + ie，首条自动默认）
 *   PATCH  /api/client/cnpjs/:id/default        设为默认开票抬头
 *   DELETE /api/client/cnpjs/:id                删除（不影响已绑定订单的开票快照）
 *   PATCH  /api/client/orders/:id/invoice-cnpj  为订单选择开票 CNPJ（写入快照）
 */
@Controller('client')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientCnpjController {
  constructor(
    @Inject('ClientCnpjsRepo') private readonly cnpjRepo: ClientCnpjsRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get('cnpjs')
  async list(@Req() req: Request & { user?: any }): Promise<any> {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    return this.cnpjRepo.findByClient(clientId);
  }

  @Get('cnpjs/lookup')
  async lookup(@Query('cnpj') cnpj: string): Promise<any> {
    const digits = cnpjDigits(cnpj || '');
    if (!isValidCnpj(digits)) {
      throw new BadRequestException('CNPJ 无效：请输入 14 位有效税号（含校验位）');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(`https://kitana.opencnpj.com/cnpj/${digits}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new GatewayTimeoutException('OpenCNPJ 查询超时，请稍后重试或手动填写');
      }
      throw new BadGatewayException('OpenCNPJ 暂时无法访问，请稍后重试或手动填写');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      throw new NotFoundException('未查询到该 CNPJ，请检查号码或手动填写');
    }
    if (!response.ok) {
      throw new BadGatewayException('OpenCNPJ 查询失败，请稍后重试或手动填写');
    }

    let payload: { success?: boolean; data?: Record<string, any> };
    try {
      payload = await response.json() as { success?: boolean; data?: Record<string, any> };
    } catch {
      throw new BadGatewayException('OpenCNPJ 返回了无效数据，请稍后重试或手动填写');
    }
    if (payload.success !== true || !payload.data || cnpjDigits(payload.data.cnpj || '') !== digits) {
      throw new BadGatewayException('OpenCNPJ 未返回匹配的企业资料，请检查号码或手动填写');
    }

    const data = payload.data;
    return {
      cnpj: formatCnpj(digits),
      company_name: optionalText(data.razaoSocial) || '',
      nome_fantasia: optionalText(data.nomeFantasia),
      situacao_cadastral: optionalText(data.situacaoCadastral),
      endereco: normalizeAddress(data),
      registry_snapshot: normalizeSnapshot(data),
      queried_at: new Date().toISOString()
    };
  }

  @Post('cnpjs')
  async create(
    @Body() body: CreateCnpjBody,
    @Req() req: Request & { user?: any }
  ): Promise<any> {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');

    const digits = cnpjDigits(body?.cnpj || '');
    if (!isValidCnpj(digits)) {
      throw new BadRequestException('CNPJ 无效：请输入 14 位有效税号（含校验位）');
    }
    const companyName = (body?.company_name || '').trim();
    if (!companyName) throw new BadRequestException('请填写公司名称（发票抬头）');
    if (companyName.length > 120) throw new BadRequestException('公司名称过长（≤120 字符）');
    const ie = (body?.ie || '').trim().toUpperCase();
    if (!ie) throw new BadRequestException('请填写 IE（州税登记号）；免税企业请填写 ISENTO');
    if (ie.length > 30 || !/^(?:ISENTO|[0-9A-Z./-]+)$/.test(ie)) {
      throw new BadRequestException('IE 格式无效，请填写州税登记号；免税企业请填写 ISENTO');
    }
    const nomeFantasia = optionalText(body?.nome_fantasia);
    if (nomeFantasia && nomeFantasia.length > 200) throw new BadRequestException('Nome Fantasia 过长（≤200 字符）');
    const situacaoCadastral = optionalText(body?.situacao_cadastral);
    if (situacaoCadastral && situacaoCadastral.length > 80) throw new BadRequestException('登记状态过长（≤80 字符）');
    const queriedAt = body?.queried_at && Number.isFinite(Date.parse(body.queried_at))
      ? new Date(body.queried_at).toISOString()
      : null;

    // 同客户去重
    const existing = await this.cnpjRepo.findByClient(clientId);
    if (existing.some(c => c.cnpj === formatCnpj(digits))) {
      throw new BadRequestException('该 CNPJ 已存在');
    }

    const saved = await this.cnpjRepo.insert({
      client_id: clientId,
      cnpj: formatCnpj(digits),
      company_name: companyName,
      ie,
      nome_fantasia: nomeFantasia,
      situacao_cadastral: situacaoCadastral,
      endereco: normalizeAddress(body?.endereco),
      registry_snapshot: normalizeSnapshot(body?.registry_snapshot),
      queried_at: queriedAt,
      is_default: body?.is_default === true
    });

    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: 'client',
      action: 'client.cnpj.create',
      target_type: 'client',
      target_id: clientId,
      detail: { cnpj: saved.cnpj, company_name: saved.company_name, ie: saved.ie }
    });

    return saved;
  }

  @Patch('cnpjs/:id/default')
  async setDefault(@Param('id') id: string, @Req() req: Request & { user?: any }): Promise<any> {
    const clientId = req.user?.client_id;
    const row = await this.cnpjRepo.setDefault(clientId, id);
    if (!row) throw new NotFoundException('CNPJ 不存在');
    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: 'client',
      action: 'client.cnpj.default',
      target_type: 'client',
      target_id: clientId,
      detail: { cnpj: row.cnpj, company_name: row.company_name }
    });
    return row;
  }

  @Delete('cnpjs/:id')
  async remove(@Param('id') id: string, @Req() req: Request & { user?: any }): Promise<any> {
    const clientId = req.user?.client_id;
    const row = await this.cnpjRepo.findById(id);
    if (!row || row.client_id !== clientId) throw new NotFoundException('CNPJ 不存在');
    await this.cnpjRepo.deleteById(id);
    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: 'client',
      action: 'client.cnpj.delete',
      target_type: 'client',
      target_id: clientId,
      detail: { cnpj: row.cnpj, company_name: row.company_name }
    });
    return { ok: true };
  }

  /** 为订单选择开票 CNPJ（写入快照，删除 CNPJ 不影响已绑定订单） */
  @Patch('orders/:id/invoice-cnpj')
  async bindOrder(
    @Param('id') id: string,
    @Body() body: { cnpj_id?: string | null },
    @Req() req: Request & { user?: any }
  ): Promise<any> {
    const clientId = req.user?.client_id;
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.client_id !== clientId) throw new ForbiddenException('无权操作该订单');
    if (order.status !== 'done') throw new BadRequestException('仅已发布（done）的订单可选择开票 CNPJ');

    let snapshot: { id: string; cnpj: string; company_name: string; ie?: string | null } | null = null;
    if (body?.cnpj_id) {
      const row = await this.cnpjRepo.findById(body.cnpj_id);
      if (!row || row.client_id !== clientId) throw new BadRequestException('开票 CNPJ 不存在');
      snapshot = { id: row.id, cnpj: row.cnpj, company_name: row.company_name, ie: row.ie || null };
    }
    const updated = await this.quotesRepo.update(id, { invoice_cnpj: snapshot });
    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: 'client',
      action: 'order.invoice_cnpj',
      target_type: 'quote',
      target_id: id,
      detail: { quote_no: order.quote_no, invoice_cnpj: snapshot?.cnpj || null, company_name: snapshot?.company_name || null }
    });
    return updated;
  }
}
