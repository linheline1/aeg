import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';
import { useTranslation } from 'react-i18next';

interface DealStats {
  scope: 'all' | 'self';
  overall: {
    done: number;
    won: number;
    lost: number;
    open: number;
    win_rate: number | null;
    won_amount_brl: number;
    quoted_amount_brl: number;
  };
  by_month: { month: string; done: number; won: number; lost: number; open: number; win_rate: number | null; won_amount_brl: number }[];
  by_client: { client_id: string; client_name: string; done: number; won: number; lost: number; open: number; win_rate: number | null; won_amount_brl: number }[];
  by_salesperson: { salesperson_id: string | null; salesperson_name: string; done: number; won: number; lost: number; open: number; win_rate: number | null; won_amount_brl: number }[];
  recent: { id: string; quote_no: string; client_name: string; salesperson_name: string | null; deal_status: string; deal_note: string | null; amount_brl: number | null; deal_closed_at: string | null }[];
}

const brl = (n?: number | null) =>
  n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (r: number | null) => (r == null ? '—' : r.toFixed(1) + '%');
const when = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

function StatCard({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="stat-card">
      <span className="label">{label}</span>
      <span className="value" style={cls ? { color: cls } : undefined}>{value}</span>
    </div>
  );
}

export default function Deals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [s, setS] = useState<DealStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    api.get('/api/ops/deals/stats')
      .then(r => setS(r.data))
      .catch(e => setErr(getApiErrorMessage(e, t('deals.loadError'))))
      .finally(() => setBusy(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-title">
        <h1>{t('deals.title')}</h1>
        <p className="sub">
          {user?.role === 'sales'
            ? t('deals.subtitleSales')
            : t('deals.subtitleAll')}
        </p>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {s && (
        <>
          <div className="stat-grid">
            <StatCard label={t('deals.published')} value={String(s.overall.done)} />
            <StatCard label={t('deals.won')} value={String(s.overall.won)} cls="var(--ok)" />
            <StatCard label={t('deals.lost')} value={String(s.overall.lost)} cls="var(--err)" />
            <StatCard label={t('deals.open')} value={String(s.overall.open)} cls="var(--muted)" />
            <StatCard label={t('deals.winRate')} value={rate(s.overall.win_rate)} />
            <StatCard label={t('deals.amountBrl')} value={brl(s.overall.won_amount_brl)} cls="var(--ok)" />
          </div>

          {/* 按月统计 */}
          <div className="card">
            <div className="card-title">
              <h3>📅 {t('deals.byMonth')}</h3>
              <button className="btn btn-ghost" disabled={busy} onClick={load}>{t('common.refresh')}</button>
            </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('deals.month')}</th><th className="amt">{t('deals.publishedShort')}</th><th className="amt">{t('deals.wonShort')}</th>
                      <th className="amt">{t('deals.lostShort')}</th><th className="amt">{t('deals.following')}</th>
                      <th>{t('deals.winRate')}</th><th className="amt">{t('deals.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_month.length === 0 && (
                      <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>{t('common.noData')}</td></tr>
                    )}
                    {s.by_month.map(m => (
                      <tr key={m.month}>
                        <td><strong>{m.month}</strong></td>
                        <td className="amt">{m.done}</td>
                        <td className="amt" style={{ color: 'var(--ok)' }}>{m.won}</td>
                        <td className="amt" style={{ color: 'var(--err)' }}>{m.lost}</td>
                        <td className="amt">{m.open}</td>
                        <td>{rate(m.win_rate)}</td>
                        <td className="amt">{brl(m.won_amount_brl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          {/* 按客户统计 */}
          <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title">
                <h3>🏢 {t('deals.byClient')}</h3>
                <span className="muted text-sm">{t('deals.clientCount', { count: s.by_client.length })}</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('deals.client')}</th><th className="amt">{t('deals.publishedShort')}</th><th className="amt">{t('deals.wonShort')}</th>
                      <th className="amt">{t('deals.lostShort')}</th><th className="amt">{t('deals.following')}</th>
                      <th>{t('deals.winRate')}</th><th className="amt">{t('deals.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_client.length === 0 && (
                      <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>{t('common.noData')}</td></tr>
                    )}
                    {s.by_client.map(c => (
                      <tr key={c.client_id}>
                        <td><strong>{c.client_name}</strong></td>
                        <td className="amt">{c.done}</td>
                        <td className="amt" style={{ color: 'var(--ok)' }}>{c.won}</td>
                        <td className="amt" style={{ color: 'var(--err)' }}>{c.lost}</td>
                        <td className="amt">{c.open}</td>
                        <td>{rate(c.win_rate)}</td>
                        <td className="amt">{brl(c.won_amount_brl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          {/* 按业务员统计 */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">
              <h3>👤 {t('deals.bySales')}</h3>
              <span className="muted text-sm">
                {user?.role === 'sales' ? t('deals.salesOwn') : t('deals.unassignedHint')}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('deals.salesperson')}</th><th className="amt">{t('deals.publishedShort')}</th><th className="amt">{t('deals.wonShort')}</th>
                    <th className="amt">{t('deals.lostShort')}</th><th className="amt">{t('deals.following')}</th>
                    <th>{t('deals.winRate')}</th><th className="amt">{t('deals.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.by_salesperson.length === 0 && (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>{t('common.noData')}</td></tr>
                  )}
                  {s.by_salesperson.map(p => (
                    <tr key={p.salesperson_id || '_none'}>
                      <td><strong>{p.salesperson_name}</strong></td>
                      <td className="amt">{p.done}</td>
                      <td className="amt" style={{ color: 'var(--ok)' }}>{p.won}</td>
                      <td className="amt" style={{ color: 'var(--err)' }}>{p.lost}</td>
                      <td className="amt">{p.open}</td>
                      <td>{rate(p.win_rate)}</td>
                      <td className="amt">{brl(p.won_amount_brl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 最近成交记录 */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">
              <h3>🧾 {t('deals.recentTitle')}</h3>
              <span className="muted text-sm">{t('deals.recentCount', { count: s.recent.length })}</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('deals.quote')}</th><th>{t('deals.client')}</th><th>{t('deals.salesperson')}</th><th>{t('deals.result')}</th>
                    <th className="amt">{t('deals.amountBrl')}</th><th>{t('deals.note')}</th><th>{t('deals.markedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                        {t('deals.noRecent', { list: t(user?.role === 'sales' ? 'nav.ordersSales' : 'nav.orders') })}
                      </td>
                    </tr>
                  )}
                  {s.recent.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.quote_no}</strong></td>
                      <td>{r.client_name}</td>
                      <td>{r.salesperson_name || '—'}</td>
                      <td>
                        <span className={`deal-tag ${r.deal_status === 'won' ? 'deal-won' : 'deal-lost'}`}>
                          {r.deal_status === 'won' ? t('deals.won') : t('deals.lost')}
                        </span>
                      </td>
                      <td className="amt">{brl(r.amount_brl)}</td>
                      <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.deal_note || ''}>
                        {r.deal_note || '—'}
                      </td>
                      <td className="muted">{when(r.deal_closed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
