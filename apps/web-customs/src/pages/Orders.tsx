import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, ErrorMessage, Loading } from '../components/Feedback';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { api, errorMessage } from '../store/auth';
import type { OrderRow } from '../types';
import { brl, dateTime } from '../utils/format';

interface OrderList { items: OrderRow[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 15;

export default function Orders() {
  const { t } = useTranslation();
  const [data, setData] = useState<OrderList | null>(null);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (query) params.set('q', query);
    try { setData((await api.get<OrderList>(`/api/customs/orders?${params}`)).data); }
    catch (reason) { setError(errorMessage(reason, t('orders.loadError'))); }
    finally { setLoading(false); }
  }, [page, query, status]);
  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{t('orders.eyebrow')}</span><h1>{t('orders.title')}</h1><p>{t('orders.description')}</p></div></div>
      <section className="card filter-card" aria-label={t('orders.filtersLabel')}>
        <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(keyword.trim()); }}>
          <div className="field search-field"><label htmlFor="order-search">{t('orders.searchLabel')}</label><div className="input-with-icon"><Icon name="search" size={18} /><input id="order-search" className="form-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t('orders.searchPlaceholder')} /></div></div>
          <div className="field"><label htmlFor="order-status">{t('orders.statusLabel')}</label><select id="order-status" className="form-input" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">{t('orders.allStatuses')}</option><option value="pending">{t('status.review.pending')}</option><option value="approved">{t('status.review.approved')}</option><option value="changes_requested">{t('status.review.changes_requested')}</option></select></div>
          <div className="filter-actions"><button className="btn" type="submit" disabled={loading}><Icon name="search" size={17} />{t('orders.filter')}</button>{(query || status) && <button className="btn btn-ghost" type="button" onClick={() => { setKeyword(''); setQuery(''); setStatus(''); setPage(1); }}>{t('orders.clearFilters')}</button>}</div>
        </form>
      </section>
      {error && <ErrorMessage message={error} onRetry={load} />}
      <section className="card list-card" aria-labelledby="orders-list-title">
        <div className="card-title"><div><h2 id="orders-list-title">{t('orders.listTitle')}</h2><p>{data ? t('orders.found', { count: data.total }) : t('orders.querying')}</p></div><button className="icon-button" type="button" onClick={load} disabled={loading} aria-label={t('orders.refreshAria')}><Icon name="refresh" /></button></div>
        {loading && !data ? <Loading label={t('orders.loading')} /> : data?.items.length === 0 ? <Empty title={t('orders.emptyTitle')} description={t('orders.emptyDescription')} /> : data && <>
          <div className={`table-wrap${loading ? ' table-loading' : ''}`} aria-busy={loading}><table className="table orders-table"><thead><tr><th>{t('table.order')}</th><th>{t('table.diReview')}</th><th>{t('orders.version')}</th><th className="amount">{t('table.diTotal')}</th><th>{t('orders.customs')}</th><th>{t('table.updatedAt')}</th><th><span className="sr-only">{t('table.action')}</span></th></tr></thead><tbody>{data.items.map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.quote_no}</Link><small className="cell-note">{t('orders.createdAt', { date: dateTime(order.created_at) })}</small></td><td><StatusBadge value={order.customs_review?.status || 'pending'} kind="review" /></td><td>{order.customs_review?.di_review_version ? t('orders.versionValue', { version: order.customs_review.di_review_version }) : t('orders.noReview')}</td><td className="amount">{brl(order.di_total_brl ?? order.customs_review?.total_di_brl)}</td><td><StatusBadge value={order.shipment_stage} kind="stage" /></td><td>{dateTime(order.updated_at)}</td><td><Link className="table-action" to={`/orders/${order.id}`} aria-label={t('orders.openAria', { quote: order.quote_no })}>{t('orders.open')}<Icon name="arrow" size={16} /></Link></td></tr>)}</tbody></table></div>
          <nav className="pagination" aria-label={t('orders.paginationLabel')}><span>{t('orders.page', { page: data.page, total: totalPages })}</span><div><button className="btn btn-ghost btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{t('orders.previous')}</button><button className="btn btn-ghost btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>{t('orders.next')}</button></div></nav>
        </>}
      </section>
    </>
  );
}
