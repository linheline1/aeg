import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  INVOICE_FILTER_OPTIONS,
  ORDER_PERIOD_OPTIONS,
  ORDER_SORT_OPTIONS,
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12.8" y1="12.8" x2="17" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const STATUS_CHIPS: { value: OrderStatusFilter; countKey: keyof OrderStatusCounts }[] = [
  { value: 'all', countKey: 'all' },
  { value: 'processing', countKey: 'processing' },
  { value: 'done', countKey: 'done' },
  { value: 'failed', countKey: 'failed' }
];

export default function OrdersFilterBar({
  filters,
  counts,
  total,
  filteredCount,
  onChange,
  onClear
}: OrdersFilterBarProps) {
  const { t } = useTranslation();
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

  // 筛选状态本来就体现在 URL 中（刷新可恢复），统一 replace，避免浏览器返回键逐条回退
  const patch = (next: Partial<OrderFilterState>, replace = true) =>
    onChange({ ...filters, ...next }, replace);

  const onQueryChange = (value: string) => {
    setQuery(value);
    queryRef.current = value;
    patch({ q: value }, true);
  };

  const active = hasActiveOrderFilters(filters);
  const activeChips: { key: keyof OrderFilterState; label: string; reset: Partial<OrderFilterState> }[] = [];
  if (filters.q.trim()) activeChips.push({ key: 'q', label: t('filters.keyword', { value: filters.q.trim() }), reset: { q: '' } });
  if (filters.status !== 'all') activeChips.push({ key: 'status', label: t(`filters.status.${filters.status}`), reset: { status: 'all' } });
  if (filters.period !== 'all') activeChips.push({ key: 'period', label: t(`filters.period.${filters.period}`), reset: { period: 'all' } });
  if (filters.shipment !== 'all') activeChips.push({ key: 'shipment', label: t(`filters.shipment.${filters.shipment}`), reset: { shipment: 'all' } });
  if (filters.invoice !== 'all') activeChips.push({ key: 'invoice', label: t(`filters.invoice.${filters.invoice}`), reset: { invoice: 'all' } });
  if (filters.sort !== 'created_desc') activeChips.push({ key: 'sort', label: t(`filters.sort.${filters.sort}`), reset: { sort: 'created_desc' } });

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
              placeholder={t('filters.searchPlaceholder')}
              aria-label={t('filters.searchPlaceholder')}
              onChange={e => onQueryChange(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="orders-search-clear"
                aria-label={t('filters.clearSearch')}
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
            {t('filters.filter')}{active ? ` · ${t('filters.selected')}` : ''}
          </button>

          <div className="orders-filter-fields">
            <label className="filter-field">
              <span>{t('filters.time')}</span>
              <select
                className="form-input"
                value={filters.period}
                onChange={e => patch({ period: e.target.value as OrderPeriod })}
              >
                {ORDER_PERIOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.period.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t('filters.shipping')}</span>
              <select
                className="form-input"
                value={filters.shipment}
                onChange={e => patch({ shipment: e.target.value as ShipmentFilter })}
              >
                {SHIPMENT_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.shipment.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t('filters.invoiceLabel')}</span>
              <select
                className="form-input"
                value={filters.invoice}
                onChange={e => patch({ invoice: e.target.value as InvoiceFilter })}
              >
                {INVOICE_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.invoice.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t('filters.sortLabel')}</span>
              <select
                className="form-input"
                value={filters.sort}
                onChange={e => patch({ sort: e.target.value as OrderSort })}
              >
                {ORDER_SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.sort.${o.value}`)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="orders-status-tabs" role="group" aria-label={t('filters.statusAria')}>
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
                {t(`filters.status.${chip.value}`)}
                <span className="orders-filter-chip-count">{counts[chip.countKey]}</span>
              </button>
            );
          })}
        </div>

        <div className="orders-filter-foot">
          <span className="orders-result-text">
            {active ? t('filters.resultFiltered', { filtered: filteredCount, total }) : t('filters.resultTotal', { total })}
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
                  <span className="sr-only">{t('filters.removeCondition')}</span>
                </button>
              ))}
              <button type="button" className="btn-link" onClick={resetAll}>{t('filters.clearAll')}</button>
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
            aria-label={t('filters.dialogTitle')}
            onClick={e => e.stopPropagation()}
          >
            <div className="filter-sheet-head">
              <strong>{t('filters.dialogTitle')}</strong>
              <button type="button" className="btn-link" onClick={() => setSheetOpen(false)}>{t('filters.close')}</button>
            </div>

            <label className="filter-field filter-field-block">
              <span>{t('filters.time')}</span>
              <select
                className="form-input"
                value={filters.period}
                onChange={e => patch({ period: e.target.value as OrderPeriod })}
              >
                {ORDER_PERIOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.period.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>{t('filters.shipping')}</span>
              <select
                className="form-input"
                value={filters.shipment}
                onChange={e => patch({ shipment: e.target.value as ShipmentFilter })}
              >
                {SHIPMENT_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.shipment.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>{t('filters.invoiceLabel')}</span>
              <select
                className="form-input"
                value={filters.invoice}
                onChange={e => patch({ invoice: e.target.value as InvoiceFilter })}
              >
                {INVOICE_FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.invoice.${o.value}`)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-field-block">
              <span>{t('filters.sortLabel')}</span>
              <select
                className="form-input"
                value={filters.sort}
                onChange={e => patch({ sort: e.target.value as OrderSort })}
              >
                {ORDER_SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{t(`filters.sort.${o.value}`)}</option>
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
                {t('filters.reset')}
              </button>
              <button type="button" className="btn" onClick={() => setSheetOpen(false)}>
                {t('filters.viewResults', { count: filteredCount })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
