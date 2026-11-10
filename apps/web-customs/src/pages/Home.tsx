import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, ErrorMessage, Loading } from '../components/Feedback';
import Icon, { type IconName } from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { api, errorMessage } from '../store/auth';
import type { OrderRow } from '../types';
import { brl, dateTime } from '../utils/format';

interface HomeData {
  counts: { pending: number; approved: number; changes_requested: number; customs_in_progress: number; cleared: number };
  recent: OrderRow[];
}

const cards: Array<{ key: keyof HomeData['counts']; icon: IconName; tone: string }> = [
  { key: 'pending', icon: 'clock', tone: 'amber' },
  { key: 'approved', icon: 'check', tone: 'green' },
  { key: 'changes_requested', icon: 'alert', tone: 'red' },
  { key: 'customs_in_progress', icon: 'ship', tone: 'blue' },
  { key: 'cleared', icon: 'orders', tone: 'slate' }
];

export default function Home() {
  const { t } = useTranslation();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.get<HomeData>('/api/customs/home')).data); }
    catch (reason) { setError(errorMessage(reason, t('home.loadError'))); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{t('home.eyebrow')}</span><h1>{t('home.title')}</h1><p>{t('home.description')}</p></div><Link className="btn" to="/orders">{t('home.viewAll')}<Icon name="arrow" size={18} /></Link></div>
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && !data ? <Loading label={t('home.loading')} /> : data && <>
        <section className="stats-grid" aria-label={t('home.summaryLabel')}>
          {cards.map((card) => <article className="stat-card" key={card.key}><div className={`stat-icon stat-${card.tone}`}><Icon name={card.icon} /></div><div className="stat-copy"><span>{t(`home.cards.${card.key}.label`)}</span><strong>{data.counts[card.key]}</strong><small>{t(`home.cards.${card.key}.detail`)}</small></div></article>)}
        </section>
        <section className="card" aria-labelledby="recent-title">
          <div className="card-title"><div><h2 id="recent-title">{t('home.recentTitle')}</h2><p>{t('home.recentDescription')}</p></div><Link to="/orders">{t('home.openList')}<Icon name="chevron" size={16} /></Link></div>
          {data.recent.length === 0 ? <Empty title={t('home.emptyTitle')} description={t('home.emptyDescription')} /> : <div className="table-wrap"><table className="table"><thead><tr><th>{t('table.order')}</th><th>{t('table.diReview')}</th><th>{t('table.customsStage')}</th><th className="amount">{t('table.diTotal')}</th><th>{t('table.updatedAt')}</th><th><span className="sr-only">{t('table.action')}</span></th></tr></thead><tbody>{data.recent.map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.quote_no}</Link></td><td><StatusBadge value={order.customs_review?.status || 'pending'} kind="review" /></td><td><StatusBadge value={order.shipment_stage} kind="stage" /></td><td className="amount">{brl(order.di_total_brl ?? order.customs_review?.total_di_brl)}</td><td>{dateTime(order.updated_at)}</td><td><Link className="table-action" to={`/orders/${order.id}`} aria-label={t('home.analyzeAria', { quote: order.quote_no })}>{t('home.analyze')}<Icon name="arrow" size={16} /></Link></td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </>
  );
}
