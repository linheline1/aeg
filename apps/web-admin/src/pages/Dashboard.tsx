import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../store/auth';

interface Stats {
  clients: { total: number; active: number };
  templates: { total: number; active_version: string | null };
  quotes: { total: number; by_status: Record<string, number> };
  staff: { total: number; active: number };
  deals: { won: number; won_amount_brl: number };
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/admin/stats')
      .then(r => setStats(r.data))
  }, []);

  if (err) {
    return (
      <div className="card">
        <p style={{ color: 'var(--err)' }}>{t('dashboard.failTitle', { msg: err })}</p>
      </div>
    );
  }
  if (!stats) {
    return <div className="card"><p className="muted">{t('dashboard.loading')}</p></div>;
  }

  const pending =
    (stats.quotes.by_status.uploaded || 0) +
    (stats.quotes.by_status.validating || 0) +
    (stats.quotes.by_status.pending_fee || 0) +
    (stats.quotes.by_status.computing || 0);

  return (
    <>
      <div className="page-title">
        <h1>{t('dashboard.title')}</h1>
        <span className="muted text-sm">{t('dashboard.subtitle')}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('dashboard.label.activeTemplate')}</span>
          <span className="value">{stats.templates.active_version ?? t('dashboard.label.none')}</span>
          <span className="delta">{t('dashboard.label.templateTotal', { total: stats.templates.total })}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('dashboard.label.clients')}</span>
          <span className="value">{stats.clients.total}</span>
          <span className="delta">{t('dashboard.label.clientsStatus', { active: stats.clients.active, disabled: stats.clients.total - stats.clients.active })}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('dashboard.label.quotes')}</span>
          <span className="value" style={{ color: '#2563eb' }}>{stats.quotes.total}</span>
          <span className="delta">
            {t('dashboard.label.quotesStatus', { pending, done: stats.quotes.by_status.done || 0, failed: stats.quotes.by_status.failed || 0 })}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('dashboard.label.staff')}</span>
          <span className="value">{stats.staff.total}</span>
          <span className="delta">{t('dashboard.label.staffDetail', { active: stats.staff.active })}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('dashboard.label.dealsWon')}</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{stats.deals.won}</span>
          <span className="delta">
            {t('dashboard.label.dealsAmount', { amount: stats.deals.won_amount_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
          </span>
        </div>
        <div className="stat-card">
          <span className="label">{t('dashboard.label.quotesByStatus')}</span>
          <span className="value" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6 }}>
            {Object.entries(stats.quotes.by_status).length === 0
              ? t('dashboard.label.noOrders')
              : Object.entries(stats.quotes.by_status)
                  .map(([s, n]) => `${t(`dashboard.status.${s}`, { defaultValue: s })} ${n}`)
                  .join(' · ')}
          </span>
        </div>
      </div>
    </>
  );
}
