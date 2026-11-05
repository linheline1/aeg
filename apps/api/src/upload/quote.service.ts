import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { AuditRepo, FeeRatesRepo, QuotesRepo, ClientRepo, ImageRepo, repoRoot } from '../common/mock-db';
import { AiConvertService } from '../convert/ai-convert.service';
import { UploadDraftsRepo } from './upload-draft.repository';
import { AiNcmService } from '../order/ai-ncm.service';
import { calculateDi } from '../order/di-calculation';
import { calculateDdpPricing } from './ddp-pricing';

/**
 * 修复 multer/busboy 按 latin1 误解码的 UTF-8 中文文件名（mojibake），并清理文件系统非法字符。
 * "吉亚….xlsx" 被 latin1 解码成 "åäº…." 时还原为原文；正常 ASCII 名不受影响。
 */
function normalizeUploadFileName(raw: string): string {
  let name = String(raw || '');
  // 仅当只含 latin1 单字节高位字符（U+0080–U+00FF）时才可能是被误解码的 mojibake；
  // 已正确解码的中文含多字节 Unicode 字符（> U+00FF），不能二次转换
  if (/[\u0080-\u00FF]/.test(name) && !/[\u0100-\uFFFF]/.test(name)) {
    try {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) name = decoded;
    } catch { /* ignore */ }
  }
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedTypes = require('../../../../packages/shared-types/dist/index.js');
const FIELD_DICTIONARY = sharedTypes.FIELD_DICTIONARY as any[];
const DATA_START_ROW: number = sharedTypes.DATA_START_ROW;
const TEMPLATE_MAX_ROWS: number = sharedTypes.TEMPLATE_MAX_ROWS;

/** 工具：Excel 列字母 → 0-based index（inline 自 excel-utils） */
function colLetterToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** 校验模板版本 + schema_hash（inline 自 excel-utils） */
async function validateTemplateMeta(
  filePath: string,
  expectedVersion: string
): Promise<{ ok: boolean; reason?: string; meta?: any }> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const hidden = wb.worksheets.find(ws => ws.name === 'TEMPLATE_META');
    if (!hidden) return { ok: false, reason: 'TEMPLATE_META 缺失或损坏' };
    const a1 = hidden.getCell('A1').value;
    if (!a1 || typeof a1 !== 'string') return { ok: false, reason: 'TEMPLATE_META 格式错误' };
    const meta = JSON.parse(a1);
    if (meta.version !== expectedVersion) {
      return { ok: false, reason: `模板版本不一致（${meta.version} ≠ ${expectedVersion}），请下载最新模板`, meta };
    }
    return { ok: true, meta };
  } catch (e: any) {
    return { ok: false, reason: '模板文件无法解析：' + (e?.message || 'unknown') };
  }
}

interface ParsedRow {
  row_no: number;
  data: Record<string, any>;
  source_totals?: {
    total_pcs?: number | null;
    total_price?: number | null;
    total_cbm?: number | null;
  };
}

interface RowError {
  row: number;
  col_letter: string;
  field_key: string;
  reason: string;
}

export interface UploadResult {
  ok: boolean;
  quote_id?: string;
  quote_no?: string;
  status?: string;
  total_rows?: number;
  valid_rows?: number;
  total_cbm?: number;
  total_gw_kg?: number;
  total_amount_rmb?: number;
  total_amount?: number;
  total_pcs?: number;
  draft_id?: string;
  rows?: ParsedRow[];
  can_confirm?: boolean;
  message?: string;
  errors?: RowError[];
  error_summary?: string;
  converted_by_ai?: boolean;
  declared_currency?: 'RMB' | 'USD';
  ai_notes?: string;
  embedded_image_count?: number;
}

/**
 * M2/M3 报价服务：
 *   1. 校验模板 schema_hash（TEMPLATE_META）
 *   2. 读数据区 Row5+，按 FIELD_DICTIONARY 解析
 *   3. 行级校验（必填、正则、数值范围）
 *   4. 重算公式列（J/M/N/R/S/U）
 *   5. 上传入库为「uploaded」状态（M3 状态机起点）
 *   6. 运营端核算：费率表解析（客户覆盖 > 全局默认）→ computing → done，全程审计日志
 */
@Injectable()
export class QuoteService {
  constructor(
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('FeeRatesRepo') private readonly feeRatesRepo: FeeRatesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('UploadDraftsRepo') private readonly uploadDraftsRepo: UploadDraftsRepo,
    private readonly aiConvert: AiConvertService,
    private readonly aiNcm: AiNcmService
  ) {}

  private readonly confirmingDrafts = new Set<string>();

  /** 费率解析：客户覆盖 > 全局默认（M2 费率表） */
  resolveRates(clientId?: string | null) {
    return this.feeRatesRepo.resolve(clientId);
  }

  /**
   * 运营端参考 DDP 计算。已有 DI 即可生成参考价，报关行批准仅限制最终成交。
   * 费率来源：客户覆盖 > 全局默认，overrides 仅作单次微调。
   */
  async computeOrder(
    quoteId: string,
    actor: { username: string; role: string },
    overrides?: {
      ocean_freight_usd?: number;
      port_fee_usd?: number;
      fx_rate?: number;
      sales_tax_rate?: number;
      sales_markup_rate?: number;
      profit_brl?: number;
    }
  ) {
    const order: any = await this.quotesRepo.findById(quoteId);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'done' && !overrides) throw new BadRequestException('订单已完成核算，如需调整请编辑费率');
    const di = order.di_analysis;
    if (!Number.isFinite(Number(di?.totals?.di_brl))) {
      throw new BadRequestException('请先完成 AI NCM / DI 核算，再生成参考 DDP');
    }
    const merchandiseBrl = Number(di.totals.merchandise_brl)
      || (di.items || []).reduce((sum: number, item: any) => sum + (Number(item.merchandise_brl) || 0), 0);

