import { useEffect, useState } from 'react';
import { api, useAuth } from '../store/auth';

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
  const { user } = useAuth();
  const [s, setS] = useState<DealStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    api.get('/api/ops/deals/stats')
      .then(r => setS(r.data))
      .catch(e => setErr(e?.response?.data?.message || '加载失败'))
      .finally(() => setBusy(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-title">
        <h1>成交统计</h1>
        <p className="sub">
          {user?.role === 'sales'
            ? '业务员视角 · 仅统计归属您的报价单'
            : '全公司报价成交情况：按月 / 按客户 / 按业务员汇总（口径：已核算发布的报价）'}
        </p>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {s && (
        <>
          <div className="stat-grid">
            <StatCard label="已发布报价" value={String(s.overall.done)} />
            <StatCard label="已成交" value={String(s.overall.won)} cls="var(--ok)" />
            <StatCard label="未成交" value={String(s.overall.lost)} cls="var(--err)" />
            <StatCard label="跟进中/未标记" value={String(s.overall.open)} cls="var(--muted)" />
            <StatCard label="成交率" value={rate(s.overall.win_rate)} />
            <StatCard label="成交金额（BRL）" value={brl(s.overall.won_amount_brl)} cls="var(--ok)" />
          </div>

          {/* 按月统计 */}
          <div className="card">
            <div className="card-title">
              <h3>📅 按月统计</h3>
              <button className="btn btn-ghost" disabled={busy} onClick={load}>刷新</button>
            </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>月份</th><th className="amt">发布</th><th className="amt">成交</th>
                      <th className="amt">未成交</th><th className="amt">跟进中</th>
                      <th>成交率</th><th className="amt">成交金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_month.length === 0 && (
                      <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>暂无数据</td></tr>
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
                <h3>🏢 按客户统计</h3>
                <span className="muted text-sm">共 {s.by_client.length} 个客户</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>客户</th><th className="amt">发布</th><th className="amt">成交</th>
                      <th className="amt">未成交</th><th className="amt">跟进中</th>
                      <th>成交率</th><th className="amt">成交金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_client.length === 0 && (
                      <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>暂无数据</td></tr>
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
              <h3>👤 按业务员统计</h3>
              <span className="muted text-sm">
                {user?.role === 'sales' ? '您名下的报价表现' : '未分配的报价单计入「未分配」行'}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>业务员</th><th className="amt">发布</th><th className="amt">成交</th>
                    <th className="amt">未成交</th><th className="amt">跟进中</th>
                    <th>成交率</th><th className="amt">成交金额</th>
                  </tr>
                </thead>
                <tbody>
                  {s.by_salesperson.length === 0 && (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>暂无数据</td></tr>
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
              <h3>🧾 最近成交/未成交记录</h3>
              <span className="muted text-sm">最近 {s.recent.length} 条</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>报价号</th><th>客户</th><th>业务员</th><th>结果</th>
                    <th className="amt">金额（BRL）</th><th>备注</th><th>标记时间</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                        还没有成交记录 —— 在「{user?.role === 'sales' ? '报价跟进' : '报价订单'}」列表标记成交状态后，这里会展示明细
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
                          {r.deal_status === 'won' ? '已成交' : '未成交'}
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
