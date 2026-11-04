import { useEffect, useRef, useState } from 'react';
import {
  INVOICE_FILTER_OPTIONS,
  ORDER_PERIOD_OPTIONS,
  ORDER_SORT_OPTIONS,
  ORDER_STATUS_OPTIONS,
  SHIPMENT_FILTER_OPTIONS,
  hasActiveOrderFilters,
  type InvoiceFilter,
  type OrderFilterState,
  type OrderPeriod,
  type OrderSort,
  type OrderStatusCounts,
  type OrderStatusFilter,
  type ShipmentFilter
} from '../lib/order-filters';

interface OrdersFilterBarProps {
  filters: OrderFilterState;
  counts: OrderStatusCounts;
  total: number;
  filteredCount: number;
  onChange: (next: OrderFilterState, replace?: boolean) => void;
  onClear: () => void;
}

const statusLabel = (value: OrderStatusFilter) =>
  ORDER_STATUS_OPTIONS.find(o => o.value === value)?.label || value;
const periodLabel = (value: OrderPeriod) =>
  ORDER_PERIOD_OPTIONS.find(o => o.value === value)?.label || value;
const shipmentLabel = (value: ShipmentFilter) =>
  SHIPMENT_FILTER_OPTIONS.find(o => o.value === value)?.label || value;
const invoiceLabel = (value: InvoiceFilter) =>
  INVOICE_FILTER_OPTIONS.find(o => o.value === value)?.label || value;

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12.8" y1="12.8" x2="17" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_CHIPS: { value: OrderStatusFilter; label: string; countKey: keyof OrderStatusCounts }[] = [
  { value: 'all', label: '全部', countKey: 'all' },
  { value: 'processing', label: '核算中', countKey: 'processing' },
  { value: 'done', label: '参考价已生成', countKey: 'done' },
  { value: 'failed', label: '失败', countKey: 'failed' }
];

export default function OrdersFilterBar({
  filters,
  counts,
  total,
  filteredCount,
  onChange,
  onClear
}: OrdersFilterBarProps) {
  const [query, setQuery] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryRef = useRef(filters.q);

  useEffect(() => {
    if (filters.q !== queryRef.current) {
      queryRef.current = filters.q;
      setQuery(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const patch = (next: Partial<OrderFilterState>, replace = false) =>
    onChange({ ...filters, ...next }, replace);

  const onQueryChange = (value: string) => {
    setQuery(value);
    queryRef.current = value;
    patch({ q: value }, true);
  };

  const active = hasActiveOrderFilters(filters);
  const activeChips: { key: keyof OrderFilterState; label: string; reset: Partial<OrderFilterState> }[] = [];
  if (filters.q.trim()) activeChips.push({ key: 'q', label: `关键词「${filters.q.trim()}」`, reset: { q: '' } });
  if (filters.status !== 'all') activeChips.push({ key: 'status', label: statusLabel(filters.status), reset: { status: 'all' } });
  if (filters.period !== 'all') activeChips.push({ key: 'period', label: periodLabel(filters.period), reset: { period: 'all' } });
  if (filters.shipment !== 'all') activeChips.push({ key: 'shipment', label: shipmentLabel(filters.shipment), reset: { shipment: 'all' } });
  if (filters.invoice !== 'all') activeChips.push({ key: 'invoice', label: invoiceLabel(filters.invoice), reset: { invoice: 'all' } });
  if (filters.sort !== 'created_desc') activeChips.push({ key: 'sort', label: ORDER_SORT_OPTIONS.find(o => o.value === filters.sort)?.label || filters.sort, reset: { sort: 'created_desc' } });

  const resetAll = () => {
    setQuery('');
    queryRef.current = '';
    onClear();
  };

  return (
    <>
      <div className="orders-filter-card">
        <div className="orders-filter-top">
          <div className="orders-search">
            <span className="orders-search-icon"><SearchIcon /></span>
            <input
              className="form-input"
              type="search"
              value={query}
              placeholder="搜索报价号或清单文件名"
              aria-label="搜索报价号或清单文件名"
              onChange={e => onQueryChange(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="orders-search-clear"
                aria-label="清除搜索"
                onClick={() => onQueryChange('')}
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost orders-filter-toggle"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
          >
            筛选{active ? ' · 已选' : ''}
          </button>

          <div className="orders-filter-fields">
            <label className="filter-field">
              <span>时间</span>
              <select
                className="form-input"
                value={filters.period}
                onChange={e => patch({ period: e.target.value as OrderPeriod })}
              >
                {ORDER_PERIOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>物流</span>
              <select
                className="form-input"
                value={filters.shipment}
                onChange={e => patch({ shipment: e.target.value as ShipmentFilter })}
              >
                {SHIPMENT_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>开票</span>
              <select
                className="form-input"
                value={filters.invoice}
                onChange={e => patch({ invoice: e.target.value as InvoiceFilter })}
              >
                {INVOICE_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>排序</span>
              <select
                className="form-input"
                value={filters.sort}
                onChange={e => patch({ sort: e.target.value as OrderSort })}
              >
                {ORDER_SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="orders-status-tabs" role="group" aria-label="按状态筛选">
          {STATUS_CHIPS.map(chip => {
            const selected = filters.status === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                className={`orders-filter-chip${selected ? ' active' : ''}`}
                aria-pressed={selected}
                onClick={() => patch({ status: chip.value })}
              >
                {chip.label}
                <span className="orders-filter-chip-count">{counts[chip.countKey]}</span>
              </button>
            );
          })}
        </div>

        <div className="orders-filter-foot">
          <span className="orders-result-text">
            {active ? `显示 ${filteredCount} / ${total} 条报价` : `共 ${total} 条报价`}
          </span>
          {active && (
            <div className="orders-filter-active">
              {activeChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  className="orders-filter-tag"
                  onClick={() => {
                    if (chip.key === 'q') {
                      setQuery('');
                      queryRef.current = '';
                    }
                    patch(chip.reset);
                  }}
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">移除该条件</span>
                </button>
              ))}
              <button type="button" className="btn-link" onClick={resetAll}>清除全部</button>
            </div>
          )}
        </div>
      </div>

      {sheetOpen && (
        <div className="filter-sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <div
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="筛选报价"
            onClick={e => e.stopPropagation()}
          >
            <div className="filter-sheet-head">
              <strong>筛选报价</strong>
              <button type="button" className="btn-link" onClick={() => setSheetOpen(false)}>关闭</button>
            </div>

            <label className="filter-field filter-field-block">
              <span>时间</span>
              <select
                className="form-input"
                value={filters.period}
                onChange={e => patch({ period: e.target.value as OrderPeriod })}
              >
                {ORDER_PERIOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>物流</span>
              <select
                className="form-input"
                value={filters.shipment}
                onChange={e => patch({ shipment: e.target.value as ShipmentFilter })}
              >
                {SHIPMENT_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>开票</span>
              <select
                className="form-input"
                value={filters.invoice}
                onChange={e => patch({ invoice: e.target.value as InvoiceFilter })}
              >
                {INVOICE_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>排序</span>
              <select
                className="form-input"
                value={filters.sort}
                onChange={e => patch({ sort: e.target.value as OrderSort })}
              >
                {ORDER_SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <div className="filter-sheet-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  resetAll();
                  setSheetOpen(false);
                }}
              >
                重置
              </button>
              <button type="button" className="btn" onClick={() => setSheetOpen(false)}>
                查看 {filteredCount} 条结果
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
