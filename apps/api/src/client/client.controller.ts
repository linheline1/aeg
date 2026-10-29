import {
  Body, Controller, Get, Post, Patch, Param, Inject, UseGuards, Req, Res,
  BadRequestException, NotFoundException, ConflictException
} from '@nestjs/common';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { assertValidPassword } from '../common/password-policy';
import { QuotesRepo, AuditRepo, ClientCnpjsRepo, repoRoot } from '../common/mock-db';

@Controller('admin/clients')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'operator')
export class ClientController {
  constructor(
    @Inject('ClientRepo') private readonly repo: any,
    @Inject('UserRepo') private readonly userRepo: any,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    @Inject('ClientCnpjsRepo') private readonly cnpjsRepo: ClientCnpjsRepo
  ) {}

  /** 校验业务员归属值：null 或存在且角色为 sales，返回规范化后的值 */
  private async normalizeSalesperson(value: unknown): Promise<string | null> {
    if (value === null || value === undefined || value === '') return null;
    const u: any = await this.userRepo.findOne({ where: { id: String(value) } });
    if (!u || u.role !== 'sales') throw new BadRequestException('指定的业务员不存在');
    return u.id;
  }

  /** 客户列表：客户主体 + 登录账号 + 报价数量 + 归属业务员 */
  @Get()
  async list() {
    const clients = await this.repo.findAll();
    const users = await this.userRepo.findAll();
    const quotes = await this.quotesRepo.find();

    return clients.map((c: any) => {
      const account = users.find((u: any) => u.client_id === c.id);
      const sales = c.salesperson_id ? users.find((u: any) => u.id === c.salesperson_id) : null;
      const own = quotes.filter((q: any) => q.client_id === c.id);
      return {
        id: c.id,
        name: c.name,
        china_company_name: c.china_company_name || null,
        china_uscc: c.china_uscc || null,
        verification_status: c.verification_status || 'approved',
        verification_note: c.verification_note || null,
        status: c.status,
        salesperson_id: c.salesperson_id || null,
        salesperson_name: sales?.username || null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user_id: account?.id || null,
        username: account?.username || null,
        user_status: account?.status || null,
        quote_count: own.length,
        last_quote_at: own[0]?.created_at || null
      };
    });
  }

  @Get(':id/license')
  async license(@Param('id') id: string, @Res() res: Response) {
    const client: any = await this.repo.findOne({ where: { id } });
    if (!client?.license_file_path) throw new NotFoundException('客户尚未上传营业执照');
    const licenseDir = path.join(repoRoot(), 'apps/api/uploads/licenses');
    const filePath = path.resolve(repoRoot(), client.license_file_path);
    if (!filePath.startsWith(licenseDir + path.sep) || !fs.existsSync(filePath)) {
      throw new NotFoundException('营业执照文件不存在');
    }
    return res.download(filePath, client.license_file_name || '营业执照');
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const client: any = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('客户不存在');
    const users = await this.userRepo.findAll();
    const account = users.find((u: any) => u.client_id === id);
    const sales = client.salesperson_id ? users.find((u: any) => u.id === client.salesperson_id) : null;
    const quotes = await this.quotesRepo.find();
    const own = quotes.filter((q: any) => q.client_id === id);
    const cnpjs = await this.cnpjsRepo.findByClient(id);
    return {
      id: client.id,
      name: client.name,
      china_company_name: client.china_company_name || null,
      china_uscc: client.china_uscc || null,
      verification_status: client.verification_status || 'approved',
      verification_note: client.verification_note || null,
      verified_by: client.verified_by || null,
      verified_at: client.verified_at || null,
      license_uploaded: !!client.license_file_path,
      license_file_name: client.license_file_name || null,
      license_mime_type: client.license_mime_type || null,
      license_size_bytes: client.license_size_bytes || null,
      status: client.status,
      salesperson_id: client.salesperson_id || null,
      salesperson_name: sales?.username || null,
      created_at: client.created_at,
      updated_at: client.updated_at,
      user_id: account?.id || null,
      username: account?.username || null,
      user_status: account?.status || null,
      quote_count: own.length,
      last_quote_at: own[0]?.created_at || null,
      cnpjs
    };
  }

