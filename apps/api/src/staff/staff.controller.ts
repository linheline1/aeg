import {
  Body, Controller, Get, Post, Patch, Param, Inject, UseGuards, Req, HttpCode,
  BadRequestException, NotFoundException, ConflictException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { assertValidPassword } from '../common/password-policy';
import { QuotesRepo, ClientRepo, AuditRepo } from '../common/mock-db';

/** 内部员工角色（不含 client） */
const STAFF_ROLES = ['admin', 'operator', 'sales', 'customs'];

@Controller('admin/staff')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class StaffController {
  constructor(
    @Inject('UserRepo') private readonly userRepo: any,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  /** 员工列表：管理员 / 报价员 / 业务员，含归属报价数量（业务员维度） */
  @Get()
  async list() {
    const [users, quotes, clients] = await Promise.all([
      this.userRepo.findAll(),
      this.quotesRepo.find(),
      this.clientRepo.findAll()
    ]);

    // 客户维度默认业务员（未改派的报价按此兜底归属）
    const clientSales: Record<string, string | null> = {};
    clients.forEach((c: any) => { clientSales[c.id] = c.salesperson_id || null; });

    const order: Record<string, number> = { admin: 0, operator: 1, sales: 2, customs: 3 };
    return users
      .filter((u: any) => STAFF_ROLES.includes(u.role))
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        created_at: u.created_at,
        updated_at: u.updated_at,
        quote_count: u.role === 'sales'
          ? quotes.filter((q: any) =>
              q.salesperson_id === u.id ||
              (!q.salesperson_id && clientSales[q.client_id] === u.id)).length
          : null
      }))
      .sort((a: any, b: any) =>
        order[a.role] - order[b.role] || a.username.localeCompare(b.username));
  }

  /** 新建内部员工，报关行账号登录独立葡语端口 */
  @Post()
  @HttpCode(200)
  async create(
    @Body() body: { username?: string; password?: string; role?: string },
    @Req() req: any
  ) {
    const username = (body.username || '').trim();
    const password = body.password || '';
    const role = body.role;

    if (!['operator', 'sales', 'customs'].includes(role as string)) {
      throw new BadRequestException('员工角色只能是报价员（operator）、业务员（sales）或报关行（customs）');
    }
    if (!username) throw new BadRequestException('登录账号不能为空');
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      throw new BadRequestException('登录账号需为 3-32 位字母、数字或 _ . -');
    }
    assertValidPassword(password, '初始密码');

    const exists = await this.userRepo.findOne({ where: { username } });
    if (exists) throw new ConflictException('登录账号已存在');

    const user = await this.userRepo.insert({
      username,
      password_hash: await bcrypt.hash(password, 12),
      role: role as 'operator' | 'sales' | 'customs',
      status: 'active'
    });

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'staff.create', target_type: 'user', target_id: user.id,
      detail: { username, role }
    });

    return { ok: true, staff: { id: user.id, username: user.username, role: user.role, status: user.status } };
  }

  /** 启用 / 禁用员工（不能禁用自己，也不能禁用最后一个启用中的管理员） */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { status?: 'active' | 'disabled' },
    @Req() req: any
  ) {
    const user: any = await this.userRepo.findOne({ where: { id } });
    if (!user || !STAFF_ROLES.includes(user.role)) throw new NotFoundException('员工不存在');

    if (!body.status || !['active', 'disabled'].includes(body.status)) {
      throw new BadRequestException('状态只能是 active 或 disabled');
    }
    if (body.status === user.status) throw new BadRequestException('状态未发生变化');
    if (body.status === 'disabled' && id === req.user?.sub) {
      throw new BadRequestException('不能禁用当前登录的自己');
    }
    if (body.status === 'disabled' && user.role === 'admin') {
      const all: any[] = await this.userRepo.findAll();
      const activeAdmins = all.filter(u => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) throw new BadRequestException('至少保留一名启用中的管理员');
    }

    const updated = await this.userRepo.update(id, { status: body.status });

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'staff.status', target_type: 'user', target_id: id,
      detail: { username: user.username, role: user.role, from: user.status, to: body.status }
    });

    const { password_hash, ...safe } = updated;
    return { ok: true, staff: safe };
  }

  /** 重置员工登录密码 */
  @Patch(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @Req() req: any
  ) {
    const user: any = await this.userRepo.findOne({ where: { id } });
    if (!user || !STAFF_ROLES.includes(user.role)) throw new NotFoundException('员工不存在');

    const password = body.password || '';
    assertValidPassword(password, '新密码');

    await this.userRepo.update(id, { password_hash: await bcrypt.hash(password, 12) });

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'staff.password', target_type: 'user', target_id: id,
      detail: { username: user.username, role: user.role }
    });

    return { ok: true, username: user.username };
  }
}