    const resolved = await this.resolveRates(order.client_id);
    const fees = {
      ocean_freight_usd: overrides?.ocean_freight_usd ?? resolved.rates.ocean_freight_usd,
      port_fee_usd: overrides?.port_fee_usd ?? resolved.rates.port_fee_usd,
      fx_rate: overrides?.fx_rate ?? resolved.rates.fx_rate,
      sales_tax_rate: overrides?.sales_tax_rate ?? resolved.rates.sales_tax_rate,
      sales_markup_rate: overrides?.sales_markup_rate ?? resolved.rates.sales_markup_rate,
      profit_brl: overrides?.profit_brl ?? resolved.rates.profit_brl
    };
    const pricing = calculateDdpPricing({
      oceanFreightUsd: fees.ocean_freight_usd,
      portFeeUsd: fees.port_fee_usd,
      fxRate: fees.fx_rate,
      merchandiseBrl,
      diBrl: Number(di.totals.di_brl),
      salesMarkupRate: fees.sales_markup_rate,
      salesTaxRate: fees.sales_tax_rate,
      profitBrl: fees.profit_brl,
      diReviewVersion: di.status === 'reviewed' ? di.review_version : null
    });

    await this.quotesRepo.update(quoteId, { status: 'computing', error_message: null });
    try {
      const updated = await this.quotesRepo.update(quoteId, {
        pricing_breakdown: pricing.breakdown,
        total_amount_brl: pricing.brl,
        total_amount_usd: pricing.usd,
        status: 'done',
        error_message: null
      });
      await this.auditRepo.entry({
        actor_username: actor.username, actor_role: actor.role,
        action: 'order.compute', target_type: 'quote', target_id: quoteId,
        detail: {
          quote_no: order.quote_no, rate_source: resolved.source, fees,
          merchandise_brl: pricing.breakdown.merchandise_brl,
          di_brl: pricing.breakdown.di_brl,
          sales_markup_brl: pricing.breakdown.sales_markup_brl,
          tax_base_brl: pricing.breakdown.tax_base_brl,
          sales_tax_brl: pricing.breakdown.sales_tax_brl,
          profit_brl: pricing.breakdown.profit_brl, total_brl: pricing.brl,
          di_review_version: pricing.breakdown.di_review_version, is_reference: true
        }
      });
      return {
        ok: true, quote_no: updated?.quote_no,
        total_amount_brl: updated?.total_amount_brl,
        total_amount_usd: updated?.total_amount_usd,
        pricing_breakdown: pricing.breakdown,
        price_is_reference: true
      };
    } catch (e: any) {
      await this.quotesRepo.update(quoteId, { status: 'failed', error_message: e?.message || '计算失败' });
      await this.auditRepo.entry({
        actor_username: actor.username, actor_role: actor.role,
        action: 'order.compute_failed', target_type: 'quote', target_id: quoteId,
        detail: { quote_no: order.quote_no, error: e?.message }
      });
      throw e;
    }
  }

  async runAutoDi(quoteId: string): Promise<{ ok: boolean; error?: string }> {
    const startedAt = new Date().toISOString();
    try {
      const order: any = await this.quotesRepo.findById(quoteId);
      if (!order) throw new NotFoundException('订单不存在');
      await this.quotesRepo.update(quoteId, {
        di_analysis: { status: 'analyzing', stage: 'ncm', progress: 15, auto: true, started_at: startedAt },
        customs_review: {
          status: 'pending', di_review_version: null, total_di_brl: null,
          note: null, reviewed_by: null, reviewed_at: null
        }
      } as any);
      const suggestions = await this.aiNcm.suggest(order);
      await this.quotesRepo.update(quoteId, {
        di_analysis: { status: 'calculating', stage: 'taxes', progress: 80, auto: true, started_at: startedAt }
      } as any);
      const resolved = await this.resolveRates(order.client_id);
      const analysis: any = calculateDi(order, suggestions, {
        rmb_brl: Number(process.env.DI_RMB_BRL || 0.75),
        insurance_brl: Number(process.env.DI_INSURANCE_BRL || 0),
        icms_rate: Number(process.env.DI_ICMS_RATE || 0.18),
        uf: process.env.DI_UF || 'SP',
        freight_brl: (resolved.rates.ocean_freight_usd + resolved.rates.port_fee_usd) * resolved.rates.fx_rate
      });
      analysis.progress = 100;
      analysis.stage = 'completed';
      analysis.auto = true;
      analysis.started_at = startedAt;
      analysis.completed_at = new Date().toISOString();
      await this.quotesRepo.update(quoteId, { di_analysis: analysis } as any);
      await this.auditRepo.entry({
        actor_username: 'system', actor_role: 'system', action: 'order.di.auto',
        target_type: 'quote', target_id: quoteId,
        detail: { quote_no: order.quote_no, items: analysis.items.length, total_di_brl: analysis.totals.di_brl }
      });
      return { ok: true };
    } catch (e: any) {
      const error = e?.message || 'AI NCM / DI 自动核算失败';
      await this.quotesRepo.update(quoteId, {
        di_analysis: {
          status: 'failed', stage: 'failed', progress: 100, auto: true,
          started_at: startedAt, completed_at: new Date().toISOString(),
          error_message: error
        }
      } as any);
      return { ok: false, error };
    }
  }

  /** 使用默认运费 + 已复核 DI 生成客户可见的参考 DDP。 */
  async computeDdpWithDi(quoteId: string, di: any, actor: { username: string; role: string }) {
    const order: any = await this.quotesRepo.findById(quoteId);
    if (!order) throw new NotFoundException('订单不存在');
    if (!Number.isFinite(Number(di?.totals?.di_brl))) {
      throw new BadRequestException('DI 尚未计算，请先执行 NCM / DI 分析');
    }
    if (di.status !== 'reviewed') throw new BadRequestException('请先复核 DI 再生成参考 DDP');
    const resolved = await this.resolveRates(order.client_id);
    const merchandiseBrl = Number(di.totals.merchandise_brl)
      || (di.items || []).reduce((sum: number, item: any) => sum + (Number(item.merchandise_brl) || 0), 0);
    const pricing = calculateDdpPricing({
      oceanFreightUsd: resolved.rates.ocean_freight_usd,
      portFeeUsd: resolved.rates.port_fee_usd,
      fxRate: resolved.rates.fx_rate,
      merchandiseBrl,
      diBrl: Number(di.totals.di_brl),
      salesMarkupRate: resolved.rates.sales_markup_rate,
      salesTaxRate: resolved.rates.sales_tax_rate,
      profitBrl: resolved.rates.profit_brl,
      diReviewVersion: di.review_version
    });
    const updated = await this.quotesRepo.update(quoteId, {
      pricing_breakdown: pricing.breakdown,
      total_amount_brl: pricing.brl,
      total_amount_usd: pricing.usd,
      status: 'done',
      error_message: null
    });
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role,
      action: 'order.compute', target_type: 'quote', target_id: quoteId,
      detail: {
        quote_no: order.quote_no, rate_source: resolved.source,
        merchandise_brl: pricing.breakdown.merchandise_brl,
        di_brl: pricing.breakdown.di_brl,
        sales_markup_brl: pricing.breakdown.sales_markup_brl,
        tax_base_brl: pricing.breakdown.tax_base_brl,
        sales_tax_brl: pricing.breakdown.sales_tax_brl,
        profit_brl: pricing.breakdown.profit_brl, total_brl: pricing.brl,
        di_review_version: pricing.breakdown.di_review_version, is_reference: true, mode: 'ai-di'
      }
    });
    return {
      ok: true, quote_no: updated?.quote_no,
      total_amount_brl: updated?.total_amount_brl,
      total_amount_usd: updated?.total_amount_usd,
      pricing_breakdown: pricing.breakdown,
      price_is_reference: true
    };
  }

  async adjustLineItemPrice(
    quoteId: string,
    rowNo: number,
    percent: number,
    actor: { username: string; role: string }
  ) {
    const order: any = await this.quotesRepo.findById(quoteId);
    if (!order) throw new NotFoundException('订单不存在');
    if (!Number.isInteger(rowNo) || rowNo < 1) throw new BadRequestException('明细行号无效');
    if (!Number.isFinite(percent) || percent <= 0 || percent > 10000) {
      throw new BadRequestException('计价百分比必须大于 0 且不超过 10000');
    }
    const lineItems = (order.line_items || []).map((item: any) => ({ ...item }));
    const index = lineItems.findIndex((item: any) => Number(item.row_no) === rowNo);
    if (index < 0) throw new NotFoundException('明细行不存在');
    const item = lineItems[index];
    const beforePrice = Number(item.unit_price);
    const totalPcs = Number(item.total_pcs);
    if (!Number.isFinite(beforePrice) || beforePrice <= 0) {
      throw new BadRequestException('该行尚无有效单价，不能按百分比调整');
    }
    if (!Number.isFinite(totalPcs) || totalPcs <= 0) {
      throw new BadRequestException('该行数量无效，不能计算总价');
    }
    if (lineItems.some((row: any) => !Number.isFinite(Number(row.unit_price)) || Number(row.unit_price) <= 0)) {
      throw new BadRequestException('请先补齐所有产品的有效单价，再计算 DI 和参考 DDP');
    }

    // 按百分比计价：新单价 = 原始单价 × percent%（始终基于首次记录的原价，便于反复调整比例）
    // 例：原价 ¥35 按 30% 计价 → ¥10.5，行总价 = ¥10.5 × 总件数
    const basePrice = Number(item.base_unit_price) > 0 ? Number(item.base_unit_price) : beforePrice;
    const nextPrice = Math.round(basePrice * percent / 100 * 1_000_000) / 1_000_000;
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      throw new BadRequestException('计价后单价必须大于 0');
    }
    item.base_unit_price = basePrice;
    item.unit_price = nextPrice;
    item.total_price = Math.round(nextPrice * totalPcs * 100) / 100;
    const totalAmountRmb = Math.round(lineItems.reduce((sum: number, row: any) => sum + (Number(row.total_price) || 0), 0) * 100) / 100;
    const updatedOrder = { ...order, line_items: lineItems, total_amount_rmb: totalAmountRmb };
    const hasDi = order.di_analysis?.parameters && Array.isArray(order.di_analysis?.items) && order.di_analysis.items.length > 0;
    const diAnalysis = hasDi
      ? calculateDi(updatedOrder, order.di_analysis.items, order.di_analysis.parameters, order.di_analysis.additional_fees || [])
      : null;

    await this.quotesRepo.update(quoteId, {
      line_items: lineItems,
      total_amount_rmb: totalAmountRmb,
      di_analysis: diAnalysis,
      customs_review: {
        status: 'pending', di_review_version: null,
        total_di_brl: diAnalysis?.totals?.di_brl ?? null,
        note: null, reviewed_by: null, reviewed_at: null
      },
      ...(hasDi ? {} : { status: 'uploaded', pricing_breakdown: null, total_amount_brl: null, total_amount_usd: null })
    } as any);
    const result = hasDi ? await this.recomputeBreakdown(quoteId, actor, {}) : { ok: true };
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role,
      action: 'order.line_item.price', target_type: 'quote', target_id: quoteId,
      detail: {
        quote_no: order.quote_no, row_no: rowNo, percent,
        base_unit_price: basePrice, before_unit_price: beforePrice, after_unit_price: nextPrice,
        total_amount_rmb: totalAmountRmb,
        di_brl: diAnalysis?.totals?.di_brl ?? null,
        total_ddp_brl: (result as any).total_amount_brl ?? null
      }
    });
    return { ...result, row_no: rowNo, percent, unit_price: nextPrice, total_price: item.total_price };
  }

  /**
   * 运营端编辑费用后 → 重新计算 DDP 合计（不重新解析 Excel），写审计日志
   *
   * @param overrides 运营端单次调整：海运、港杂、汇率、20%加成、销售税务、每票利润
   */
  async recomputeBreakdown(
    quoteId: string,
    actor: { username: string; role: string },
    overrides: {
      ocean_freight_usd?: number;
      port_fee_usd?: number;
      fx_rate?: number;
      sales_tax_rate?: number;
      sales_markup_rate?: number;
      profit_brl?: number;
      br_clearance_brl?: number;
    }
  ) {
    const order: any = await this.quotesRepo.findById(quoteId);
    if (!order) throw new NotFoundException('订单不存在');
    const di = order.di_analysis;
    if (!Number.isFinite(Number(di?.totals?.di_brl))) {
      throw new BadRequestException('该订单尚无 DI，不能计算参考 DDP');
    }

    const resolved = await this.resolveRates(order.client_id);
    const previous = order.pricing_breakdown || {};
    const before = order.pricing_breakdown ? {
      ocean_brl: previous.ocean_freight_brl,
      port_brl: previous.port_fee_brl,
      di_brl: previous.di_brl,
      merchandise_brl: previous.merchandise_brl,
      sales_markup_rate: previous.sales_markup_rate,
      sales_markup_brl: previous.sales_markup_brl,
      tax_base_brl: previous.tax_base_brl,
      sales_tax_rate: previous.sales_tax_rate,
      sales_tax_brl: previous.sales_tax_brl,
      profit_brl: previous.profit_brl,
      fx: previous.fx_rate,
      total: previous.total
    } : null;

    const salesTaxRate = overrides.sales_tax_rate
      ?? (Number.isFinite(Number(previous.sales_tax_rate)) ? Number(previous.sales_tax_rate) : resolved.rates.sales_tax_rate);
    const profitBrl = overrides.profit_brl
      ?? (Number.isFinite(Number(previous.profit_brl)) ? Number(previous.profit_brl) : resolved.rates.profit_brl);
    const salesMarkupRate = overrides.sales_markup_rate
      ?? (Number.isFinite(Number(previous.sales_markup_rate)) ? Number(previous.sales_markup_rate) : resolved.rates.sales_markup_rate);
    const merchandiseBrl = Number(di.totals.merchandise_brl)
      || (di.items || []).reduce((sum: number, item: any) => sum + (Number(item.merchandise_brl) || 0), 0);
    const fees = {
      ocean_freight_usd: overrides.ocean_freight_usd ?? resolved.rates.ocean_freight_usd,
      port_fee_usd: overrides.port_fee_usd ?? resolved.rates.port_fee_usd,
      fx_rate: overrides.fx_rate ?? resolved.rates.fx_rate,
      sales_tax_rate: salesTaxRate,
      sales_markup_rate: salesMarkupRate,
      profit_brl: profitBrl
    };
    const pricing = calculateDdpPricing({
      oceanFreightUsd: fees.ocean_freight_usd,
      portFeeUsd: fees.port_fee_usd,
      fxRate: fees.fx_rate,
      merchandiseBrl,
      diBrl: Number(di.totals.di_brl),
      salesMarkupRate: fees.sales_markup_rate,
      salesTaxRate: fees.sales_tax_rate,
      profitBrl: fees.profit_brl,
      diReviewVersion: previous.di_review_version ?? (di.status === 'reviewed' ? di.review_version : null)
    });

    const updated = await this.quotesRepo.update(quoteId, {
      pricing_breakdown: pricing.breakdown,
      total_amount_brl: pricing.brl,
      total_amount_usd: pricing.usd,
      status: 'done',
      error_message: null
    });

    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role,
      action: 'order.fees', target_type: 'quote', target_id: quoteId,
      detail: {
        quote_no: order.quote_no, before,
        after: {
          fees, merchandise_brl: pricing.breakdown.merchandise_brl,
          di_brl: pricing.breakdown.di_brl,
          sales_markup_brl: pricing.breakdown.sales_markup_brl,
          tax_base_brl: pricing.breakdown.tax_base_brl,
          sales_tax_brl: pricing.breakdown.sales_tax_brl,
          profit_brl: pricing.breakdown.profit_brl,
          total: pricing.brl, is_reference: true
        }
      }
    });

    return {
      ok: true,
      quote_no: updated?.quote_no,
      total_amount_brl: updated?.total_amount_brl,
      total_amount_usd: updated?.total_amount_usd,
      pricing_breakdown: pricing.breakdown,
      price_is_reference: true
    };
  }

  private async parseWorkbook(filePath: string, templateVersion: string): Promise<any> {
    let wb: ExcelJS.Workbook;
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
    } catch (e: any) {
      throw new BadRequestException('文件损坏或不是有效的 xlsx：' + (e?.message || 'unknown'));
    }

    const v = await validateTemplateMeta(filePath, templateVersion);
    if (v.ok) {
      const ws = wb.worksheets[0];
      if (!ws) return { ok: false, status: 'failed', error_summary: '工作簿为空' };
      const b2Cell = this.normalizeCell(ws.getCell('B2').value);
      const warehouseCode = b2Cell == null ? '' : String(b2Cell).trim();
      const rows: ParsedRow[] = [];
      for (let r = DATA_START_ROW; r < DATA_START_ROW + TEMPLATE_MAX_ROWS; r++) {
        const excelRow = ws.getRow(r);
        if (!excelRow || !excelRow.cellCount) continue;
        const data: Record<string, any> = {};
        for (const f of FIELD_DICTIONARY) {
          const val = excelRow.getCell(colLetterToIndex(f.col_letter) + 1).value;
          data[f.field_key] = this.normalizeCell(val);
        }
        if (!String(data.product_cn || data.product_en || data.sku || data.carton_no || '').trim()) continue;
        const sourceNumber = (key: string) => Number.isFinite(Number(data[key])) && data[key] !== null && data[key] !== '' ? Number(data[key]) : null;
        rows.push({
          row_no: r,
          data,
          source_totals: {
            total_pcs: sourceNumber('total_pcs'),
            total_price: sourceNumber('total_price'),
            total_cbm: sourceNumber('total_cbm')
          }
        });
      }
      if (rows.length === 0) return { ok: false, status: 'failed', error_summary: '未检测到有效数据行，请从第 5 行起填写' };
      return { ok: true, rows, warehouseCode, convertedByAi: false, currency: 'RMB' };
    }

    if (!(await this.aiConvert.isEnabled())) {
      return {
        ok: false,
        status: 'failed',
        error_summary: `${v.reason || '模板校验失败'}。该文件不是标准模板，如需 AI 自动识别转换，请在管理端「模型 API」配置 AI 服务。`
      };
    }
    const conv = await this.aiConvert.convert(wb);
    if (!conv.ok) {
      return { ok: false, status: 'failed', error_summary: `模板校验失败：${v.reason || '非标准模板'}；AI 转换未成功：${conv.reason}` };
    }
    return {
      ok: true,
      rows: conv.rows,
      warehouseCode: conv.warehouseCode || '',
      convertedByAi: true,
      aiNotes: conv.notes,
      currency: conv.currency || 'RMB'
    };
  }

  async previewUpload(
    filePath: string,
    fileName: string,
    clientId: string,
    templateVersion: string,
    screenshots: any[] = []
  ): Promise<UploadResult> {
    fileName = normalizeUploadFileName(fileName);
    const parsed = await this.parseWorkbook(filePath, templateVersion);
    if (!parsed.ok) {
      for (const file of [filePath, ...screenshots.map(item => path.join(repoRoot(), item.file_path))]) {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }
      return parsed;
    }

    const draftId = crypto.randomUUID();
    const draftsDir = path.join(repoRoot(), 'apps/api/uploads/drafts');
    fs.mkdirSync(draftsDir, { recursive: true });
    const storedName = `${draftId}_${fileName}`;
    const storedPath = path.join(draftsDir, storedName);
    fs.copyFileSync(filePath, storedPath);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }

    const previewRows: ParsedRow[] = JSON.parse(JSON.stringify(parsed.rows));
    const errors = previewRows.flatMap(row => this.validateAndComputeRow(row, parsed.warehouseCode || ''));
    const summary = this.computeSummary(previewRows);
    await this.uploadDraftsRepo.insert({
      id: draftId,
      client_id: clientId,
      status: 'preview',
      file_name: fileName,
      file_path: `apps/api/uploads/drafts/${storedName}`,
      template_version: templateVersion,
      rows: parsed.rows,
      warehouse_code: parsed.warehouseCode || '',
      converted_by_ai: parsed.convertedByAi,
      ai_notes: parsed.aiNotes || null,
      declared_currency: parsed.currency,
      screenshots,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    return {
      ok: true,
      draft_id: draftId,
      status: 'validating',
      rows: previewRows,
      total_rows: previewRows.length,
      valid_rows: previewRows.length - new Set(errors.map(e => e.row)).size,
      total_cbm: summary.totalCbm,
      total_gw_kg: summary.totalGw,
      total_pcs: summary.totalPcs,
      total_amount: summary.totalAmountRmb,
      errors,
      error_summary: errors.length ? `${errors.length} 个校验问题，请修正后再确认` : undefined,
      can_confirm: errors.length === 0,
      converted_by_ai: parsed.convertedByAi || undefined,
      declared_currency: parsed.currency,
      ai_notes: parsed.aiNotes
    };
  }

  async confirmUpload(
    draftId: string,
    clientId: string,
    submittedRows: ParsedRow[],
    currency: string,
    actor: { username: string; role: string }
  ): Promise<UploadResult> {
    const draft = await this.uploadDraftsRepo.findById(draftId);
    if (!draft || draft.client_id !== clientId) throw new NotFoundException('识别草稿不存在');
    if (draft.status === 'confirmed' && draft.quote_id) {
      const order: any = await this.quotesRepo.findById(draft.quote_id);
      return {
        ok: true,
        quote_id: draft.quote_id,
        quote_no: order?.quote_no,
        status: order?.status,
        total_rows: order?.total_rows,
        valid_rows: order?.valid_rows,
        total_cbm: order?.total_cbm,
        total_gw_kg: order?.total_gw_kg,
        total_amount_rmb: order?.total_amount_rmb,
        declared_currency: order?.declared_currency,
        converted_by_ai: order?.converted_by_ai,
        ai_notes: order?.ai_notes,
        message: '该清单已确认，无需重复提交'
      };
    }
    if (draft.status !== 'preview') throw new BadRequestException('该草稿已取消或不可确认');
    if (new Date(draft.expires_at).getTime() <= Date.now()) throw new BadRequestException('识别草稿已过期，请重新上传');
    if (this.confirmingDrafts.has(draftId)) throw new BadRequestException('该草稿正在确认，请勿重复提交');
    if (!Array.isArray(submittedRows) || submittedRows.length === 0 || submittedRows.length > TEMPLATE_MAX_ROWS) {
      throw new BadRequestException('确认明细为空或超过最大行数');
    }
    if (currency !== 'RMB' && currency !== 'USD') throw new BadRequestException('申报币种无效');

    const originalRows = new Map(draft.rows.map(row => [Number(row.row_no), row]));
    if (submittedRows.length !== originalRows.size) throw new BadRequestException('确认明细不能删除原识别产品行，请重新上传完整清单');
    const seen = new Set<number>();
    const rows: ParsedRow[] = submittedRows.map(row => {
      const rowNo = Number(row?.row_no);
      const original = originalRows.get(rowNo);
      if (!Number.isInteger(rowNo) || rowNo < 1 || seen.has(rowNo) || !original || !row?.data || typeof row.data !== 'object') {
        throw new BadRequestException('确认明细包含无效、额外或重复行号');
      }
      seen.add(rowNo);
      const data: Record<string, any> = {};
      for (const field of FIELD_DICTIONARY) {
        if (!field.formula) data[field.field_key] = row.data[field.field_key] ?? null;
      }
      return { row_no: rowNo, data, source_totals: original.source_totals || undefined };
    });

    this.confirmingDrafts.add(draftId);
    try {
      const result = await this.finalizeUpload(rows, draft.warehouse_code || '', {
        filePath: path.join(repoRoot(), draft.file_path),
        fileName: draft.file_name,
        clientId,
        templateVersion: draft.template_version,
        actor,
        convertedByAi: draft.converted_by_ai,
        aiNotes: draft.ai_notes || undefined,
        currency
      });
      if (result.ok && result.quote_id) {
        await this.uploadDraftsRepo.update(draftId, { status: 'confirmed', quote_id: result.quote_id });
        result.draft_id = draftId;
      }
      return result;
    } finally {
      this.confirmingDrafts.delete(draftId);
    }
  }

  async getUploadDraft(draftId: string, clientId: string) {
    const draft = await this.uploadDraftsRepo.findById(draftId);
    if (!draft || draft.client_id !== clientId) throw new NotFoundException('识别草稿不存在');
    return draft;
  }

  async cancelUpload(draftId: string, clientId: string): Promise<{ ok: true }> {
    const draft = await this.uploadDraftsRepo.findById(draftId);
    if (!draft || draft.client_id !== clientId) throw new NotFoundException('识别草稿不存在');
    if (draft.status === 'confirmed') throw new BadRequestException('已确认草稿不能取消');
    if (draft.status === 'preview') {
      for (const file of [draft.file_path, ...(draft.screenshots || []).map(item => item.file_path)]) {
        try { fs.unlinkSync(path.join(repoRoot(), file)); } catch { /* ignore */ }
      }
    }
    await this.uploadDraftsRepo.update(draftId, { status: 'cancelled' });
    return { ok: true };
  }

  /** 运营端和旧客户端接口继续一步上传。 */
  async processUpload(
    filePath: string,
    fileName: string,
    clientId: string,
    templateVersion: string,
    actor: { username: string; role: string }
  ): Promise<UploadResult> {
    const parsed = await this.parseWorkbook(filePath, templateVersion);
    if (!parsed.ok) return parsed;
    return this.finalizeUpload(parsed.rows, parsed.warehouseCode || '', {
      filePath,
      fileName: normalizeUploadFileName(fileName),
      clientId,
      templateVersion,
      actor,
      convertedByAi: parsed.convertedByAi,
      aiNotes: parsed.aiNotes,
      currency: parsed.currency
    });
  }

  /** 标准模板与 AI 转换共用的尾部：行级校验 → 汇总 → 入库 → 审计 */
  private async finalizeUpload(
    rows: ParsedRow[],
    warehouseB2: string,
    ctx: {
      filePath: string;
      fileName: string;
      clientId: string;
      templateVersion: string;
      actor: { username: string; role: string };
      convertedByAi: boolean;
      aiNotes?: string;
      currency?: 'RMB' | 'USD';
    }
  ): Promise<UploadResult> {
    const declaredCurrency = ctx.currency || 'RMB';
    if (declaredCurrency === 'USD') {
      const resolved = await this.resolveRates(ctx.clientId);
      const fx = resolved.rates.fx_rate;
      for (const row of rows) {
        if (row.data.unit_price != null && row.data.unit_price !== '' && Number.isFinite(Number(row.data.unit_price))) {
          row.data.unit_price = Number(row.data.unit_price) * fx;
        }
        if (row.data.total_price != null && row.data.total_price !== '' && Number.isFinite(Number(row.data.total_price))) {
          row.data.total_price = Number(row.data.total_price) * fx;
        }
        if (row.source_totals?.total_price != null) row.source_totals.total_price *= fx;
      }
    }

    // 3. 行级校验 + 重算公式
    const allErrors: RowError[] = [];
    for (const row of rows) {
      const errs = this.validateAndComputeRow(row, warehouseB2);
      allErrors.push(...errs);
    }

    if (allErrors.length > 0) {
      // 不入库，返回错误让客户端展示
      return {
        ok: false,
        status: 'validating',
        total_rows: rows.length,
        valid_rows: rows.length - new Set(allErrors.map(e => e.row)).size,
        errors: allErrors.slice(0, 50), // 最多回 50 条
        error_summary: `${allErrors.length} 个校验错误（${new Set(allErrors.map(e => e.row)).size} 行）`,
        converted_by_ai: ctx.convertedByAi || undefined,
        ai_notes: ctx.aiNotes
      };
    }

    // 4. 汇总（M3：上传只入「uploaded」状态，报价由运营端按费率表核算后发布）
    const summary = this.computeSummary(rows);

    // 5. 迁移文件到持久化目录（运营端可看原 Excel）
    const quotesDir = path.join(repoRoot(), 'apps/api/uploads/orders');
    fs.mkdirSync(quotesDir, { recursive: true });
    const quoteNo = this.genQuoteNo();
    const destName = `${quoteNo}_${ctx.fileName}`;
    const destPath = path.join(quotesDir, destName);
    try { fs.copyFileSync(ctx.filePath, destPath); } catch { /* ignore */ }

    // 6. 把解析出的行数据归一化（field_key 中文名 + 数值结果）
    const lineItems = rows.map(r => ({ row_no: r.row_no, ...r.data }));

    // 7. 写库（状态机起点：uploaded，无报价；运营端核算 → pending_fee/computing → done）
    // M4：自动继承客户维度的归属业务员（后续运营端可改派）
    const uploadClient: any = await this.clientRepo.findOne({ where: { id: ctx.clientId } });
    const saved = await this.quotesRepo.insert({
      quote_no: quoteNo,
      client_id: ctx.clientId,
      template_code: 'BR_FCL',
      template_version: ctx.templateVersion,
      status: 'uploaded',
      total_amount_brl: null,
      total_amount_usd: null,
      input_file_name: ctx.fileName,
      input_file_path: `apps/api/uploads/orders/${destName}`,
      total_cbm: summary.totalCbm,
      total_gw_kg: summary.totalGw,
      total_amount_rmb: summary.totalAmountRmb,
      total_rows: rows.length,
      valid_rows: rows.length,
      pricing_breakdown: null,
      line_items: lineItems,
      salesperson_id: uploadClient?.salesperson_id || null,
      deal_status: null,
      deal_note: null,
      deal_closed_at: null,
      declared_currency: declaredCurrency,
      converted_by_ai: ctx.convertedByAi,
      ai_notes: ctx.aiNotes || null,
      error_message: null
    });

    let embeddedImageCount = 0;
    try {
      embeddedImageCount = await this.storeEmbeddedImages(destPath, saved.id, ctx.clientId);
    } catch (error: any) {
      await this.auditRepo.entry({
        actor_username: ctx.actor.username, actor_role: ctx.actor.role,
        action: 'order.excel_images_failed', target_type: 'quote', target_id: saved.id,
        detail: { quote_no: quoteNo, error: error?.message || 'Excel 图片提取失败' }
      });
    }

    await this.auditRepo.entry({
      actor_username: ctx.actor.username, actor_role: ctx.actor.role,
      action: 'order.upload', target_type: 'quote', target_id: saved.id,
      detail: {
        quote_no: quoteNo, client_id: ctx.clientId, file_name: ctx.fileName,
        rows: rows.length, total_cbm: summary.totalCbm, embedded_image_count: embeddedImageCount,
        converted_by_ai: ctx.convertedByAi, ai_notes: ctx.aiNotes
      }
    });

    // 清理 multer 临时文件
    try { fs.unlinkSync(ctx.filePath); } catch { /* ignore */ }

    return {
      ok: true,
      quote_id: saved.id,
      quote_no: saved.quote_no,
      status: 'uploaded',
      total_rows: rows.length,
      valid_rows: rows.length,
      total_cbm: summary.totalCbm,
      total_gw_kg: summary.totalGw,
      total_amount_rmb: summary.totalAmountRmb,
      declared_currency: declaredCurrency,
      message: ctx.convertedByAi
        ? 'AI 已自动识别并转换文件格式，上传成功，已进入核算队列'
        : '上传成功，已进入核算队列；运营按费率表核算后报价将发布到「我的报价」',
      converted_by_ai: ctx.convertedByAi || undefined,
      ai_notes: ctx.aiNotes,
      embedded_image_count: embeddedImageCount
    };
  }

  // ============= helpers =============

  /** 重新提取订单 Excel 内嵌图片（含 WPS 嵌入单元格图片）：删除旧记录与文件后全量重建 */
  async reExtractImages(quoteId: string, actor: { username: string; role: string }) {
    const order: any = await this.quotesRepo.findById(quoteId);
    if (!order) throw new NotFoundException('订单不存在');
    const excelPath = order.input_file_path ? path.join(repoRoot(), order.input_file_path) : null;
    if (!excelPath || !fs.existsSync(excelPath)) {
      throw new BadRequestException('原 Excel 文件不存在，无法重新提取图片');
    }
    const removed = await this.imageRepo.deleteByQuote(quoteId);
    for (const img of removed) {
      try { fs.unlinkSync(path.join(repoRoot(), img.file_path)); } catch { /* ignore */ }
    }
    const images = await this.storeEmbeddedImages(excelPath, quoteId, order.client_id);
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role,
      action: 'order.images.reextract', target_type: 'quote', target_id: quoteId,
      detail: { quote_no: order.quote_no, removed: removed.length, images }
    });
    return { ok: true, removed: removed.length, images };
  }

  private async storeEmbeddedImages(excelPath: string, quoteId: string, clientId: string): Promise<number> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    const imageDir = path.join(repoRoot(), 'apps/api/uploads/images');
    fs.mkdirSync(imageDir, { recursive: true });
    const rows: any[] = [];

    // 有效产品行号集合：浮动图片锚定在标题/logo 等非产品行时丢弃
    const order: any = await this.quotesRepo.findById(quoteId);
    const validRowNos = new Set<number>((order?.line_items || []).map((it: any) => Number(it.row_no)));

    // 先收集：drawing 锚点占用的 media 下标 + WPS DISPIMG（嵌入单元格图片）所在行
    const drawingImageIds = new Set<number>();
    const dispimgRows: number[] = [];
    for (const worksheet of workbook.worksheets) {
      for (const placement of worksheet.getImages()) drawingImageIds.add(Number(placement.imageId));
      worksheet.eachRow(row => {
        row.eachCell({ includeEmpty: false }, cell => {
          const v: any = cell.value;
          const formula = v && typeof v === 'object'
            ? String(v.formula || v.sharedFormula?.formula || '')
            : '';
          if (/DISPIMG\s*\(/i.test(formula)) dispimgRows.push(Number(cell.row));
        });
      });
    }
    dispimgRows.sort((a, b) => a - b);

    // WPS DISPIMG 图片存于 media 但无 drawing 锚点（cellimages 映射常被重存丢失）：
    // 排除 drawing 占用后，剩余 media 按顺序与 DISPIMG 行号顺序一一对应
    if (dispimgRows.length > 0) {
      const mediaList: any[] = (workbook as any).media || [];
      const dispimgMedia = mediaList
        .map((media: any, index: number) => ({ media, index }))
        .filter(({ media, index }: { media: any; index: number }) =>
          !drawingImageIds.has(index) && media?.type === 'image' && media.buffer && media.buffer.length > 0);
      const pairs = Math.min(dispimgRows.length, dispimgMedia.length);
      for (let i = 0; i < pairs; i++) {
        const { media } = dispimgMedia[i];
        const rowNo = dispimgRows[i];
        if (validRowNos.size > 0 && !validRowNos.has(rowNo)) continue; // 非产品行的 DISPIMG 跳过
        const extension = String(media.extension || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'png';
        const buffer = Buffer.from(media.buffer as any);
        const fileName = `excel-dispimg-row${rowNo}-${crypto.randomUUID()}.${extension}`;
        const absolutePath = path.join(imageDir, fileName);
        fs.writeFileSync(absolutePath, buffer);
        rows.push({
          client_id: clientId,
          quote_id: quoteId,
          row_no: rowNo,
          file_name: `excel-row-${rowNo}-cellimage.${extension}`,
          file_path: path.relative(repoRoot(), absolutePath).replace(/\\/g, '/'),
          mime_type: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
          size_bytes: buffer.length
        });
      }
    }

    // 普通 drawing 浮动图片（按锚点行号归属；同一 imageId 多锚点时只取首个，避免重复副本）
    // 仅保留锚定在产品行的浮动图片；锚定在标题/logo 等非产品行的丢弃
    const placedImageIds = new Set<number>();
    for (const worksheet of workbook.worksheets) {
      const placements = worksheet.getImages();
      for (let index = 0; index < placements.length; index++) {
        const placement = placements[index];
        const imageId = Number(placement.imageId);
        if (placedImageIds.has(imageId)) continue;
        placedImageIds.add(imageId);
        const nativeRow = Number((placement.range as any)?.tl?.nativeRow);
        const rowNo = Number.isInteger(nativeRow) && nativeRow >= 0 ? nativeRow + 1 : null;
        if (validRowNos.size > 0 && rowNo !== null && !validRowNos.has(rowNo)) continue; // 非产品行的浮动图跳过
        const media = workbook.getImage(Number(placement.imageId));
        const extension = String(media.extension || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'png';
        const buffer = Buffer.from(media.buffer as any);
        if (!buffer || buffer.length === 0) continue;
        const fileName = `excel-embedded-${crypto.randomUUID()}.${extension}`;
        const absolutePath = path.join(imageDir, fileName);
        fs.writeFileSync(absolutePath, buffer);
        rows.push({
          client_id: clientId,
          quote_id: quoteId,
          row_no: rowNo,
          file_name: `excel-row-${rowNo || 'order'}-image-${index + 1}.${extension}`,
          file_path: path.relative(repoRoot(), absolutePath).replace(/\\/g, '/'),
          mime_type: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
          size_bytes: buffer.length
        });
      }
    }

    if (rows.length > 0) await this.imageRepo.insertMany(rows);
    return rows.length;
  }

  private normalizeCell(v: any): any {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
      if ('result' in v) return v.result;
      if (v.richText && Array.isArray(v.richText)) {
        const text = v.richText.map((part: any) => String(part?.text || '')).join('');
        if (text) return text;
      }
      if (v.text != null) return v.text;
    }
    return v;
  }

  /** 行校验 + 重算公式列；返回该行的错误列表 */
  private validateAndComputeRow(row: ParsedRow, warehouseB2: string): RowError[] {
    const errs: RowError[] = [];
    const d = row.data;

    for (const f of FIELD_DICTIONARY) {
      let v = d[f.field_key];
      if (f.formula) continue; // 公式列不校验输入
      if (f.field_key === 'description' && (v === null || v === '' || v === undefined)) {
        d.description = String(d.product_cn || d.product_en || d.sku || '').trim();
        v = d.description;
      }
      if (f.required && (v === null || v === '' || v === undefined)) {
        errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: '必填' });
        continue;
      }
      if (v === null || v === '' || v === undefined) {
        // F 列（入仓号）为空时继承 B2
        if (f.field_key === 'warehouse_code_line') d[f.field_key] = warehouseB2;
        continue; // 非必填空 → 跳过后续校验
      }
      if (f.field_key === 'warehouse_code_line' && warehouseB2 && String(v).trim() !== warehouseB2) {
        errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: `与 B2 入仓号（${warehouseB2}）不一致` });
      }
      if (f.data_type === 'ENUM' && Array.isArray(f.enum_values)) {
        let sv = String(v).trim();
        if (!f.enum_values.includes(sv)) {
          if (f.field_key === 'material') {
            if (/不含电|不带电|无电|non[- ]?electric/i.test(sv)) sv = '不带电';
            else if (/含电池|带电池/i.test(sv)) sv = '含电池';
            else if (/带电|电池|electric|battery/i.test(sv)) sv = '带电';
            else sv = '其他';
          }
          if (!f.enum_values.includes(sv)) {
            errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: `必须是枚举值之一：${f.enum_values.join(' / ')}` });
          } else {
            d[f.field_key] = sv;
          }
        }
      }
      if (f.validation_pattern) {
        const re = new RegExp(f.validation_pattern);
        if (!re.test(String(v))) {
          errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: `格式不符（${f.validation_pattern}）` });
        }
      }
      if (f.data_type === 'INTEGER' || f.data_type === 'DECIMAL') {
        const num = Number(v);
        if (Number.isNaN(num)) {
          errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: '必须是数字' });
        } else {
          if (f.validation_min != null && num < f.validation_min)
            errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: `不能小于 ${f.validation_min}` });
          if (f.validation_max != null && num > f.validation_max)
            errs.push({ row: row.row_no, col_letter: f.col_letter, field_key: f.field_key, reason: `不能大于 ${f.validation_max}` });
          d[f.field_key] = num; // 归一化
        }
      }
    }

    // 业务交叉校验：毛重 ≥ 净重
    const nw = Number(d.nw_per_carton);
    const gw = Number(d.gw_per_carton);
    if (d.nw_per_carton !== null && d.nw_per_carton !== '' && d.nw_per_carton !== undefined
      && d.gw_per_carton !== null && d.gw_per_carton !== '' && d.gw_per_carton !== undefined
      && !Number.isNaN(nw) && !Number.isNaN(gw) && gw < nw) {
      errs.push({ row: row.row_no, col_letter: 'L', field_key: 'gw_per_carton', reason: '毛重不能小于净重' });
    }

    // 重算公式列（用已解析的数值）
    const h = Number(d.cartons);
    const i = Number(d.pcs_per_carton);
    const k = Number(d.nw_per_carton);
    const l = Number(d.gw_per_carton);
    const o = Number(d.length_cm);
    const p = Number(d.width_cm);
    const q = Number(d.height_cm);
    const t = Number(d.unit_price);

    d.total_pcs = (!Number.isNaN(h) && !Number.isNaN(i)) ? h * i : null;
    d.total_nw = (!Number.isNaN(h) && !Number.isNaN(k)) ? h * k : null;
    d.total_gw = (!Number.isNaN(h) && !Number.isNaN(l)) ? h * l : null;
    d.unit_cbm = (!Number.isNaN(o) && !Number.isNaN(p) && !Number.isNaN(q)) ? o * p * q / 1_000_000 : null;
    d.total_cbm = (!Number.isNaN(d.unit_cbm) && !Number.isNaN(h)) ? d.unit_cbm * h : null;
    d.total_price = (!Number.isNaN(t) && !Number.isNaN(d.total_pcs)) ? t * d.total_pcs : null;

    const source = row.source_totals;
    if (source?.total_pcs != null && Number.isFinite(d.total_pcs) && Math.abs(source.total_pcs - d.total_pcs) > 0.000001) {
      errs.push({ row: row.row_no, col_letter: 'J', field_key: 'total_pcs', reason: `原表总件数 ${source.total_pcs} 与重算结果 ${d.total_pcs} 不一致` });
    }
    if (source?.total_price != null && Number.isFinite(d.total_price) && Math.abs(source.total_price - d.total_price) > 0.02) {
      errs.push({ row: row.row_no, col_letter: 'U', field_key: 'total_price', reason: `原表金额 ${source.total_price} 与总件数×单价 ${d.total_price} 不一致` });
    }
    if (source?.total_cbm != null && Number.isFinite(d.total_cbm)) {
      const tolerance = Math.max(0.0001, Math.abs(source.total_cbm) * 0.001);
      if (Math.abs(source.total_cbm - d.total_cbm) > tolerance) {
        errs.push({ row: row.row_no, col_letter: 'S', field_key: 'total_cbm', reason: `原表 CBM ${source.total_cbm} 与尺寸重算结果 ${d.total_cbm} 不一致` });
      }
    }

    return errs;
  }

  private computeSummary(rows: ParsedRow[]) {
    let totalCbm = 0, totalGw = 0, totalNw = 0, totalPcs = 0, totalAmountRmb = 0;
    for (const r of rows) {
      totalCbm += Number(r.data.total_cbm) || 0;
      totalGw += Number(r.data.total_gw) || 0;
      totalNw += Number(r.data.total_nw) || 0;
      totalPcs += Number(r.data.total_pcs) || 0;
      totalAmountRmb += Number(r.data.total_price) || Number(r.data.unit_price) * Number(r.data.total_pcs) || 0;
    }
    return { totalCbm, totalGw, totalNw, totalPcs, totalAmountRmb };
  }

  private genQuoteNo() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `Q-${y}${m}${d}-${suffix}`;
  }
}
