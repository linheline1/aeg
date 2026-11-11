import { useDeferredValue, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import PriceReferenceNote from '../components/PriceReferenceNote';
import OrdersFilterBar from '../components/OrdersFilterBar';
import {
  DEFAULT_ORDER_FILTERS,
  countOrderStatuses,
  hasActiveOrderFilters,
  matchesOrderFilters,
  parseOrderFilters,
  sortOrders,
  toOrderSearchParams,
  type OrderFilterState
} from '../lib/order-filters';

interface QuoteOrder {
  id: string;
  quote_no: string;
  template_version: string;
  status: string;
  total_amount_brl?: number | null;
  total_amount_usd?: number | null;
  total_amount_rmb?: number | null;
  declared_currency?: 'RMB' | 'USD';
  total_pcs?: number | null;
  total_cbm?: number | null;
  input_file_name?: string | null;
  converted_by_ai?: boolean;
  ai_notes?: string | null;
  /** 金额是否为参考预估（接口未返回时按参考处理） */
  price_is_reference?: boolean;
  /** M7：物流摘要 */
  shipment_stage?: string | null;
  shipment_eta?: string | null;
  invoice_cnpj?: { id?: string; cnpj?: string; company_name?: string } | null;
  created_at: string;
  updated_at?: string;
}

const fmtBRL = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (n: number) =>
  'US$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

/** ≤640px 视为移动端：报价列表切换为卡片流，避免 10 列表格横向滚动 */
const MOBILE_MQ = '(max-width: 640px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_MQ).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export default function Orders() {
  const { t } = useTranslation();
  const [list, setList] = useState<QuoteOrder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const loadSeq = useRef(0);
  const load = useCallback(() => {
    setErr(null);
    const seq = ++loadSeq.current;
    api.get('/api/client/orders')
      .then(r => {
        if (seq !== loadSeq.current) return;
        setList([...(r.data as QuoteOrder[])].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      })
      .catch(e => {
        if (seq !== loadSeq.current) return;
        setErr(getApiErrorMessage(e, t('orders.loadError')));
      });
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filters = useMemo(() => parseOrderFilters(searchParams), [searchParams]);
  const deferredQuery = useDeferredValue(filters.q);
  const effectiveFilters = useMemo<OrderFilterState>(
    () => ({ ...filters, q: deferredQuery }),
    [filters, deferredQuery]
  );

  const counts = useMemo(() => countOrderStatuses(list || []), [list]);
  const visible = useMemo(
    () => sortOrders((list || []).filter(o => matchesOrderFilters(o, effectiveFilters)), effectiveFilters.sort),
    [list, effectiveFilters]
  );

  const applyFilters = (next: OrderFilterState, replace = false) => {
    const params = toOrderSearchParams(next);
    setSearchParams(params, { replace });
  };

  const latest = list && list.length > 0
    ? list.reduce((a, b) =>
        (a.updated_at || a.created_at) > (b.updated_at || b.created_at) ? a : b
      )
    : null;

  const filtering = hasActiveOrderFilters(filters);

  return (
    <>
      <div className="page-head">
        <h1>{t('orders.title')}</h1>
        <p className="sub">{t('orders.subtitle')}</p>
      </div>

      {err && (
        <div className="alert alert-err row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>{t('orders.loadFailed')}：{err}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={load}>{t('orders.retry')}</button>
        </div>
      )}

      {list === null && !err && (
        <div className="quote-grid">
          {[0, 1, 2].map(i => <div className="quote-card sk" key={i} />)}
        </div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="orders-stats">
            <span className="stat-chip">{t('orders.total', { count: list.length })}</span>
            {latest && (
              <span className="stat-chip">{t('orders.lastUpdated', { time: fmtTime(latest.updated_at || latest.created_at) })}</span>
            )}
          </div>

          <OrdersFilterBar
            filters={filters}
            counts={counts}
            total={list.length}
            filteredCount={visible.length}
            onChange={applyFilters}
            onClear={() => applyFilters(DEFAULT_ORDER_FILTERS)}
          />

          <PriceReferenceNote className="price-ref-note-mb" />

          {visible.length === 0 ? (
            <div className="card empty-state">
              <p className="empty-title">{t('orders.noFiltered')}</p>
              <p className="muted">{t('orders.noFilteredHint')}</p>
              <button type="button" className="btn btn-ghost" onClick={() => applyFilters(DEFAULT_ORDER_FILTERS, true)}>{t('orders.clearFilters')}</button>
            </div>
          ) : isMobile ? (
            <div className="quote-grid">
              {visible.map(o => (
                <Link className="quote-card" to={`/orders/${o.id}`} key={o.id}>
                  <div className="quote-head">
                    <strong>{o.quote_no}</strong>
                    <span className={`status-tag status-${o.status}`}>{t(`status.${o.status}`, { defaultValue: o.status })}</span>
                  </div>
                  <div className="quote-file" title={o.input_file_name || ''}>{o.input_file_name || t('orders.packingList')}</div>
                  {o.converted_by_ai && (
                    <span className="quote-ai-tag" title={o.ai_notes || t('orders.aiTitle')}>{t('orders.aiConverted')}</span>
                  )}
                  {o.status === 'done' && o.total_amount_brl != null && (
                    <div className="quote-amt-block">
                      <div className="quote-amt-label">{t('orders.ddpTotal')}</div>
                      <span className="quote-amt">{fmtBRL(o.total_amount_brl)}</span>
                    </div>
                  )}
                  {o.status === 'done' && o.total_amount_usd != null && (
                    <div className="quote-usd-row">
                      <span className="quote-usd-label">{t('orders.freight')}</span>
                      <span className="quote-usd">{fmtUSD(o.total_amount_usd)}</span>
                    </div>
                  )}
                  <div className="quote-foot">
                    <span>{fmtTime(o.created_at)}</span>
                    <span>{o.shipment_stage ? t(`shipment.${o.shipment_stage}`, { defaultValue: o.shipment_stage }) : ''}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 1180, margin: 0 }}>
                  <thead>
                    <tr>
                      <th>{t('orders.columns.quote')}</th><th>{t('orders.columns.uploadedAt')}</th><th>{t('orders.columns.pieces')}</th><th>CBM</th><th>{t('orders.columns.value')}</th>
                      <th>{t('orders.freight')}</th><th>{t('orders.ddpTotal')}</th><th>{t('orders.columns.status')}</th><th>{t('orders.columns.shipping')}</th><th className="actions-col">{t('orders.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(o => (
                      <tr key={o.id}>
                        <td>
                          <Link to={`/orders/${o.id}`}><strong>{o.quote_no}</strong></Link>
                          <div className="muted text-sm" title={o.input_file_name || ''}>{o.input_file_name || t('orders.packingList')}</div>
                          {o.converted_by_ai && (
                            <span className="quote-ai-tag" title={o.ai_notes || t('orders.aiTitle')}>{t('orders.aiConverted')}</span>
                          )}
                        </td>
                        <td>{fmtTime(o.created_at)}</td>
                        <td>{o.total_pcs == null ? '—' : o.total_pcs.toLocaleString()}</td>
                        <td>{o.total_cbm == null ? '—' : o.total_cbm.toFixed(4)}</td>
                        <td>
                          {o.total_amount_rmb == null ? '—' : `${o.total_amount_rmb.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} RMB`}
                          {o.declared_currency === 'USD' && <div className="muted text-sm">{t('orders.usdConverted')}</div>}
                        </td>
                        <td>{o.status === 'done' && o.total_amount_usd != null ? fmtUSD(o.total_amount_usd) : '—'}</td>
                        <td>
                          {o.status === 'done' && o.total_amount_brl != null
                            ? <><strong>{fmtBRL(o.total_amount_brl)}</strong><span className="ref-tag">{t('common.reference')}</span></>
                            : '—'}
                        </td>
                        <td><span className={`status-tag status-${o.status}`}>{t(`status.${o.status}`, { defaultValue: o.status })}</span></td>
                        <td>
                          {o.shipment_stage ? (
                            <>
                              <span className="ship-stage-chip">{t(`shipment.${o.shipment_stage}`, { defaultValue: o.shipment_stage })}</span>
                              {o.shipment_eta && <div className="muted text-sm">ETA {o.shipment_eta.slice(0, 10)}</div>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="actions-col"><Link className="btn btn-sm btn-ghost" to={`/orders/${o.id}`}>{t('orders.viewDetails')}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filtering && visible.length > 0 && (
            <p className="orders-filter-hint muted text-sm">{t('orders.filterSaved')}</p>
          )}
        </>
      )}

      {list && list.length === 0 && !err && (
        <div className="card empty-state">
          <p className="empty-title">{t('orders.emptyTitle')}</p>
          <p className="muted">{t('orders.emptyDescription')}</p>
          <Link className="btn" to="/workbench">{t('orders.goUpload')}</Link>
        </div>
      )}
    </>
  );
}
