import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';

export type QuoteDecision = { value: 'accepted' | 'rejected'; at: string; by: string };
export interface PublishedQuote {
  version: number;
  published_at: string;
  expires_at: string;
  currency: 'BRL';
  declared_currency: string;
  amount: number;
  fx_rate: number | null;
  fees: Record<string, any>;
  input_hash: string;
  decision?: QuoteDecision;
}

export function quoteInputHash(order: { line_items?: unknown }) {
  return createHash('sha256').update(JSON.stringify(order.line_items ?? [])).digest('hex');
}

export function publishQuote(order: { quote_versions?: PublishedQuote[] | null; line_items?: unknown; declared_currency?: string }, pricing: { brl: number; breakdown: object }, now = new Date()) {
  const versions = order.quote_versions ?? [];
  const latest = versions.at(-1);
  if (latest?.decision?.value === 'accepted') {
    throw new ConflictException('Accepted quote terms are locked.');
  }
  const next: PublishedQuote = {
    version: (latest?.version ?? 0) + 1, published_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
    currency: 'BRL', declared_currency: order.declared_currency ?? 'RMB',
    amount: pricing.brl, fx_rate: (pricing.breakdown as any).fx_rate ?? null,
    fees: pricing.breakdown, input_hash: quoteInputHash(order)
  };
  return { quote_versions: [...versions, next],
    ...(latest?.decision?.value === 'rejected' ? { deal_status: 'open' as const, deal_closed_at: null, deal_note: null } : {}) };
}