  /** 新建客户：同时创建 client 主体 + client 登录账号（可指定归属业务员） */
  @Post()
  @Roles('admin')
  async create(@Body() body: { name?: string; username?: string; password?: string; salesperson_id?: string | null }) {
    const name = (body.name || '').trim();
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!name) throw new BadRequestException('客户名称不能为空');
    if (name.length > 128) throw new BadRequestException('客户名称过长（最多 128 字符）');
    if (!username) throw new BadRequestException('登录账号不能为空');
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      throw new BadRequestException('登录账号需为 3-32 位字母、数字或 _ . -');
    }
    assertValidPassword(password, '初始密码');

    const exists = await this.userRepo.findOne({ where: { username } });
    if (exists) throw new ConflictException('登录账号已存在');

    const salespersonId = await this.normalizeSalesperson(body.salesperson_id);

    const client = await this.repo.insert({ name, verification_status: 'approved', status: 'active', salesperson_id: salespersonId });
    await this.userRepo.insert({
      username,
      password_hash: await bcrypt.hash(password, 12),
      role: 'client',
      client_id: client.id,
      status: 'active'
    });

    return { ok: true, client: { ...client, username } };
  }

  @Patch(':id/verification')
  async verify(
    @Param('id') id: string,
    @Body() body: { status?: 'approved' | 'rejected'; note?: string },
    @Req() req: any
  ) {
    const client: any = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('客户不存在');
    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      throw new BadRequestException('认证结果只能是 approved 或 rejected');
    }
    const note = (body.note || '').trim();
    if (body.status === 'rejected' && !note) throw new BadRequestException('驳回认证时必须填写原因');
    if (note.length > 1000) throw new BadRequestException('审核备注最多 1000 字符');
    const updated = await this.repo.update(id, {
      verification_status: body.status,
      verification_note: note || null,
      verified_by: req.user?.username || 'admin',
      verified_at: new Date().toISOString()
    });
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'admin',
      actor_role: req.user?.role || 'admin',
      action: 'client.verification',
      target_type: 'client',
      target_id: id,
      detail: {
        client_name: client.name,
        from_status: client.verification_status || 'approved',
        to_status: body.status,
        note: note || null
      }
    });
    return { ok: true, client: updated };
  }

  /** 修改客户：名称 / 启用禁用（同步登录账号状态）/ 归属业务员 */
  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; status?: 'active' | 'disabled'; salesperson_id?: string | null },
    @Req() req: any
  ) {
    const client: any = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('客户不存在');

    const patch: any = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('客户名称不能为空');
      if (name.length > 128) throw new BadRequestException('客户名称过长（最多 128 字符）');
      patch.name = name;
    }
    if (body.status !== undefined) {
      if (!['active', 'disabled'].includes(body.status)) {
        throw new BadRequestException('状态只能是 active 或 disabled');
      }
      patch.status = body.status;
    }
    if (body.salesperson_id !== undefined) {
      patch.salesperson_id = await this.normalizeSalesperson(body.salesperson_id);
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有需要修改的内容');

    const updated = await this.repo.update(id, patch);

    // 客户禁用/启用时，同步其登录账号
    if (patch.status) {
      const account = await this.userRepo.findOne({ where: { client_id: id } });
      if (account) await this.userRepo.update(account.id, { status: patch.status });
    }

    // 归属业务员变更写审计（影响该客户新报价的自动分配）
    if (body.salesperson_id !== undefined) {
      let toName: string | null = null;
      if (patch.salesperson_id) {
        const u: any = await this.userRepo.findOne({ where: { id: patch.salesperson_id } });
        toName = u?.username || null;
      }
      await this.auditRepo.entry({
        actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
        action: 'client.salesperson', target_type: 'client', target_id: id,
        detail: { client_name: client.name, from_salesperson_id: client.salesperson_id || null, to_salesperson_id: patch.salesperson_id, to_name: toName }
      });
    }

    return { ok: true, client: updated };
  }

  /** 重置客户登录密码 */
  @Patch(':id/password')
  @Roles('admin')
  async resetPassword(@Param('id') id: string, @Body() body: { password?: string }) {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('客户不存在');

    const password = body.password || '';
    assertValidPassword(password, '新密码');

    const account = await this.userRepo.findOne({ where: { client_id: id } });
    if (!account) throw new NotFoundException('该客户没有登录账号');
    await this.userRepo.update(account.id, { password_hash: await bcrypt.hash(password, 12) });

    return { ok: true, username: account.username };
  }
}
