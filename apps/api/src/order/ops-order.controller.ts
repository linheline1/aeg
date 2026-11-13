import {
  Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, NotFoundException, UseGuards, Res, Req, BadRequestException, ForbiddenException, Query
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { AuditRepo, QuotesRepo, ClientRepo, UserRepo, ImageRepo, repoRoot } from '../common/mock-db';
import { QuoteService } from '../upload/quote.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AisStreamService } from './ais-stream.service';
import { resolveShipment } from '../common/port-geo';

/** M3 状态机允许的手动流转（computing/done 由计算接口驱动） */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  uploaded: ['pending_fee', 'failed'],
  pending_fee: ['failed'],
  failed: ['pending_fee'] // 失败后可重开
};

/** M7 物流节点阶段（清关环节细化为三节点：customs_br / duty_paid / cleared） */
const SHIPMENT_STAGES = [
  'booked', 'loaded', 'customs_cn', 'departed', 'on_water', 'arrived',
  'customs_br', 'duty_paid', 'cleared', 'delivered'
] as const;

/** 最新物流节点 stage（按 happened_at 排序取末位） */
function latestShipmentStage(ship: any): string | null {
  if (!ship?.events?.length) return null;
  const sorted = [...ship.events].sort((a: any, b: any) => String(a.happened_at).localeCompare(String(b.happened_at)));
  return sorted[sorted.length - 1].stage || null;
}

@Controller('ops/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin', 'sales') // M4：业务员也可进（只读列表 + 成交标记）
export class OpsOrderController {
  constructor(
    private readonly quoteService: QuoteService,
    private readonly aisStream: AisStreamService,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo
  ) {}

  private actor(req: Request & { user?: any }) {
    return { username: req.user?.username || 'system', role: req.user?.role || 'system' };
  }

  /** 报价列表（服务端分页 + 筛选）：operator/admin 看全部；sales 只看归属自己的（订单改派优先，未改派的按客户归属兜底） */
  @Get()
  async list(
    @Req() req: Request & { user?: any },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('client_id') clientId?: string,
    @Query('q') q?: string
  ) {
    const clients = await this.clientRepo.findAll();
    const clientName: Record<string, string> = {};
    const clientSales: Record<string, string | null> = {};
    clients.forEach((c: any) => {
      clientName[c.id] = c.name;
      clientSales[c.id] = c.salesperson_id || null;
    });

    const me = req.user?.role === 'sales' ? req.user.sub : null;
    const sales = me
      ? { me, fallbackClientIds: clients.filter((c: any) => c.salesperson_id === me).map((c: any) => c.id) }
      : undefined;
    const { items: rows, total } = await this.quotesRepo.findPaged({
      where: {
        ...(clientId ? { client_id: clientId } : {}),
        ...(status ? { status } : {})
      },
      q: q || undefined,
      sales,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20
    });

    const users = await this.userRepo.findAll();
    const salesName: Record<string, string> = {};
    users.forEach((u: any) => { if (u.role === 'sales') salesName[u.id] = u.username; });

    const items = rows.map((q: any) => {
      const owner = q.salesperson_id || clientSales[q.client_id] || null;
      return {
        id: q.id,
        quote_no: q.quote_no,
        client_id: q.client_id,
        client_name: clientName[q.client_id] || '未知客户',
        template_version: q.template_version,
        status: q.status,
        input_file_name: q.input_file_name,
          converted_by_ai: q.converted_by_ai || false,
        declared_currency: q.declared_currency || 'RMB',
        ai_notes: q.ai_notes || null,
        total_rows: q.total_rows,
        valid_rows: q.valid_rows,
        total_cbm: q.total_cbm,
        total_gw_kg: q.total_gw_kg,
        total_amount_rmb: q.total_amount_rmb,
        total_amount_brl: q.total_amount_brl,
        total_amount_usd: q.total_amount_usd,
        salesperson_id: owner,
        salesperson_name: owner ? (salesName[owner] || null) : null,
        deal_status: q.deal_status || null,
        deal_note: q.deal_note || null,
        deal_closed_at: q.deal_closed_at || null,
        customs_review: q.customs_review || null,
        created_at: q.created_at,
        has_line_items: Array.isArray(q.line_items) && q.line_items.length > 0,
        has_breakdown: !!q.pricing_breakdown,
        shipment_stage: latestShipmentStage(q.shipment),
        shipment_eta: q.shipment?.eta || null,
        has_file: !!q.input_file_path && fs.existsSync(path.join(repoRoot(), q.input_file_path))
      };
    });
    return { items, total, page: Number(page) || 1, pageSize: Number(pageSize) || 20 };
  }

