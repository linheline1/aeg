import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { QuotesRepo, ClientRepo, UserRepo } from '../common/mock-db';

/**
 * M4 · 成交统计 + 业务员列表
 * - operator/admin：全公司视角（含按业务员汇总）
 * - sales：只统计归属自己的报价单
 */
@Controller('ops')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin', 'sales')
export class DealsController {
  constructor(
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('UserRepo') private readonly userRepo: UserRepo
  ) {}

  /** 业务员列表（分配下拉用）：报价员/管理员/业务员均可读 */
  @Get('salespeople')
  async salespeople() {
    const users: any[] = await this.userRepo.findAll();
    return users
      .filter(u => u.role === 'sales')
      .map(u => ({ id: u.id, username: u.username, status: u.status }));
  }

  /** 成交统计：总览 + 按月 / 按客户 / 按业务员 + 最近成交记录 */
  @Get('deals/stats')
  async stats(@Req() req: Request & { user?: any }) {
    const [quotes, clients, users] = await Promise.all([
      this.quotesRepo.find(),
      this.clientRepo.findAll(),
      this.userRepo.findAll()
    ]);
    const clientName: Record<string, string> = {};
    const clientSales: Record<string, string | null> = {};
    clients.forEach((c: any) => {
      clientName[c.id] = c.name;
      clientSales[c.id] = c.salesperson_id || null;
    });
    const salesName: Record<string, string> = {};
    users.forEach((u: any) => { if (u.role === 'sales') salesName[u.id] = u.username; });

    const ownerOf = (q: any) => q.salesperson_id || clientSales[q.client_id] || null;

    // sales 视角：只统计归属自己的报价单
    const me = req.user?.role === 'sales' ? req.user.sub : null;
    const scoped = me ? quotes.filter(q => ownerOf(q) === me) : quotes;

    // 统计口径：只看已核算发布（done）的报价
    const done = scoped.filter(q => q.status === 'done');
    const won = done.filter(q => q.deal_status === 'won');
    const lost = done.filter(q => q.deal_status === 'lost');
    const open = done.filter(q => !q.deal_status || q.deal_status === 'open');
    const sum = (arr: any[]) => Math.round(arr.reduce((s, q) => s + (q.total_amount_brl || 0), 0) * 100) / 100;

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const winRate = (w: number, l: number) => (w + l > 0 ? round1((w / (w + l)) * 100) : null);

    // 按月（报价创建月份）
    const monthMap: Record<string, { done: number; won: number; lost: number; open: number; won_amount_brl: number }> = {};
    done.forEach(q => {
      const m = (q.created_at || '').slice(0, 7);
      monthMap[m] = monthMap[m] || { done: 0, won: 0, lost: 0, open: 0, won_amount_brl: 0 };
      const row = monthMap[m];
      row.done++;
      if (q.deal_status === 'won') { row.won++; row.won_amount_brl += q.total_amount_brl || 0; }
      else if (q.deal_status === 'lost') row.lost++;
      else row.open++;
    });

    // 按客户
    const clientMap: Record<string, { done: number; won: number; lost: number; open: number; won_amount_brl: number }> = {};
    done.forEach(q => {
      const key = q.client_id;
      clientMap[key] = clientMap[key] || { done: 0, won: 0, lost: 0, open: 0, won_amount_brl: 0 };
      const row = clientMap[key];
      row.done++;
      if (q.deal_status === 'won') { row.won++; row.won_amount_brl += q.total_amount_brl || 0; }
      else if (q.deal_status === 'lost') row.lost++;
      else row.open++;
    });

    // 按业务员（未分配的进「未分配」桶；sales 视角只有自己）
    const salesMap: Record<string, { done: number; won: number; lost: number; open: number; won_amount_brl: number }> = {};
    done.forEach(q => {
      const key = ownerOf(q) || '_none';
      salesMap[key] = salesMap[key] || { done: 0, won: 0, lost: 0, open: 0, won_amount_brl: 0 };
      const row = salesMap[key];
      row.done++;
      if (q.deal_status === 'won') { row.won++; row.won_amount_brl += q.total_amount_brl || 0; }
      else if (q.deal_status === 'lost') row.lost++;
      else row.open++;
    });

    // 最近成交/未成交记录
    const recent = done
      .filter(q => q.deal_status === 'won' || q.deal_status === 'lost')
      .sort((a, b) => (b.deal_closed_at || '').localeCompare(a.deal_closed_at || ''))
      .slice(0, 20)
      .map(q => ({
        id: q.id,
        quote_no: q.quote_no,
        client_name: clientName[q.client_id] || '未知客户',
        salesperson_name: ownerOf(q) ? (salesName[ownerOf(q)!] || null) : null,
        deal_status: q.deal_status,
        deal_note: q.deal_note || null,
        amount_brl: q.total_amount_brl,
        deal_closed_at: q.deal_closed_at
      }));

    return {
      scope: me ? 'self' : 'all',
      overall: {
        done: done.length,
        won: won.length,
        lost: lost.length,
        open: open.length,
        win_rate: winRate(won.length, lost.length),
        won_amount_brl: sum(won),
        quoted_amount_brl: sum(done)
      },
      by_month: Object.entries(monthMap)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, v]) => ({ month, ...v, won_amount_brl: Math.round(v.won_amount_brl * 100) / 100, win_rate: winRate(v.won, v.lost) })),
      by_client: Object.entries(clientMap)
        .sort((a, b) => b[1].won - a[1].won)
        .map(([cid, v]) => ({ client_id: cid, client_name: clientName[cid] || '未知客户', ...v, won_amount_brl: Math.round(v.won_amount_brl * 100) / 100, win_rate: winRate(v.won, v.lost) })),
      by_salesperson: Object.entries(salesMap)
        .sort((a, b) => b[1].won - a[1].won)
        .map(([sid, v]) => ({ salesperson_id: sid === '_none' ? null : sid, salesperson_name: sid === '_none' ? '未分配' : (salesName[sid] || '未知'), ...v, won_amount_brl: Math.round(v.won_amount_brl * 100) / 100, win_rate: winRate(v.won, v.lost) })),
      recent
    };
  }
}
