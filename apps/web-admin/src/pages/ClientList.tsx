import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';

interface ClientRow {
  id: string;
  name: string;
  china_company_name: string | null;
  china_uscc: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  verification_note: string | null;
  status: 'active' | 'disabled';
  username: string | null;
  user_status: 'active' | 'disabled' | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  quote_count: number;
  created_at: string;
}

interface Salesperson {
  id: string;
  username: string;
  status: string;
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function ClientList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 新建表单
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [creating, setCreating] = useState(false);

  // 重置密码（行内）
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/api/admin/clients');
      setRows(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '加载失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  // M4：业务员列表（归属分配下拉）
  useEffect(() => {
    api.get('/api/ops/salespeople')
      .then(r => setSalespeople(r.data))
      .catch(() => {});
  }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    setErr(null); setCreating(true);
    try {
      await api.post('/api/admin/clients', {
        name, username, password,
        salesperson_id: salesperson || null
      });
      setName(''); setUsername(''); setPassword(''); setSalesperson('');
      flash('✅ 客户已创建，可让客户用该账号登录客户端');
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '创建失败'));
    } finally { setCreating(false); }
  };

  /** M4：设置归属业务员（该客户新报价自动继承，写审计日志） */
  const assignSales = async (row: ClientRow, salespersonId: string) => {
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}`, { salesperson_id: salespersonId || null });
      flash('✅ 归属业务员已更新（该客户新上传的报价将自动分配）');
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '设置失败'));
      await load();
    } finally { setBusyId(null); }
  };

  const toggleStatus = async (row: ClientRow) => {
    const next = row.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(`确认禁用「${row.name}」？该客户的登录账号将无法登录。`)) return;
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}`, { status: next });
      flash(next === 'active' ? '✅ 客户已启用' : '✅ 客户已禁用');
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '操作失败'));
    } finally { setBusyId(null); }
  };

  const resetPassword = async (row: ClientRow) => {
    if (pwdValue.length < 6) { setErr('新密码至少 6 位（6-72 字节，不含首尾空格）'); return; }
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}/password`, { password: pwdValue });
      setPwdFor(null); setPwdValue('');
      flash(`✅ 已重置「${row.username}」的登录密码`);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '重置失败'));
    } finally { setBusyId(null); }
  };

  const activeCount = rows.filter(r => r.status === 'active').length;
  const pendingCount = rows.filter(r => r.verification_status === 'pending').length;

  return (
    <>
      <div className="page-title">
        <h1>客户管理</h1>
        <span className="muted text-sm">创建客户 · 开通登录账号 · 启用 / 禁用</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">客户总数</span>
          <span className="value">{rows.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">启用中</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">已禁用</span>
          <span className="value" style={{ color: 'var(--muted)' }}>{rows.length - activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">待认证</span>
          <span className="value" style={{ color: 'var(--warn)' }}>{pendingCount}</span>
        </div>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      {isAdmin && <div className="card">
        <div className="card-title">
          <h3>➕ 新建客户</h3>
          <span className="muted text-sm">创建后客户可直接登录客户端上传装箱清单</span>
        </div>
        <div className="grid-3">
          <div className="form-row" style={{ margin: 0 }}>
            <label>客户名称</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="如：巴西进口商 A" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>登录账号</label>
            <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="如：client_b" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>初始密码</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6-72 位，不含首尾空格" autoComplete="new-password" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>归属业务员（可选）</label>
            <select className="form-input" value={salesperson} onChange={e => setSalesperson(e.target.value)}>
              <option value="">暂不分配</option>
              {salespeople.map(s => (
                <option key={s.id} value={s.id}>{s.username}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row-between mt-16">
          <span className="muted text-sm">账号规则：3-32 位字母、数字或 _ . -</span>
          <button className="btn" disabled={creating || !name || !username || password.length < 6} onClick={create}>
            {creating ? '创建中…' : '创建客户'}
          </button>
        </div>
      </div>}

      <div className="card">
        <div className="card-title">
          <h3>👥 客户列表</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>刷新</button>
        </div>

        {loading ? (
          <p className="muted">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="muted">暂无客户，请先在上方创建。</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>客户 / 国内企业认证信息</th>
                  <th>登录账号</th>
                  <th>认证状态</th>
                  <th>账号状态</th>
                  <th>归属业务员</th>
                  <th className="num">报价数</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td data-label="客户 / 企业认证">
                      <strong>{r.china_company_name || r.name}</strong>
                      <span className="sub">{r.china_uscc ? `统一社会信用代码：${r.china_uscc}` : '未登记国内企业认证信息'}</span>
                    </td>
                    <td data-label="登录账号">{r.username ? <code>{r.username}</code> : <span className="muted">未开通</span>}</td>
                    <td data-label="认证状态">
                      <span className={`status-tag ${r.verification_status === 'approved' ? 'status-active' : r.verification_status === 'pending' ? 'status-pending_fee' : 'status-disabled'}`}
                        title={r.verification_note || undefined}>
                        {r.verification_status === 'approved' ? '已认证' : r.verification_status === 'pending' ? '待认证' : '已驳回'}
                      </span>
                    </td>
                    <td data-label="账号状态">
                      <span className={`status-tag ${r.status === 'active' ? 'status-active' : 'status-disabled'}`}>
                        {r.status === 'active' ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td data-label="归属业务员">
                      <select
                        className="form-input form-input-sm"
                        style={{ width: 120 }}
                        value={r.salesperson_id || ''}
                        disabled={!isAdmin || busyId === r.id}
                        onChange={e => assignSales(r, e.target.value)}
                        title={isAdmin ? '归属业务员：该客户新上传的报价自动分配给他跟进' : '仅管理员可修改归属业务员'}
                      >
                        <option value="">未分配</option>
                        {salespeople.map(s => (
                          <option key={s.id} value={s.id}>{s.username}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num" data-label="报价数">{r.quote_count}</td>
                    <td className="muted text-sm" data-label="创建时间">{fmtTime(r.created_at)}</td>
                    <td className="table-action-cell" data-label="操作">
                      {!isAdmin ? (
                        <Link className="btn btn-ghost btn-sm" to={`/clients/${r.id}`}>审核认证 / 查看详情</Link>
                      ) : pwdFor === r.id ? (
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
                          <Link className="btn btn-ghost btn-sm" to={`/clients/${r.id}`}>查看详情</Link>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={!r.username}
                            onClick={() => { setPwdFor(r.id); setPwdValue(''); }}
                          >重置密码</button>
                          <button
                            className={`btn btn-sm ${r.status === 'active' ? 'btn-danger' : 'btn-ghost'}`}
                            disabled={busyId === r.id}
                            onClick={() => toggleStatus(r)}
                          >{r.status === 'active' ? '禁用' : '启用'}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
