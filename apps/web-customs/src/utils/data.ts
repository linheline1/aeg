import type { DiAdditionalFee, DiAnalysis, DiItem } from '../types';

export function field(item: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) if (item[name] != null && item[name] !== '') return item[name];
  return undefined;
}

export function numeric(item: Record<string, unknown>, names: string[]): number | null {
  const value = Number(field(item, names));
  return field(item, names) == null || !Number.isFinite(value) ? null : value;
}

export function text(item: Record<string, unknown>, names: string[]): string {
  const value = field(item, names);
  return value == null ? '—' : String(value);
}

export function analysisValue(analysis: DiAnalysis | null, names: string[], items: DiItem[], itemNames: string[]): number | null {
  if (!analysis) return null;
  const totals = analysis.totals || {};
  const direct = numeric(totals, names) ?? numeric(analysis, names);
  if (direct != null) return direct;
  const values = items.map((item) => numeric(item, itemNames));
  return values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null;
}

export function additionalFeesTotal(fees: DiAdditionalFee[] = []): number {
  return fees.reduce((sum, fee) => {
    const amount = Number(fee.amount_brl);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

export function importTaxesValue(analysis: DiAnalysis | null, items: DiItem[]): number | null {
  if (!analysis) return null;
  const totals = analysis.totals || {};
  const importTaxes = numeric(totals, ['import_taxes_brl']);
  if (importTaxes != null) return importTaxes;
  const totalNames = ['di_brl', 'total_di_brl', 'di_total_brl'];
  const legacyTotal = numeric(totals, totalNames) ?? numeric(analysis, totalNames);
  if (legacyTotal != null) return legacyTotal - additionalFeesTotal(analysis.additional_fees);
  const values = items.map((item) => numeric(item, ['di_brl', 'total_brl', 'di_total_brl']));
  return values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null;
}

export function parameterValue(analysis: DiAnalysis | null, name: 'rmb_brl' | 'insurance_brl' | 'uf' | 'icms_rate' | 'freight_brl'): string | number {
  const parameters = analysis?.parameters || {};
  return field(parameters, [name]) as string | number ?? field(analysis || {}, [name]) as string | number ?? '';
}