  @Get('clients/options')
  async clientOptions(@Req() req: Request & { user?: any }) {
    const clients = await this.clientRepo.findAll();
    return clients
      .filter((c: any) => c.status === 'active' && (req.user?.role !== 'sales' || c.salesperson_id === req.user.sub))
      .map((c: any) => ({ id: c.id, name: c.name, china_company_name: c.china_company_name || null }));
  }

  /** 业务员名下客户与本人可跟进的报价概况，不返回其他业务员客户资料。 */
  @Get('clients/mine')
  @Roles('sales')
  async myClients(@Req() req: Request & { user?: any }) {
    const me = req.user.sub;
    const clients = (await this.clientRepo.findAll()).filter((c: any) => c.salesperson_id === me);
    const clientIds = new Set(clients.map((c: any) => c.id));
    const [users, quotes] = await Promise.all([this.userRepo.findAll(), this.quotesRepo.find()]);
    const accounts = new Map(users.filter((u: any) => u.role === 'client' && clientIds.has(u.client_id)).map((u: any) => [u.client_id, u]));
    return clients.map((c: any) => {
      const own = quotes.filter((q: any) => q.client_id === c.id && (q.salesperson_id || c.salesperson_id) === me);
      const latest = own.reduce((date: string | null, q: any) => !date || q.created_at > date ? q.created_at : date, null);
      const account: any = accounts.get(c.id);
      return {
        id: c.id,
        name: c.name,
        china_company_name: c.china_company_name || null,
        status: c.status,
        verification_status: c.verification_status || 'pending',
        username: account?.username || null,
        user_status: account?.status || null,
        quote_count: own.length,
        open_count: own.filter((q: any) => q.status === 'done' && !['won', 'lost'].includes(q.deal_status)).length,
        last_quote_at: latest,
        created_at: c.created_at
      };
    }).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }

  /** 订单详情（含 line_items + pricing_breakdown）—— 报价员/管理员专用 */
  @Get(':id')
  @Roles('operator', 'admin')
  async detail(@Param('id') id: string) {
    const q: any = await this.quotesRepo.findById(id);
    if (!q) throw new NotFoundException('订单不存在');
    const client: any = await this.clientRepo.findOne({ where: { id: q.client_id } });
    const owner = q.salesperson_id || client?.salesperson_id || null;
    let salesName: string | null = null;
    if (owner) {
      const u: any = await this.userRepo.findOne({ where: { id: owner } });
      salesName = u?.username || null;
    }
    const shipmentResolved = q.shipment ? resolveShipment(q.shipment) : null;
    return {
      id: q.id,
      quote_no: q.quote_no,
      client_id: q.client_id,
      client_name: client?.name || '未知客户',
      template_version: q.template_version,
      status: q.status,
      input_file_name: q.input_file_name,
      has_file: !!q.input_file_path && fs.existsSync(path.join(repoRoot(), q.input_file_path)),
      converted_by_ai: q.converted_by_ai || false,
      declared_currency: q.declared_currency || 'RMB',
      ai_notes: q.ai_notes || null,
      total_rows: q.total_rows,
      valid_rows: q.valid_rows,
      total_cbm: q.total_cbm,
      total_gw_kg: q.total_gw_kg,
      total_amount_rmb: q.total_amount_rmb,
      total_amount_brl: q.total_amount_brl,
      total_amount_usd: q.total_amount_usd,
      salesperson_id: owner,
      salesperson_name: salesName,
      deal_status: q.deal_status || null,
      deal_note: q.deal_note || null,
      deal_closed_at: q.deal_closed_at || null,
      invoice_cnpj: q.invoice_cnpj || null,
      created_at: q.created_at,
      updated_at: q.updated_at,
      error_message: q.error_message,
      pricing_breakdown: q.pricing_breakdown || null,
      line_items: q.line_items || [],
      // M7：节点自动带位置（手动坐标 > 按阶段落 POL/POD > 海上段沿参考海路估算），前端按此画节点轨迹
      shipment: q.shipment && shipmentResolved ? { ...q.shipment, events: shipmentResolved.events } : null,
      node_position: shipmentResolved?.node_position ?? null,
      ais_position: q.shipment?.mmsi ? this.aisStream.watch(q.shipment.mmsi) : null,
      ais_track: q.shipment?.mmsi ? this.aisStream.track(q.shipment.mmsi) : [],
      di_analysis: q.di_analysis || null,
      customs_review: q.customs_review || null
    };
  }

