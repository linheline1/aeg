import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { AuditRepo, ClientRepo, PaymentsRepo, QuotesRepo, UserRepo } from '../common/mock-db';

const EPS = 0.005; // 金额比较容差（分位以下）

type PayStatus = 'unpaid' | 'partial' | 'paid_off';

function payStatus(total: number, received: number): PayStatus {
  if (received >= total - EPS) return 'paid_off';
  return received > EPS ? 'partial' : 'unpaid';
}

/** M10 财务：应收 / 回款登记 / 汇总对账 */
@Controller('ops/finance')
@UseGuards(AuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('PaymentsRepo') private readonly paymentsRepo: PaymentsRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  private actor(req: Request & { user?: any }) {
    return { username: req.user?.username || 'system', role: req.user?.role || 'system' };
  }

  /** 已发布（done）订单的应收台账；sales 只看归属自己的单（改派优先，客户归属兜底） */
  @Get('receivables')
  @Roles('operator', 'admin', 'sales')
  async receivables(@Req() req: Request & { user?: any }) {
    const [quotes, payments, clients, users] = await Promise.all([
      this.quotesRepo.find(),
      this.paymentsRepo.findAll(),
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

    const byQuote: Record<string, any[]> = {};
    payments.forEach(p => { (byQuote[p.quote_id] ||= []).push(p); });

    const me = req.user?.role === 'sales' ? req.user.sub : null;
    return quotes
      .filter((q: any) => q.status === 'done')
      .filter((q: any) => !me || q.salesperson_id === me || (!q.salesperson_id && clientSales[q.client_id] === me))
      .map((q: any) => {
        const total = q.total_amount_brl || 0;
        const pmts = byQuote[q.id] || [];
        const received = pmts.reduce((s: number, p: any) => s + p.amount_brl, 0);
        const owner = q.salesperson_id || clientSales[q.client_id] || null;
        return {
          id: q.id,
          quote_no: q.quote_no,
          client_id: q.client_id,
          client_name: clientName[q.client_id] || '未知客户',
          total_brl: total,
          received_brl: Math.round(received * 100) / 100,
          outstanding_brl: Math.max(0, Math.round((total - received) * 100) / 100),
          pay_status: payStatus(total, received),
          deal_status: q.deal_status || null,
          salesperson_name: owner ? (salesName[owner] || null) : null,
          done_at: q.deal_closed_at || q.updated_at,
          payments: pmts.map((p: any) => ({
            id: p.id, amount_brl: p.amount_brl, paid_at: p.paid_at,
            note: p.note, created_by: p.created_by, created_at: p.created_at
          }))
        };
      });
  }

  /** 登记回款（仅 operator/admin；金额须 >0 且不超过未收余额） */
  @Post('quotes/:id/payments')
  @Roles('operator', 'admin')
  async addPayment(
    @Param('id') id: string,
    @Body() body: { amount_brl?: number; paid_at?: string; note?: string },
    @Req() req: Request & { user?: any }
  ) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'done') throw new BadRequestException('仅已发布（done）的报价可登记回款');

    const amount = Number(body?.amount_brl);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('回款金额必须大于 0');
    const paidAt = body?.paid_at || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) throw new BadRequestException('回款日期格式应为 YYYY-MM-DD');
    const note = body?.note?.trim() || null;
    if (note && note.length > 500) throw new BadRequestException('备注最长 500 字符');

    const existing = await this.paymentsRepo.findByQuote(id);
    const received = existing.reduce((s, p) => s + p.amount_brl, 0);
    const outstanding = (order.total_amount_brl || 0) - received;
    if (amount > outstanding + EPS) {
      throw new BadRequestException(`回款金额超过未收余额（剩余 R$ ${outstanding.toFixed(2)}）`);
    }

    const payment = await this.paymentsRepo.insert({
      quote_id: id,
      amount_brl: Math.round(amount * 100) / 100,
      paid_at: paidAt,
      note,
      created_by: req.user?.username || 'system'
    });
    const a = this.actor(req);
    await this.auditRepo.entry({
      actor_username: a.username, actor_role: a.role,
      action: 'finance.payment.create', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, amount_brl: payment.amount_brl, paid_at: paidAt }
    });
    return payment;
  }

  /** 删除回款记录（仅 operator/admin） */
  @Delete('payments/:pid')
  @Roles('operator', 'admin')
  async removePayment(@Param('pid') pid: string, @Req() req: Request & { user?: any }) {
    const all = await this.paymentsRepo.findAll();
    const target = all.find(p => p.id === pid);
    if (!target) throw new NotFoundException('回款记录不存在');
    await this.paymentsRepo.deleteById(pid);
    const a = this.actor(req);
    await this.auditRepo.entry({
      actor_username: a.username, actor_role: a.role,
      action: 'finance.payment.delete', target_type: 'quote', target_id: target.quote_id,
      detail: { payment_id: pid, amount_brl: target.amount_brl, paid_at: target.paid_at }
    });
    return { ok: true };
  }

  /** 汇总对账（仅 operator/admin）：总量 + 按月 + 按客户 */
  @Get('summary')
  @Roles('operator', 'admin')
  async summary() {
    const [quotes, payments, clients] = await Promise.all([
      this.quotesRepo.find(),
      this.paymentsRepo.findAll(),
      this.clientRepo.findAll()
    ]);
    const done = quotes.filter((q: any) => q.status === 'done');
    const clientName: Record<string, string> = {};
    clients.forEach((c: any) => { clientName[c.id] = c.name; });

    const receivedByQuote: Record<string, number> = {};
    payments.forEach(p => { receivedByQuote[p.quote_id] = (receivedByQuote[p.quote_id] || 0) + p.amount_brl; });

    let receivable = 0;
    let received = 0;
    let paidOff = 0;
    const byMonth: Record<string, { receivable: number; received: number }> = {};
    const byClient: Record<string, { client_name: string; receivable: number; received: number }> = {};

    for (const q of done as any[]) {
      const total = q.total_amount_brl || 0;
      const rec = receivedByQuote[q.id] || 0;
      receivable += total;
      received += Math.min(rec, total);
      if (payStatus(total, rec) === 'paid_off') paidOff++;

      const month = String(q.deal_closed_at || q.updated_at || q.created_at).slice(0, 7);
      (byMonth[month] ||= { receivable: 0, received: 0 });
      byMonth[month].receivable += total;
      byMonth[month].received += Math.min(rec, total);

      (byClient[q.client_id] ||= { client_name: clientName[q.client_id] || '未知客户', receivable: 0, received: 0 });
      byClient[q.client_id].receivable += total;
      byClient[q.client_id].received += Math.min(rec, total);
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      totals: {
        order_count: done.length,
        paid_off_count: paidOff,
        receivable_brl: r2(receivable),
        received_brl: r2(received),
        outstanding_brl: r2(Math.max(0, receivable - received))
      },
      by_month: Object.entries(byMonth)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, v]) => ({
          month,
          receivable_brl: r2(v.receivable),
          received_brl: r2(v.received),
          outstanding_brl: r2(Math.max(0, v.receivable - v.received))
        })),
      by_client: Object.entries(byClient)
        .map(([client_id, v]) => ({
          client_id,
          client_name: v.client_name,
          receivable_brl: r2(v.receivable),
          received_brl: r2(v.received),
          outstanding_brl: r2(Math.max(0, v.receivable - v.received))
        }))
        .sort((a, b) => b.receivable_brl - a.receivable_brl)
    };
  }
}
