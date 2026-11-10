import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function StaffList() {
  const { t } = useTranslation();
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
      setErr(getApiErrorMessage(e, t('staff.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    setErr(null); setCreating(true);
    try {
      await api.post('/api/admin/staff', { username, password, role });
      setUsername(''); setPassword('');
      flash(role === 'customs'
        ? t('staff.flash.createdCustoms', { username })
        : t('staff.flash.createdOps', { username }));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('staff.err.createFail')));
    } finally { setCreating(false); }
  };

  const toggleStatus = async (row: StaffRow) => {
    const next = row.status === 'active' ? 'disabled' : 'active';
    const loginTarget = row.role === 'customs'
      ? t('staff.confirm.disableCustoms', { username: row.username })
      : t('staff.confirm.disableOps', { username: row.username });
    const confirmMsg = row.role === 'customs'
      ? t('staff.confirm.disableCustoms', { username: row.username })
      : t('staff.confirm.disableOps', { username: row.username });
    void loginTarget;
    if (next === 'disabled' && !window.confirm(confirmMsg)) return;
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/staff/${row.id}`, { status: next });
      flash(next === 'active' ? t('staff.flash.enabled') : t('staff.flash.disabled'));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('staff.err.opFail')));
      await load();
    } finally { setBusyId(null); }
  };

  const resetPassword = async (row: StaffRow) => {
    if (pwdValue.length < 6) { setErr(t('staff.err.pwdTooShort')); return; }
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/staff/${row.id}/password`, { password: pwdValue });
      setPwdFor(null); setPwdValue('');
      flash(t('staff.flash.pwdReset', { username: row.username }));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('staff.err.resetFail')));
    } finally { setBusyId(null); }
  };

  const activeCount = rows.filter(r => r.status === 'active').length;
  const salesCount = rows.filter(r => r.role === 'sales').length;
  const operatorCount = rows.filter(r => r.role === 'operator').length;
  const customsCount = rows.filter(r => r.role === 'customs').length;

  const roleKey = (role: StaffRow['role']) => `staff.role.${role}` as const;

  return (
    <>
      <div className="page-title">
        <h1>{t('staff.title')}</h1>
        <span className="muted text-sm">{t('staff.subtitle')}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('staff.label.total')}</span>
          <span className="value">{rows.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('staff.label.active')}</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('staff.label.sales')}</span>
          <span className="value">{salesCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('staff.label.operator')}</span>
          <span className="value">{operatorCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('staff.label.customs')}</span>
          <span className="value">{customsCount}</span>
        </div>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="card">
        <div className="card-title">
          <h3>{t('staff.create.title')}</h3>
          <span className="muted text-sm">{t('staff.create.hint')}</span>
        </div>
        <div className="grid-3">
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('staff.create.username')}</label>
            <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('staff.create.usernamePlaceholder')} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('staff.create.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('staff.create.passwordPlaceholder')} autoComplete="new-password" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('staff.create.role')}</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value as 'sales' | 'operator' | 'customs')}>
              <option value="sales">{t('staff.create.role.sales')}</option>
              <option value="operator">{t('staff.create.role.operator')}</option>
              <option value="customs">{t('staff.create.role.customs')}</option>
            </select>
          </div>
        </div>
        <div className="row-between mt-16">
          <span className="muted text-sm">{t('staff.create.rules')}</span>
          <button className="btn" disabled={creating || !username || password.length < 6} onClick={create}>
            {creating ? t('staff.create.submitting') : t('staff.create.submit')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t('staff.list.title')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{t('staff.list.refresh')}</button>
        </div>

        {loading ? (
          <p className="muted">{t('staff.list.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t('staff.list.noData')}</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('staff.col.username')}</th>
                  <th>{t('staff.col.role')}</th>
                  <th>{t('staff.col.status')}</th>
                  <th className="num">{t('staff.col.quoteCount')}</th>
                  <th>{t('staff.col.createdAt')}</th>
                  <th>{t('staff.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isSelf = me?.id === r.id;
                  const roleTag: Record<string, string> = {
                    admin: 'status-pending_fee',
                    operator: 'status-computing',
                    sales: 'status-uploaded',
                    customs: 'status-validating'
                  };
                  return (
                    <tr key={r.id}>
                      <td data-label={t('staff.col.username')}>
                        <strong>{r.username}</strong>
                        {isSelf && <span className="sub">{t('staff.currentLogin')}</span>}
                      </td>
                      <td data-label={t('staff.col.role')}>
                        <span className={`status-tag ${roleTag[r.role] || ''}`}>{t(roleKey(r.role))}</span>
                      </td>
                      <td data-label={t('staff.col.status')}>
                        <span className={`status-tag ${r.status === 'active' ? 'status-active' : 'status-disabled'}`}>
                          {r.status === 'active' ? t('staff.status.active') : t('staff.status.disabled')}
                        </span>
                      </td>
                      <td className="num" data-label={t('staff.col.quoteCount')}>{r.quote_count ?? '—'}</td>
                      <td className="muted text-sm" data-label={t('staff.col.createdAt')}>{fmtTime(r.created_at)}</td>
                      <td className="table-action-cell" data-label={t('staff.col.actions')}>
                        {pwdFor === r.id ? (
                          <div className="row gap-sm table-actions">
                            <input
                              className="form-input-sm"
                              style={{ width: 120 }}
                              type="text"
                              value={pwdValue}
                              placeholder={t('staff.pwd.placeholder')}
                              onChange={e => setPwdValue(e.target.value)}
                            />
                            <button className="btn btn-sm" disabled={busyId === r.id} onClick={() => resetPassword(r)}>{t('common.ok')}</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setPwdFor(null); setPwdValue(''); }}>{t('common.cancel')}</button>
                          </div>
                        ) : (
                          <div className="row gap-sm table-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setPwdFor(r.id); setPwdValue(''); }}
                            >{t('staff.action.resetPwd')}</button>
                            <button
                              className={`btn btn-sm ${r.status === 'active' ? 'btn-danger' : 'btn-ghost'}`}
                              disabled={busyId === r.id || isSelf}
                              title={isSelf ? t('staff.cannotDisableSelf') : undefined}
                              onClick={() => toggleStatus(r)}
                            >{r.status === 'active' ? t('staff.action.toggleDisable') : t('staff.action.toggleEnable')}</button>
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