  /**
   * 仅返回 AIS 船位，供详情页轮询（前端不重载整张订单，避免覆盖正在编辑的物流表单）。
   * `tracked=false` 表示该订单未维护 MMSI 或未配置 API key，前端据此停止轮询。
   */
  @Get(':id/ais')
  @Roles('operator', 'admin')
  async aisLive(@Param('id') id: string) {
    const q: any = await this.quotesRepo.findById(id);
    if (!q) throw new NotFoundException('订单不存在');
    const mmsi = q.shipment?.mmsi || null;
    return {
      mmsi,
      tracked: this.aisStream.enabled && !!mmsi,
      position: mmsi ? this.aisStream.watch(mmsi) : null,
      /** 自动累积的航迹（时间正序），前端画成橙色轨迹线 */
      track: mmsi ? this.aisStream.track(mmsi) : [],
      server_time: new Date().toISOString()
    };
  }

  /** 运营端：编辑运费、销售税务与利润，重新生成参考 DDP，写审计日志 */
  @Patch(':id/fees')
  @Roles('operator', 'admin')
  async editFees(
    @Param('id') id: string,
    @Body() body: {
      ocean_freight_usd?: number;
      port_fee_usd?: number;
      br_trucking_brl?: number;
      fx_rate?: number;
      sales_tax_rate?: number;
      sales_markup_rate?: number;
      profit_brl?: number;
    },
    @Req() req: Request & { user?: any }
  ) {
    return this.quoteService.recomputeBreakdown(id, this.actor(req), body);
  }

  @Patch(':id/line-items/:rowNo/price')
  @Roles('operator', 'admin')
  async adjustLineItemPrice(
    @Param('id') id: string,
    @Param('rowNo') rowNo: string,
    @Body() body: { percent?: number },
    @Req() req: Request & { user?: any }
  ) {
    if (body.percent === undefined || body.percent === null) {
      throw new BadRequestException('请提供调整百分比');
    }
    return this.quoteService.adjustLineItemPrice(id, Number(rowNo), Number(body.percent), this.actor(req));
  }

  /** M3 状态机：按费率表核算报价 uploaded/pending_fee → computing → done */
  @Post(':id/compute')
  @Roles('operator', 'admin')
  async compute(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.quoteService.computeOrder(id, this.actor(req));
  }

