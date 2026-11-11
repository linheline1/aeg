import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import { assertValidPassword } from '../common/password-policy';
import { AuditRepo, ClientRepo, repoRoot } from '../common/mock-db';

const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

function isValidUscc(value: string): boolean {
  if (!/^[0-9ABCDEFGHJKLMNPQRTUWXY]{18}$/.test(value) || /^(.)\1{17}$/.test(value)) return false;
  const sum = USCC_WEIGHTS.reduce((total, weight, i) => total + USCC_CHARS.indexOf(value[i]) * weight, 0);
  return value[17] === USCC_CHARS[(31 - (sum % 31)) % 31];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('UserRepo') private readonly repo: any,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  async findByUsername(username: string) {
    return this.repo.findOne({ where: { username } });
  }
  async findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async register(body: {
    china_company_name?: string;
    china_uscc?: string;
    username?: string;
    password?: string;
  }, license?: Express.Multer.File) {
    const companyName = (body.china_company_name || '').trim();
    const uscc = (body.china_uscc || '').trim().toUpperCase();
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!companyName) throw new BadRequestException('请填写国内公司名称');
    if (companyName.length > 128) throw new BadRequestException('国内公司名称过长（最多 128 字符）');
    if (!isValidUscc(uscc)) throw new BadRequestException('统一社会信用代码无效，请核对 18 位代码');
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      throw new BadRequestException('登录账号需为 3-32 位字母、数字或 _ . -');
    }
    assertValidPassword(password, '密码');
    if (!license) throw new BadRequestException('请上传营业执照（JPG、PNG 或 PDF，不超过 10MB）');
    if (await this.findByUsername(username)) throw new ConflictException('登录账号已存在');

    const client = await this.clientRepo.insert({
      name: companyName,
      china_company_name: companyName,
      china_uscc: uscc,
      verification_status: 'pending',
      verification_note: null,
      license_file_path: path.relative(repoRoot(), license.path).replace(/\\/g, '/'),
      license_file_name: license.originalname,
      license_mime_type: license.mimetype,
      license_size_bytes: license.size,
      status: 'active',
      salesperson_id: null
    });
    const user = await this.repo.insert({
      username,
      password_hash: await bcrypt.hash(password, 12),
      role: 'client',
      client_id: client.id,
      status: 'active'
    });
    await this.auditRepo.entry({
      actor_username: username,
      actor_role: 'client',
      action: 'client.register',
      target_type: 'client',
      target_id: client.id,
      detail: { china_company_name: companyName, china_uscc: uscc, license_file_name: license.originalname }
    });
    return { id: user.id, username: user.username, client_id: client.id, verification_status: client.verification_status };
  }
}
