import type { CurrencyCode } from './enums.js';
/** BRL 金额格式化
 *  支持巴西本地习惯 R$ 1.234,56 与国际习惯 BRL 1,234.56
 */
export type BRLFormatStyle = 'pt-BR' | 'en-US';
export declare function formatBRL(value: number, style?: BRLFormatStyle): string;
export declare function formatCurrency(value: number, currency: CurrencyCode): string;
export declare function formatRmb(value: number): string;
export declare function round2(value: number): number;
export declare function round4(value: number): number;
//# sourceMappingURL=currencies.d.ts.map