  /** M3 状态机：手动流转（uploaded→pending_fee / →failed / failed→pending_fee 重开） */
  @Patch(':id/status')
  @Roles('operator', 'admin')
  async changeStatus(
    @Param('id') id: string,
    @Body() body: { status?: string; reason?: string },
    @Req() req: Request & { user?: any }
  ) {
    const next = body.status || '';
    if (body.reason !== undefined && String(body.reason).length > 500) {
      throw new BadRequestException('原因说明过长（最多 500 字符）');
    }
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`不允许的状态流转：${order.status} → ${next}（允许：${allowed.join(', ') || '无'}）`);
    }
    const updated = await this.quotesRepo.update(id, {
      status: next as any,
      error_message: next === 'failed' ? (body.reason || '运营标记失败') : null
    });
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.status', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, from: order.status, to: next, reason: body.reason || null }
    });
    return { ok: true, id, status: updated?.status };
  }

  /** M4 成交标记：won=已成交 lost=未成交 open=恢复跟进（仅 done 报价可标记；业务员只能标记归属自己的单） */
  @Patch(':id/deal')
  async markDeal(
    @Param('id') id: string,
    @Body() body: { deal_status?: 'won' | 'lost' | 'open'; note?: string },
    @Req() req: Request & { user?: any }
  ) {
    const next = body.deal_status;
    if (!next || !['won', 'lost', 'open'].includes(next)) {
      throw new BadRequestException('deal_status 只能是 won / lost / open');
    }
    if (body.note !== undefined && String(body.note).length > 500) {
      throw new BadRequestException('备注过长（最多 500 字符）');
    }
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'done') {
      throw new BadRequestException('仅已核算发布（done）的报价可标记成交状态');
    }
    // 商业成交可先于报关审核记录；报关审核状态仍独立保留。
    if (req.user?.role === 'sales') {
      const client: any = await this.clientRepo.findOne({ where: { id: order.client_id } });
      const owner = order.salesperson_id || client?.salesperson_id || null;
      if (owner !== req.user.sub) throw new ForbiddenException('只能标记归属自己的报价单');
    }
    const updated = await this.quotesRepo.update(id, {
      deal_status: next,
      deal_note: body.note !== undefined ? (body.note.trim() || null) : (order.deal_note || null),
      deal_closed_at: next === 'open' ? null : new Date().toISOString()
    });
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.deal', target_type: 'quote', target_id: id,
      detail: {
        quote_no: order.quote_no, from: order.deal_status || null, to: next,
        note: body.note || null, amount_brl: order.total_amount_brl
      }
    });
    return { ok: true, id, deal_status: updated?.deal_status || null };
  }

  /** M4 改派业务员（报价员/管理员） */
  @Patch(':id/assign')
  @Roles('operator', 'admin')
  async assign(
    @Param('id') id: string,
    @Body() body: { salesperson_id?: string | null },
    @Req() req: Request & { user?: any }
  ) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    const target = body.salesperson_id || null;
    if (target) {
      const u: any = await this.userRepo.findOne({ where: { id: target } });
      if (!u || u.role !== 'sales') throw new BadRequestException('指定的业务员不存在');
    }
    const client: any = await this.clientRepo.findOne({ where: { id: order.client_id } });
    const fromOwner = order.salesperson_id || client?.salesperson_id || null;
    await this.quotesRepo.update(id, { salesperson_id: target });
    let toName: string | null = null;
    if (target) {
      const u: any = await this.userRepo.findOne({ where: { id: target } });
      toName = u?.username || null;
    }
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.assign', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, from_salesperson_id: fromOwner, to_salesperson_id: target, to_name: toName }
    });
    return { ok: true, id, salesperson_id: target, salesperson_name: toName };
  }

  /** 转客户：把该报价号转给另一个客户（归属业务员回到新客户默认，旧客户的开票抬头快照清空） */
  @Patch(':id/client')
  @Roles('operator', 'admin')
  async changeClient(
    @Param('id') id: string,
    @Body() body: { client_id?: string },
    @Req() req: Request & { user?: any }
  ) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    const targetId = String(body.client_id || '').trim();
    if (!targetId) throw new BadRequestException('请选择要转给的客户');
    if (targetId === order.client_id) {
      return { ok: true, unchanged: true, id, client_id: targetId };
    }
    const target: any = await this.clientRepo.findOne({ where: { id: targetId } });
    if (!target) throw new BadRequestException('指定的客户不存在');
    if (target.status !== 'active') throw new BadRequestException('该客户已停用，不能承接报价');

    const fromClient: any = await this.clientRepo.findOne({ where: { id: order.client_id } });
    const fromOwner = order.salesperson_id || fromClient?.salesperson_id || null;

    await this.quotesRepo.update(id, {
      client_id: targetId,
      salesperson_id: null, // 改派后回到新客户的默认业务员
      invoice_cnpj: null // 旧客户的开票抬头不再适用
    } as any);
    await this.imageRepo.reassignClient(id, targetId);

    const owner = target.salesperson_id || null;
    let ownerName: string | null = null;
    if (owner) {
      const u: any = await this.userRepo.findOne({ where: { id: owner } });
      ownerName = u?.username || null;
    }

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.client', target_type: 'quote', target_id: id,
      detail: {
        quote_no: order.quote_no,
        from_client_id: order.client_id, from_client_name: fromClient?.name || null,
        to_client_id: targetId, to_client_name: target.name,
        from_salesperson_id: fromOwner, to_salesperson_id: owner
      }
    });
    return {
      ok: true, id,
      client_id: targetId, client_name: target.name,
      salesperson_id: owner, salesperson_name: ownerName,
      invoice_cnpj: null
    };
  }

  /** M7：保存国际物流基本信息（仅 done 订单；首次创建 events 骨架），写审计日志 */
  @Put(':id/shipment')
  @Roles('operator', 'admin')
  async saveShipment(
    @Param('id') id: string,
    @Body() body: {
      vessel?: string; voyage?: string; bill_no?: string; container_no?: string; mmsi?: string;
      pol?: string; pod?: string; etd?: string; eta?: string; remark?: string;
    },
    @Req() req: Request & { user?: any }
  ) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'done') throw new BadRequestException('仅已核算发布（done）的订单可维护物流信息');
    if (order.deal_status !== 'won') throw new BadRequestException('客户确认成交后才能维护海运信息');

    const patch: Record<string, string | null> = {};
    for (const k of ['vessel', 'voyage', 'bill_no', 'container_no', 'pol', 'pod'] as const) {
      if (body[k] === undefined) continue;
      const v = String(body[k] ?? '').trim();
      if (v.length > 100) throw new BadRequestException(`${k} 过长（最多 100 字符）`);
      patch[k] = v || null;
    }
    if (body.mmsi !== undefined) {
      const mmsi = String(body.mmsi ?? '').trim();
      if (mmsi && !/^\d{9}$/.test(mmsi)) throw new BadRequestException('MMSI 必须是 9 位数字');
      patch.mmsi = mmsi || null;
    }
    for (const k of ['etd', 'eta'] as const) {
      if (body[k] === undefined) continue;
      const v = String(body[k] ?? '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}/.test(v)) throw new BadRequestException(`${k} 需为日期（YYYY-MM-DD）`);
      patch[k] = v || null;
    }
    if (body.remark !== undefined) {
      const v = String(body.remark ?? '').trim();
      if (v.length > 500) throw new BadRequestException('物流备注过长（最多 500 字符）');
      patch.remark = v || null;
    }

    const ship = {
      events: [],
      ...(order.shipment || {}),
      ...patch,
      updated_by: req.user?.username || 'system',
      updated_at: new Date().toISOString()
    };
    await this.quotesRepo.update(id, { shipment: ship } as any);
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.shipment', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, patch }
    });
    return { ok: true, id, shipment: ship };
  }

  /** M7：添加物流节点事件（stage 枚举校验；无 shipment 时自动创建骨架），写审计日志 */
  @Post(':id/shipment/events')
  @Roles('operator', 'admin')
  async addShipmentEvent(
    @Param('id') id: string,
    @Body() body: { stage?: string; note?: string; happened_at?: string; lat?: number | string; lng?: number | string },
    @Req() req: Request & { user?: any }
  ) {
    const stage = body.stage;
    if (!stage || !SHIPMENT_STAGES.includes(stage as any)) {
      throw new BadRequestException(`stage 只能是：${SHIPMENT_STAGES.join(' / ')}`);
    }
    if (body.note !== undefined && String(body.note).length > 500) {
      throw new BadRequestException('节点备注过长（最多 500 字符）');
    }
    // 可选手动坐标：两个一起填或都不填；填了就必须是合法经纬度
    const hasLat = body.lat !== undefined && body.lat !== null && String(body.lat).trim() !== '';
    const hasLng = body.lng !== undefined && body.lng !== null && String(body.lng).trim() !== '';
    let lat: number | null = null;
    let lng: number | null = null;
    if (hasLat || hasLng) {
      lat = Number(body.lat);
      lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new BadRequestException('手动坐标不合法：lat 在 -90..90，lng 在 -180..180，且两个要一起填');
      }
    }
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'done') throw new BadRequestException('仅已核算发布（done）的订单可维护物流信息');
    if (order.deal_status !== 'won') throw new BadRequestException('客户确认成交后才能更新物流节点');

    const now = new Date().toISOString();
    const ev = {
      id: crypto.randomUUID(),
      stage: stage as any,
      note: body.note !== undefined ? (String(body.note).trim() || null) : null,
      lat, lng,
      happened_at: body.happened_at?.trim() || now,
      created_by: req.user?.username || 'system',
      created_at: now
    };
    const events = [...(order.shipment?.events || []), ev]
      .sort((a: any, b: any) => String(a.happened_at).localeCompare(String(b.happened_at)));
    const ship = {
      ...(order.shipment || { events: [] }),
      events,
      updated_by: req.user?.username || 'system',
      updated_at: now
    };
    await this.quotesRepo.update(id, { shipment: ship } as any);
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.shipment.event', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, stage, note: ev.note, happened_at: ev.happened_at }
    });
    return { ok: true, id, event: ev, shipment: ship };
  }

  /** M7：删除误录的物流节点，写审计日志 */
  @Delete(':id/shipment/events/:eventId')
  @Roles('operator', 'admin')
  async deleteShipmentEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Req() req: Request & { user?: any }
  ) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (!order.shipment?.events?.length) throw new NotFoundException('该订单暂无物流节点');
    const target = order.shipment.events.find((e: any) => e.id === eventId);
    if (!target) throw new NotFoundException('物流节点不存在');
    const events = order.shipment.events.filter((e: any) => e.id !== eventId);
    const ship = {
      ...order.shipment,
      events,
      updated_by: req.user?.username || 'system',
      updated_at: new Date().toISOString()
    };
    await this.quotesRepo.update(id, { shipment: ship } as any);
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system',
      action: 'order.shipment.event_del', target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, stage: target.stage, happened_at: target.happened_at }
    });
    return { ok: true, id, shipment: ship };
  }

  /** 重新提取订单 Excel 内嵌产品图片（含 WPS 嵌入单元格图片），替换旧记录 */
  @Post(':id/images/reextract')
  @Roles('operator', 'admin')
  async reExtractImages(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.quoteService.reExtractImages(id, this.actor(req));
  }

  /** 下载客户上传的原 Excel */
  @Get(':id/file')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const q: any = await this.quotesRepo.findById(id);
    if (!q) throw new NotFoundException('订单不存在');
    if (!q.input_file_path) throw new NotFoundException('订单未留存上传文件');
    const full = path.join(repoRoot(), q.input_file_path);
    if (!fs.existsSync(full)) throw new NotFoundException('原文件已丢失');
    const filename = encodeURIComponent(q.input_file_name || `${q.quote_no}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.sendFile(full);
  }
}
