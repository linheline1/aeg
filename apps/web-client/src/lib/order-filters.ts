export type OrderStatusFilter = 'all' | 'processing' | 'done' | 'failed';
export type OrderPeriod = 'all' | '7d' | '30d' | '90d';
export type ShipmentFilter = 'all' | 'unassigned' | 'in_transit' | 'arrived' | 'customs_br' | 'cleared' | 'delivered';
export type InvoiceFilter = 'all' | 'selected' | 'missing';
export type OrderSort = 'created_desc' | 'created_asc' | 'ddp_desc' | 'ddp_asc' | 'eta_asc';

export interface OrderFilterState {
  q: string;
  status: OrderStatusFilter;
  period: OrderPeriod;
  shipment: ShipmentFilter;
  invoice: InvoiceFilter;
  sort: OrderSort;
}

export interface FilterableOrder {
  quote_no: string;
  input_file_name?: string | null;
  status: string;
  total_amount_brl?: number | null;
  shipment_stage?: string | null;
  shipment_eta?: string | null;
  invoice_cnpj?: { id?: string; cnpj?: string; company_name?: string } | null;
  created_at: string;
}

export interface OrderStatusCounts {
  all: number;
  processing: number;
  done: number;
  failed: number;
}

export const DEFAULT_ORDER_FILTERS: OrderFilterState = {
  q: '',
  status: 'all',
  period: 'all',
  shipment: 'all',
  invoice: 'all',
  sort: 'created_desc'
};

const STATUS_VALUES: OrderStatusFilter[] = ['all', 'processing', 'done', 'failed'];
const PERIOD_VALUES: OrderPeriod[] = ['all', '7d', '30d', '90d'];
const SHIPMENT_VALUES: ShipmentFilter[] = ['all', 'unassigned', 'in_transit', 'arrived', 'customs_br', 'cleared', 'delivered'];
const INVOICE_VALUES: InvoiceFilter[] = ['all', 'selected', 'missing'];
const SORT_VALUES: OrderSort[] = ['created_desc', 'created_asc', 'ddp_desc', 'ddp_asc', 'eta_asc'];

export const ORDER_STATUS_OPTIONS: { value: OrderStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '核算中' },
  { value: 'done', label: '参考价已生成' },
  { value: 'failed', label: '失败' }
];

export const ORDER_PERIOD_OPTIONS: { value: OrderPeriod; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: '90d', label: '最近 90 天' }
];

export const SHIPMENT_FILTER_OPTIONS: { value: ShipmentFilter; label: string }[] = [
  { value: 'all', label: '全部物流' },
  { value: 'unassigned', label: '未安排物流' },
  { value: 'in_transit', label: '运输中' },
  { value: 'arrived', label: '已到港' },
  { value: 'customs_br', label: '巴西清关中' },
  { value: 'cleared', label: '已缴税 / 已放行' },
  { value: 'delivered', label: '已签收' }
];

export const INVOICE_FILTER_OPTIONS: { value: InvoiceFilter; label: string }[] = [
  { value: 'all', label: '全部开票状态' },
  { value: 'selected', label: '已选择开票公司' },
  { value: 'missing', label: '未选择开票公司' }
];

export const ORDER_SORT_OPTIONS: { value: OrderSort; label: string }[] = [
  { value: 'created_desc', label: '最新上传' },
  { value: 'created_asc', label: '最早上传' },
  { value: 'ddp_desc', label: 'DDP 从高到低' },
  { value: 'ddp_asc', label: 'DDP 从低到高' },
  { value: 'eta_asc', label: '预计到港从近到远' }
];

const oneOf = <T extends string>(value: string | null, allowed: T[], fallback: T): T =>
  value && allowed.includes(value as T) ? value as T : fallback;

export function parseOrderFilters(params: URLSearchParams): OrderFilterState {
  return {
    q: (params.get('q') || '').slice(0, 100),
    status: oneOf(params.get('status'), STATUS_VALUES, DEFAULT_ORDER_FILTERS.status),
    period: oneOf(params.get('period'), PERIOD_VALUES, DEFAULT_ORDER_FILTERS.period),
    shipment: oneOf(params.get('shipment'), SHIPMENT_VALUES, DEFAULT_ORDER_FILTERS.shipment),
    invoice: oneOf(params.get('invoice'), INVOICE_VALUES, DEFAULT_ORDER_FILTERS.invoice),
    sort: oneOf(params.get('sort'), SORT_VALUES, DEFAULT_ORDER_FILTERS.sort)
  };
}

