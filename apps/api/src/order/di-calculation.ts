import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface DiParameters {
  rmb_brl: number;
  insurance_brl?: number;
  icms_rate: number;
  uf: string;
  freight_brl?: number;
}

export interface DiAdditionalFee {
  id: string;
  name: string;
  amount_brl: number;
  note?: string | null;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const numeric = (value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${label} inválido`);
  }
  return parsed;
};
const rate = (value: unknown, label: string) => numeric(value, label, 0, 0.999999);

function normalizeAdditionalFees(value: unknown): DiAdditionalFee[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new BadRequestException('Taxas adicionais inválidas');
  if (value.length > 30) throw new BadRequestException('A DI permite no máximo 30 taxas adicionais');
  return value.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(`Taxa adicional ${index + 1} inválida`);
    }
    const fee = input as Record<string, unknown>;
    const name = String(fee.name || '').trim();
    if (!name || name.length > 100) {
      throw new BadRequestException(`Nome da taxa adicional ${index + 1} é obrigatório e deve ter no máximo 100 caracteres`);
    }
    const amount = round(numeric(fee.amount_brl, `Valor da taxa ${name}`, 0, 1_000_000_000_000));
    const note = fee.note == null ? null : String(fee.note).trim();
    if (note && note.length > 200) {
      throw new BadRequestException(`Observação da taxa ${name} deve ter no máximo 200 caracteres`);
    }
    const id = /^[0-9a-f-]{36}$/i.test(String(fee.id || '')) ? String(fee.id) : crypto.randomUUID();
    return { id, name, amount_brl: amount, note: note || null };
  });
}

export function calculateDi(
  order: any,
  suggestions: any[],
  parameters: DiParameters,
  additionalFees: unknown = order.di_analysis?.additional_fees || []
) {
  const rmbBrl = numeric(parameters.rmb_brl, 'Taxa RMB/BRL', 0.000001);
  const insuranceTotal = numeric(parameters.insurance_brl ?? 0, 'Seguro');
  const icmsRate = rate(parameters.icms_rate, 'Alíquota ICMS');
  const uf = String(parameters.uf || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new BadRequestException('UF inválida');
  if (!Array.isArray(order.line_items) || order.line_items.length === 0) {
    throw new BadRequestException('O pedido não possui produtos para calcular a DI');
  }
  const defaultFreight = order.pricing_breakdown?.items?.find((i: any) => i.code === 'OCEAN_FREIGHT')?.amount;
  const freightTotal = numeric(parameters.freight_brl ?? defaultFreight ?? 0, 'Frete internacional');
  const merchandiseRmbTotal = order.line_items.reduce((sum: number, row: any) =>
    sum + (Number(row.total_price) || Number(row.unit_price) * Number(row.total_pcs) || 0), 0);
  const cbmTotal = order.line_items.reduce((sum: number, row: any) => sum + (Number(row.total_cbm) || 0), 0);
  const gwTotal = order.line_items.reduce((sum: number, row: any) => sum + (Number(row.total_gw) || 0), 0);
  const byRow = new Map(suggestions.map(item => [Number(item.row_no), item]));

  const items = order.line_items.map((row: any) => {
    const suggestion = byRow.get(Number(row.row_no));
    if (!suggestion) throw new BadRequestException(`NCM não informado para a linha ${row.row_no}`);
    const ncm = String(suggestion.ncm || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(ncm)) throw new BadRequestException(`NCM inválido na linha ${row.row_no}`);
    const merchandiseRmb = Number(row.total_price) || Number(row.unit_price) * Number(row.total_pcs) || 0;
    if (merchandiseRmb <= 0) {
      throw new BadRequestException(`Linha ${row.row_no} sem valor da mercadoria: informe o preço unitário ou total e recalcule a DI`);
    }
    const share = cbmTotal > 0 ? (Number(row.total_cbm) || 0) / cbmTotal
      : gwTotal > 0 ? (Number(row.total_gw) || 0) / gwTotal
      : merchandiseRmbTotal > 0 ? merchandiseRmb / merchandiseRmbTotal : 1 / order.line_items.length;
    const merchandiseBrl = merchandiseRmb * rmbBrl;
    const freightBrl = freightTotal * share;
    const insuranceBrl = insuranceTotal * share;
    const cifBrl = merchandiseBrl + freightBrl + insuranceBrl;
    const iiRate = rate(suggestion.ii_rate, `II linha ${row.row_no}`);
    const ipiRate = rate(suggestion.ipi_rate, `IPI linha ${row.row_no}`);
    const pisRate = rate(suggestion.pis_rate, `PIS linha ${row.row_no}`);
    const cofinsRate = rate(suggestion.cofins_rate, `COFINS linha ${row.row_no}`);
    const iiBrl = cifBrl * iiRate;
    const ipiBrl = (cifBrl + iiBrl) * ipiRate;
    const pisBrl = cifBrl * pisRate;
    const cofinsBrl = cifBrl * cofinsRate;
    const icmsBase = (cifBrl + iiBrl + ipiBrl + pisBrl + cofinsBrl) / (1 - icmsRate);
    const icmsBrl = icmsBase * icmsRate;
    const diBrl = iiBrl + ipiBrl + pisBrl + cofinsBrl + icmsBrl;
    return {
      row_no: Number(row.row_no), sku: row.sku || '', product_en: row.product_en || row.product_cn || '',
      previous_ncm: row.hs_code || null, ncm,
      confidence: Math.min(1, Math.max(0, Number(suggestion.confidence) || 0)),
      rationale: String(suggestion.rationale || '').slice(0, 2000),
      sources: Array.isArray(suggestion.sources) ? suggestion.sources.slice(0, 5) : [],
      ii_rate: iiRate, ipi_rate: ipiRate, pis_rate: pisRate, cofins_rate: cofinsRate,
      merchandise_rmb: round(merchandiseRmb), merchandise_brl: round(merchandiseBrl),
      freight_brl: round(freightBrl), insurance_brl: round(insuranceBrl), cif_brl: round(cifBrl),
      ii_brl: round(iiBrl), ipi_brl: round(ipiBrl), pis_brl: round(pisBrl),
      cofins_brl: round(cofinsBrl), icms_brl: round(icmsBrl), di_brl: round(diBrl)
    };
  });

  const sum = (key: string) => round(items.reduce((total: number, item: any) => total + item[key], 0));
  const fees = normalizeAdditionalFees(additionalFees);
  const additionalTotal = round(fees.reduce((total, fee) => total + fee.amount_brl, 0));
  const importTaxes = sum('di_brl');
  return {
    status: 'draft',
    parameters: { rmb_brl: rmbBrl, insurance_brl: insuranceTotal, icms_rate: icmsRate, uf, freight_brl: freightTotal },
    items,
    additional_fees: fees,
    totals: {
      merchandise_rmb: sum('merchandise_rmb'), merchandise_brl: sum('merchandise_brl'),
      freight_brl: sum('freight_brl'), insurance_brl: sum('insurance_brl'), cif_brl: sum('cif_brl'),
      ii_brl: sum('ii_brl'), ipi_brl: sum('ipi_brl'), pis_brl: sum('pis_brl'),
      cofins_brl: sum('cofins_brl'), icms_brl: sum('icms_brl'),
      import_taxes_brl: importTaxes,
      additional_fees_brl: additionalTotal,
      di_brl: round(importTaxes + additionalTotal)
    },
    created_at: new Date().toISOString()
  };
}
