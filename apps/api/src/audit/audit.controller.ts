import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { AuditRepo } from '../common/mock-db';

/**
 * 管理端审计日志（M2）
 *   GET /api/admin/audit?page=1&pageSize=50&action=LOGIN&q=xxx → 服务端分页 + 筛选
 *   兼容旧参数 limit（视为 pageSize）
 */
@Controller('admin/audit')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(@Inject('AuditRepo') private readonly repo: AuditRepo) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('q') q?: string
  ) {
    const size = Math.max(1, Math.min(Number(pageSize) || Number(limit) || 50, 100));
    const { items, total } = await this.repo.listPaged({
      action: action || undefined,
      q: q || undefined,
      page: Math.max(1, Number(page) || 1),
      pageSize: size
    });
    return { items, total, page: Math.max(1, Number(page) || 1), pageSize: size };
  }
}
