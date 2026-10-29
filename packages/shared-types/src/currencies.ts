import type { CurrencyCode } from './enums.js';

/** BRL 金额格式化
 *  支持巴西本地习惯 R$ 1.234,56 与国际习惯 BRL 1,234.56
 */
export type BRLFormatStyle = 'pt-BR' | 'en-US';

export function formatBRL(value: number, style: BRLFormatStyle = 'en-US'): string {
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  };
  const locale = style === 'pt-BR' ? 'pt-BR' : 'en-US';
  const symbol = style === 'pt-BR' ? 'R$' : 'BRL';
  return `${symbol} ${value.toLocaleString(locale, opts)}`;
}

export function formatCurrency(value: number, currency: CurrencyCode): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatRmb(value: number): string {
  return `¥ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
