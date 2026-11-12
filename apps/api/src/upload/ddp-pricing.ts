import { BadRequestException } from '@nestjs/common';

export const DEFAULT_SALES_TAX_RATE = 0.065;
export const DEFAULT_SALES_MARKUP_RATE = 0.20;
export const DEFAULT_PROFIT_BRL = 30000;

export interface DdpPricingInput {
  oceanFreightUsd: number;
  portFeeUsd: number;
  /** 巴西本地拖车费（BRL，按柜） */
  brazilTruckingBrl: number;
  fxRate: number;
  /** DI 分析中的申报货值，BRL。 */
  merchandiseBrl: number;
  diBrl: number;
  salesMarkupRate: number;
  salesTaxRate: number;
  profitBrl: number;
  diReviewVersion?: number | null;
}

export interface DdpPricingBreakdown {
  currency: 'BRL';
  fx_rate: number;
  is_reference: true;
  calculation_version: 'ddp_v4';
  merchandise_brl: number;
  di_brl: number;
  di_review_version: number | null;
  sales_markup_rate: number;
  sales_markup_brl: number;
  tax_base_brl: number;
  sales_tax_rate: number;
  sales_tax_brl: number;
  profit_brl: number;
  ocean_freight_brl: number;
  port_fee_brl: number;
  br_trucking_brl: number;
  brazil_total_brl: number;
  items: { code: string; name: string; amount: number; note?: string }[];
  total: number;
  generated_at: string;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

/**
 * 销售税基 = (DI + 申报货值) × (1 + 20%) + 国际运费
 * 税务 = 税基 × 6.5%
 * 参考 DDP = 税务 + DI + 国际运费 + 其他成本（起运港杂费 + 巴西本地拖车费）+ 固定利润
 */
export function calculateDdpPricing(input: DdpPricingInput): {
  brl: number;
  usd: number;
  breakdown: DdpPricingBreakdown;
} {
  const {
    oceanFreightUsd, portFeeUsd, brazilTruckingBrl, fxRate, merchandiseBrl, diBrl,
    salesMarkupRate, salesTaxRate, profitBrl
  } = input;
  if (![oceanFreightUsd, portFeeUsd, brazilTruckingBrl, fxRate, merchandiseBrl, diBrl, salesMarkupRate, salesTaxRate, profitBrl].every(finiteNonNegative) || fxRate <= 0) {
    throw new BadRequestException('DDP 计价参数非法：金额必须为非负数且汇率大于 0');
  }
  if (salesTaxRate >= 1) throw new BadRequestException('销售税务必须在 0% 到 100% 之间');
  if (salesMarkupRate >= 1) throw new BadRequestException('税基利润加成必须在 0% 到 100% 之间');

  const oceanFreightBrl = round(oceanFreightUsd * fxRate);
  const portFeeBrl = round(portFeeUsd * fxRate);
  const truckingBrl = round(brazilTruckingBrl);
  const merchandise = round(merchandiseBrl);
  const di = round(diBrl);
  const markupBrl = round((merchandise + di) * salesMarkupRate);
  const taxBaseBrl = round(di + merchandise + markupBrl + oceanFreightBrl);
  const salesTaxBrl = round(taxBaseBrl * salesTaxRate);
  const profit = round(profitBrl);
  const brazilTotalBrl = round(salesTaxBrl + di + truckingBrl + profit);
  const total = round(salesTaxBrl + di + oceanFreightBrl + portFeeBrl + truckingBrl + profit);
  const reviewVersion = Number.isInteger(input.diReviewVersion) && Number(input.diReviewVersion) > 0
    ? Number(input.diReviewVersion)
    : null;
  const taxRateLabel = round(salesTaxRate * 10000) / 100;
  const markupRateLabel = round(salesMarkupRate * 10000) / 100;

  return {
    brl: total,
    usd: round(oceanFreightUsd),
    breakdown: {
      currency: 'BRL',
      fx_rate: fxRate,
      is_reference: true,
      calculation_version: 'ddp_v4',
      merchandise_brl: merchandise,
      di_brl: di,
      di_review_version: reviewVersion,
      sales_markup_rate: salesMarkupRate,
      sales_markup_brl: markupBrl,
      tax_base_brl: taxBaseBrl,
      sales_tax_rate: salesTaxRate,
      sales_tax_brl: salesTaxBrl,
      profit_brl: profit,
      ocean_freight_brl: oceanFreightBrl,
      port_fee_brl: portFeeBrl,
      br_trucking_brl: truckingBrl,
      brazil_total_brl: brazilTotalBrl,
      items: [
        { code: 'OCEAN_FREIGHT', name: '国际海运费', amount: oceanFreightBrl, note: `USD${oceanFreightUsd}/柜 × 汇率 ${fxRate}` },
        { code: 'PORT_FEE_ORIGIN', name: '其他成本费用（起运港）', amount: portFeeBrl, note: '单证 + 码头 + 拖车 + 操作' },
        { code: 'BR_LOCAL_TRUCKING', name: '巴西本地拖车费', amount: truckingBrl, note: '巴西港口 → 仓库/门点（每柜，BRL）' },
        { code: 'BR_IMPORT_DI', name: '巴西进口税费预估（DI）', amount: di, note: 'AI NCM 税率经系统计算，报关行复核后确认' },
        {
          code: 'BR_SALES_TAX',
          name: `销售税务（${taxRateLabel}%）`,
          amount: salesTaxBrl,
          note: `税基=(DI + 货值 ${merchandise.toFixed(2)} + ${markupRateLabel}% 加成 ${markupBrl.toFixed(2)} + 国际运费 ${oceanFreightBrl.toFixed(2)}) × ${taxRateLabel}%`
        },
        { code: 'BR_PROFIT', name: '参考利润', amount: profit, note: '每票固定 BRL 利润' }
      ],
      total,
      generated_at: new Date().toISOString()
    }
  };
}
