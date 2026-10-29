import { BadRequestException } from '@nestjs/common';

export interface RatesValues {
  ocean_freight_usd: number;
  port_fee_usd: number;
  br_clearance_brl: number;
  fx_rate: number;
  sales_tax_rate: number;
  sales_markup_rate: number;
  profit_brl: number;
}

/** 费率合法性：金额非负、汇率 > 0、销售税率在 [0,1) 内。 */
export function assertValidRates(v: RatesValues): void {
  const amounts = [v.ocean_freight_usd, v.port_fee_usd, v.br_clearance_brl, v.fx_rate, v.profit_brl];
  if (!amounts.every(n => Number.isFinite(n) && n >= 0) || v.fx_rate <= 0) {
    throw new BadRequestException('费率参数非法：金额必须为非负数且汇率大于 0');
  }
  if (!Number.isFinite(v.sales_tax_rate) || v.sales_tax_rate < 0 || v.sales_tax_rate >= 1) {
    throw new BadRequestException('销售税务必须在 0% 到 100% 之间');
  }
  if (!Number.isFinite(v.sales_markup_rate) || v.sales_markup_rate < 0 || v.sales_markup_rate >= 1) {
    throw new BadRequestException('税基利润加成必须在 0% 到 100% 之间');
  }
}
