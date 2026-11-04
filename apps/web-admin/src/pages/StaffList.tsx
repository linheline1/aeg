import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';

interface StaffRow {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'sales' | 'customs';
  status: 'active' | 'disabled';
  created_at: string;
  quote_count: number | null;
}

const ROLE_CN: Record<string, string> = {
  admin: '管理员',
  operator: '报价员',
  sales: '业务员',
  customs: '报关行'
};

const ROLE_TAG: Record<string, string> = {
  admin: 'status-pending_fee',
  operator: 'status-computing',
  sales: 'status-uploaded',
  customs: 'status-validating'
};

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function StaffList() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 新建表单
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'sales' | 'operator' | 'customs'>('sales');
  const [creating, setCreating] = useState(false);

  // 重置密码（行内）
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/api/admin/staff');
      setRows(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '加载失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    setErr(null); setCreating(true);
    try {
      await api.post('/api/admin/staff', { username, password, role });
      setUsername(''); setPassword('');
      flash(`✅ 员工已创建，可用账号 ${username} 登录${role === 'customs' ? '报关行端' : '运营端'}`);
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '创建失败'));
    } finally { setCreating(false); }
  };

  const toggleStatus = async (row: StaffRow) => {
    const next = row.status === 'active' ? 'disabled' : 'active';
    const loginTarget = row.role === 'customs' ? '报关行端' : '运营端';
    if (next === 'disabled' && !window.confirm(`确认禁用「${row.username}」？该员工将无法登录${loginTarget}。`)) return;
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/staff/${row.id}`, { status: next });
      flash(next === 'active' ? '✅ 员工已启用' : '✅ 员工已禁用');
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '操作失败'));
      await load();
    } finally { setBusyId(null); }
  };

  const resetPassword = async (row: StaffRow) => {
    if (pwdValue.length < 6) { setErr('新密码至少 6 位（6-72 字节，不含首尾空格）'); return; }
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/staff/${row.id}/password`, { password: pwdValue });
      setPwdFor(null); setPwdValue('');
      flash(`✅ 已重置「${row.username}」的登录密码`);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '重置失败'));
    } finally { setBusyId(null); }
  };

  const activeCount = rows.filter(r => r.status === 'active').length;
  const salesCount = rows.filter(r => r.role === 'sales').length;
  const operatorCount = rows.filter(r => r.role === 'operator').length;
  const customsCount = rows.filter(r => r.role === 'customs').length;

  return (
    <>
      <div className="page-title">
        <h1>员工管理</h1>
        <span className="muted text-sm">创建员工 · 开通登录账号 · 启用 / 禁用</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">员工总数</span>
          <span className="value">{rows.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">启用中</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">业务员</span>
          <span className="value">{salesCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">报价员</span>
          <span className="value">{operatorCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">报关行</span>
          <span className="value">{customsCount}</span>
        </div>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card">
        <div className="card-title">
          <h3>➕ 新建员工</h3>
          <span className="muted text-sm">报价员与业务员登录运营端，报关行员工登录报关行端</span>
        </div>
        <div className="grid-3">
          <div className="form-row" style={{ margin: 0 }}>
            <label>登录账号</label>
            <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="如：sales02" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>初始密码</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6-72 位，不含首尾空格" autoComplete="new-password" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>角色</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'sales' | 'operator' | 'customs')}>
              <option value="sales">业务员（报价跟进 / 成交统计）</option>
              <option value="operator">报价员（订单核算 / 费率表）</option>
              <option value="customs">报关行（进口报关）</option>
            </select>
          </div>
        </div>
        <div className="row-between mt-16">
          <span className="muted text-sm">账号规则：3-32 位字母、数字或 _ . -</span>
          <button className="btn" disabled={creating || !username || password.length < 6} onClick={create}>
            {creating ? '创建中…' : '创建员工'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>🧑‍💼 员工列表</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>刷新</button>
        </div>

        {loading ? (
          <p className="muted">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="muted">暂无员工，请先在上方创建。</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>登录账号</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th className="num">归属报价数</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isSelf = me?.id === r.id;
                  return (
                    <tr key={r.id}>
                      <td data-label="登录账号">
                        <strong>{r.username}</strong>
                        {isSelf && <span className="sub">（当前登录）</span>}
                      </td>
                      <td data-label="角色">
                        <span className={`status-tag ${ROLE_TAG[r.role] || ''}`}>{ROLE_CN[r.role] || r.role}</span>
                      </td>
                      <td data-label="状态">
                        <span className={`status-tag ${r.status === 'active' ? 'status-active' : 'status-disabled'}`}>
                          {r.status === 'active' ? '启用' : '禁用'}
                        </span>
                      </td>
                      <td className="num" data-label="归属报价数">{r.quote_count ?? '—'}</td>
                      <td className="muted text-sm" data-label="创建时间">{fmtTime(r.created_at)}</td>
                      <td className="table-action-cell" data-label="操作">
                        {pwdFor === r.id ? (
                          <div className="row gap-sm table-actions">
                            <input
                              className="form-input-sm"
                              style={{ width: 120 }}
                              type="text"
                              value={pwdValue}
                              placeholder="新密码 ≥6 位"
                              onChange={e => setPwdValue(e.target.value)}
                            />
                            <button className="btn btn-sm" disabled={busyId === r.id} onClick={() => resetPassword(r)}>确认</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setPwdFor(null); setPwdValue(''); }}>取消</button>
                          </div>
                        ) : (
                          <div className="row gap-sm table-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setPwdFor(r.id); setPwdValue(''); }}
                            >重置密码</button>
                            <button
                              className={`btn btn-sm ${r.status === 'active' ? 'btn-danger' : 'btn-ghost'}`}
                              disabled={busyId === r.id || isSelf}
                              title={isSelf ? '不能禁用当前登录的自己' : undefined}
                              onClick={() => toggleStatus(r)}
                            >{r.status === 'active' ? '禁用' : '启用'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
