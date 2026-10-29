import { useEffect, useState } from 'react';
import { api } from '../store/auth';

interface Stats {
  clients: { total: number; active: number };
  templates: { total: number; active_version: string | null };
  quotes: { total: number; by_status: Record<string, number> };
  staff: { total: number; active: number };
  deals: { won: number; won_amount_brl: number };
}

const STATUS_CN: Record<string, string> = {
  uploaded: '已上传',
  validating: '校验中',
  pending_fee: '待补费用',
  computing: '核算中',
  done: '已发布',
  failed: '失败'
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/admin/stats')
      .then(r => setStats(r.data))
      .catch(e => setErr(e?.response?.data?.message || e?.message || '加载失败'));
  }, []);

  if (err) {
    return (
      <div className="card">
        <p style={{ color: 'var(--err)' }}>统计加载失败：{err}</p>
      </div>
    );
  }
  if (!stats) {
    return <div className="card"><p className="muted">统计加载中…</p></div>;
  }

  const pending =
    (stats.quotes.by_status.uploaded || 0) +
    (stats.quotes.by_status.validating || 0) +
    (stats.quotes.by_status.pending_fee || 0) +
    (stats.quotes.by_status.computing || 0);

  return (
    <>
      <div className="page-title">
        <h1>工作台 · 管理端</h1>
        <span className="muted text-sm">实时统计（/api/admin/stats）</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">活跃模板</span>
          <span className="value">{stats.templates.active_version ?? '无'}</span>
          <span className="delta">共 {stats.templates.total} 个版本</span>
        </div>
        <div className="stat-card">
          <span className="label">客户数</span>
          <span className="value">{stats.clients.total}</span>
          <span className="delta">启用 {stats.clients.active} · 禁用 {stats.clients.total - stats.clients.active}</span>
        </div>
        <div className="stat-card">
          <span className="label">报价订单</span>
          <span className="value" style={{ color: '#2563eb' }}>{stats.quotes.total}</span>
          <span className="delta">
            待处理 {pending} · 已发布 {stats.quotes.by_status.done || 0} · 失败 {stats.quotes.by_status.failed || 0}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">内部员工</span>
          <span className="value">{stats.staff.total}</span>
          <span className="delta">启用 {stats.staff.active}（operator + sales）</span>
        </div>
        <div className="stat-card">
          <span className="label">已成交（won）</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{stats.deals.won}</span>
          <span className="delta">
            成交金额 R$ {stats.deals.won_amount_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="stat-card">
          <span className="label">订单状态分布</span>
          <span className="value" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6 }}>
            {Object.entries(stats.quotes.by_status).length === 0
              ? '暂无订单'
              : Object.entries(stats.quotes.by_status)
                  .map(([s, n]) => `${STATUS_CN[s] || s} ${n}`)
                  .join(' · ')}
          </span>
        </div>
      </div>
    </>
  );
}
