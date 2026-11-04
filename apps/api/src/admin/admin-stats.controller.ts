import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { ClientRepo, TemplateRepo, QuotesRepo, UserRepo } from '../common/mock-db';

/** 管理端工作台统计（Dashboard 真实数据源） */
@Controller('admin/stats')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminStatsController {
  constructor(
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('TemplateRepo') private readonly templateRepo: TemplateRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('UserRepo') private readonly userRepo: UserRepo
  ) {}

  @Get()
  async overview() {
    const [clients, templates, quotes, users] = await Promise.all([
      this.clientRepo.findAll(),
      this.templateRepo.find(),
      this.quotesRepo.find(),
      this.userRepo.findAll()
    ]);

    const byStatus: Record<string, number> = {};
    for (const q of quotes) byStatus[q.status] = (byStatus[q.status] || 0) + 1;

    const won = quotes.filter(q => q.deal_status === 'won');
    const staff = users.filter(u => u.role === 'operator' || u.role === 'sales' || u.role === 'customs');

    return {
      clients: {
        total: clients.length,
        active: clients.filter(c => c.status === 'active').length
      },
      templates: {
        total: templates.length,
        active_version: templates.find(t => t.status === 'active')?.version_no ?? null
      },
      quotes: { total: quotes.length, by_status: byStatus },
      staff: {
        total: staff.length,
        active: staff.filter(u => u.status === 'active').length
      },
      deals: {
        won: won.length,
        won_amount_brl: won.reduce((s, q) => s + (q.total_amount_brl || 0), 0)
      }
    };
  }
}
