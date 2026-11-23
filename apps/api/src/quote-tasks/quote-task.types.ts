import type { DiParameters } from '../order/di-calculation';
import type { DdpFees } from '../upload/quote.service';

export type TaskKind = 'ncm' | 'di';
export type TaskStatus = 'queued' | 'running' | 'complete' | 'partial' | 'failed' | 'stale';
export type TaskError = { code: 'billing' | 'timeout' | 'invalid_result' | 'provider' | 'stale' | 'calculation'; message: string };
export type TaskRow = { fingerprint: string; suggestion?: any; error?: TaskError };
export type QuoteTask = {
  key: string;
  id: string;
  kind: TaskKind;
  target: string;
  clientId: string;
  fingerprint: string;
  orderVersion?: string;
  status: TaskStatus;
  input: { rows: any[]; images: any[]; currency?: 'RMB' | 'USD'; parameters?: DiParameters; rates?: DdpFees; automatic?: boolean; actor?: { username: string; role: string } };
  rows: Record<string, TaskRow>;
  result?: any;
  error?: TaskError;
  revision: number;
  leaseUntil?: number;
  updatedAt: number;
};
