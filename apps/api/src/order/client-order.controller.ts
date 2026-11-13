import { Controller, Get, Inject, Param, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { AisStreamService } from './ais-stream.service';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { QuotesRepo } from '../common/mock-db';
import { resolveShipment } from '../common/port-geo';

@Controller('client/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientOrderController {
  constructor(@Inject('QuotesRepo') private readonly repo: QuotesRepo, private readonly aisStream: AisStreamService) {}

  /** 客户端仅查看报价结果与公开费用；内部利润及税基加成不拆分展示。 */
  private publicPricingBreakdown(breakdown: any) {
    if (!breakdown) return null;
    const items = (breakdown.items || [])
      .filter((item: any) => {
        const text = `${item.code || ''} ${item.name || ''}`;
        return !/(^|[_\s])profit([_\s]|$)|利润/i.test(text);
      })
      .map((item: any) => {
        if (item.code === 'BR_IMPORT_DI') return { ...item, name: '巴西进口税费预估（参考）', note: '按系统费率和税费规则估算' };
        if (item.code === 'BR_SALES_TAX') return { ...item, note: '按销售税基 × 销售税务费率计算；内部成本不拆分展示' };
        return item;
      });
    const publicBreakdown = { ...breakdown, items };
    delete publicBreakdown.profit_brl;
    delete publicBreakdown.sales_markup_rate;
    delete publicBreakdown.sales_markup_brl;
    delete publicBreakdown.tax_base_brl;
    return {
      ...publicBreakdown,
      hidden_internal_costs: true
    };
  }

  /** 返回当前 client 的报价订单列表（含未核算状态，仅自身订单可见） */
  @Get()
  async list(@Req() req: Request & { user?: any }) {
    const clientId = req.user?.client_id;
    const rows = await this.repo.find({ where: { client_id: clientId } });
    // 隐藏 client_id / 内部 id，只给客户端需要的字段
    return rows
      .map((r: any) => ({
        id: r.id,
        quote_no: r.quote_no,
        template_version: r.template_version,
        status: r.status,
        total_amount_brl: r.total_amount_brl,
        total_amount_usd: r.total_amount_usd,
        total_amount_rmb: r.total_amount_rmb,
        declared_currency: r.declared_currency || 'RMB',
        total_cbm: r.total_cbm ?? null,
        total_gw_kg: r.total_gw_kg ?? null,
        total_pcs: (r.line_items || []).reduce((sum: number, item: any) => sum + (Number(item.total_pcs) || 0), 0),
        input_file_name: r.input_file_name,
        converted_by_ai: r.converted_by_ai || false,
        ai_notes: r.ai_notes || null,
        invoice_cnpj: r.invoice_cnpj || null,
        shipment_stage: r.shipment?.events?.length ? r.shipment.events[r.shipment.events.length - 1].stage : null,
        shipment_eta: r.shipment?.eta || null,
        price_is_reference: true,
        error_message: r.error_message,
        created_at: r.created_at,
        updated_at: r.updated_at
      }));
  }

  /** 报价单详情（含 Excel 明细行与费用分项），仅本人订单可见 */
  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Req() req: Request & { user?: any }
  ) {
    const clientId = req.user?.client_id;
    const q = await this.repo.findById(id);
    if (!q || q.client_id !== clientId) throw new NotFoundException('报价单不存在');
    const diStatus = (q as any).di_analysis?.status;
    const recentlyUploaded = Date.now() - new Date(q.created_at).getTime() < 5 * 60 * 1000;
    const pricingProcessing = q.total_amount_brl == null && (
      q.status === 'computing'
      || ['analyzing', 'calculating', 'draft', 'reviewed'].includes(diStatus)
      ||       (q.status === 'uploaded' && recentlyUploaded)
    );
    const shipmentResolved = q.shipment ? resolveShipment(q.shipment) : null;
    return {
      id: q.id,
      quote_no: q.quote_no,
      status: q.status,
      template_version: q.template_version,
      input_file_name: q.input_file_name,
      converted_by_ai: q.converted_by_ai || false,
      declared_currency: q.declared_currency || 'RMB',
      ai_notes: q.ai_notes || null,
      total_rows: q.total_rows ?? null,
      valid_rows: q.valid_rows ?? null,
      total_cbm: q.total_cbm ?? null,
      total_gw_kg: q.total_gw_kg ?? null,
      total_amount_rmb: q.total_amount_rmb ?? null,
      total_amount_brl: q.total_amount_brl,
      total_amount_usd: q.total_amount_usd,
      pricing_breakdown: this.publicPricingBreakdown(q.pricing_breakdown),
      price_is_reference: true,
      pricing_processing: pricingProcessing,
      pricing_failed: q.total_amount_brl == null && diStatus === 'failed',
      di_analysis: null,
      line_items: q.line_items ?? [],
      deal_status: q.deal_status ?? null,
      shipment: q.shipment && shipmentResolved ? { ...q.shipment, events: shipmentResolved.events } : null,
      node_position: shipmentResolved?.node_position ?? null,
      ais_position: q.shipment?.mmsi ? this.aisStream.watch(q.shipment.mmsi) : null,
      ais_track: q.shipment?.mmsi ? this.aisStream.track(q.shipment.mmsi) : [],
      /** M9：开票 CNPJ 快照（客户选择的开票抬头） */
      invoice_cnpj: q.invoice_cnpj ?? null,
      created_at: q.created_at,
      updated_at: q.updated_at
    };
  }

  /** 报价单的明细行（行号 + 识别信息），供补传截图时选择对应行 */
  @Get(':id/rows')
  async rows(
    @Param('id') id: string,
    @Req() req: Request & { user?: any }
  ) {
    const clientId = req.user?.client_id;
    const q = await this.repo.findById(id);
    if (!q || q.client_id !== clientId) throw new NotFoundException('报价单不存在');
    return (q.line_items || []).map((it: any) => ({
      row_no: it.row_no,
      carton_no: it.carton_no ?? null,
      sku: it.sku ?? null,
      product_cn: it.product_cn ?? null
    }));
  }
}