export function toOrderSearchParams(filters: OrderFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim().slice(0, 100));
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.period !== 'all') params.set('period', filters.period);
  if (filters.shipment !== 'all') params.set('shipment', filters.shipment);
  if (filters.invoice !== 'all') params.set('invoice', filters.invoice);
  if (filters.sort !== 'created_desc') params.set('sort', filters.sort);
  return params;
}

/** 是否有激活的过滤条件（排序不算过滤：仅改排序不应显示“筛选中”提示） */
export function hasActiveOrderFilters(filters: OrderFilterState): boolean {
  return filters.q.trim() !== ''
    || filters.status !== 'all'
    || filters.period !== 'all'
    || filters.shipment !== 'all'
    || filters.invoice !== 'all';
}

export function matchesOrderFilters(order: FilterableOrder, filters: OrderFilterState): boolean {
  const query = filters.q.trim().toLowerCase();
  if (query) {
    const haystack = `${order.quote_no || ''} ${order.input_file_name || ''}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (filters.status === 'done' && order.status !== 'done') return false;
  if (filters.status === 'failed' && order.status !== 'failed') return false;
  if (filters.status === 'processing' && !['uploaded', 'validating', 'pending_fee', 'computing'].includes(order.status)) return false;

  if (filters.period !== 'all') {
    const days = filters.period === '7d' ? 7 : filters.period === '30d' ? 30 : 90;
    const created = new Date(order.created_at).getTime();
    if (!Number.isFinite(created) || created < Date.now() - days * 24 * 60 * 60 * 1000) return false;
  }

  const stage = order.shipment_stage || '';
  if (filters.shipment === 'unassigned' && stage) return false;
  if (filters.shipment === 'in_transit' && !['booked', 'loaded', 'customs_cn', 'departed', 'on_water'].includes(stage)) return false;
  if (filters.shipment === 'arrived' && stage !== 'arrived') return false;
  if (filters.shipment === 'customs_br' && !['customs_br', 'duty_paid'].includes(stage)) return false;
  if (filters.shipment === 'cleared' && stage !== 'cleared') return false;
  if (filters.shipment === 'delivered' && stage !== 'delivered') return false;

  const hasInvoice = !!(order.invoice_cnpj && (order.invoice_cnpj.id || order.invoice_cnpj.cnpj));
  if (filters.invoice === 'selected' && !hasInvoice) return false;
  if (filters.invoice === 'missing' && hasInvoice) return false;

  return true;
}

export function countOrderStatuses(orders: FilterableOrder[]): OrderStatusCounts {
  return orders.reduce<OrderStatusCounts>((counts, order) => {
    counts.all += 1;
    if (order.status === 'done') counts.done += 1;
    else if (order.status === 'failed') counts.failed += 1;
    else counts.processing += 1;
    return counts;
  }, { all: 0, processing: 0, done: 0, failed: 0 });
}

export function sortOrders<T extends FilterableOrder>(orders: T[], sort: OrderSort): T[] {
  const amount = (order: T) => order.total_amount_brl == null ? null : Number(order.total_amount_brl);
  const created = (order: T) => new Date(order.created_at).getTime() || 0;
  const eta = (order: T) => {
    const value = order.shipment_eta ? new Date(order.shipment_eta).getTime() : Number.POSITIVE_INFINITY;
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return [...orders].sort((a, b) => {
    if (sort === 'created_asc') return created(a) - created(b);
    if (sort === 'ddp_desc' || sort === 'ddp_asc') {
      const av = amount(a);
      const bv = amount(b);
      if (av == null && bv == null) return created(b) - created(a);
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort === 'ddp_desc' ? bv - av : av - bv;
    }
    if (sort === 'eta_asc') {
      const delta = eta(a) - eta(b);
      return delta !== 0 ? delta : created(b) - created(a);
    }
    return created(b) - created(a);
  });
}
