import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setErr(getApiErrorMessage(e, t('client.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get('/api/ops/salespeople')
      .then(r => setSalespeople(r.data))
      .catch(() => {});
  }, []);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };

  const create = async () => {
    setErr(null); setCreating(true);
    try {
      await api.post('/api/admin/clients', {
        name, username, password,
        salesperson_id: salesperson || null
      });
      setName(''); setUsername(''); setPassword(''); setSalesperson('');
      flash(t('client.flash.created'));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('client.err.createFail')));
    } finally { setCreating(false); }
  };

  const assignSales = async (row: ClientRow, salespersonId: string) => {
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}`, { salesperson_id: salespersonId || null });
      flash(t('client.flash.salesUpdated'));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('client.err.assignFail')));
      await load();
    } finally { setBusyId(null); }
  };

  const toggleStatus = async (row: ClientRow) => {
    const next = row.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(t('client.confirm.disable', { name: row.name }))) return;
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}`, { status: next });
      flash(next === 'active' ? t('client.flash.enabled') : t('client.flash.disabled'));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('client.err.opFail')));
    } finally { setBusyId(null); }
  };

  const resetPassword = async (row: ClientRow) => {
    if (pwdValue.length < 6) { setErr(t('client.err.pwdTooShort')); return; }
    setBusyId(row.id); setErr(null);
    try {
      await api.patch(`/api/admin/clients/${row.id}/password`, { password: pwdValue });
      setPwdFor(null); setPwdValue('');
      flash(t('client.flash.pwdReset', { username: row.username }));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('client.err.resetFail')));
    } finally { setBusyId(null); }
  };

  const activeCount = rows.filter(r => r.status === 'active').length;
  const pendingCount = rows.filter(r => r.verification_status === 'pending').length;

  return (
    <>
      <div className="page-title">
        <h1>{t('client.title')}</h1>
        <span className="muted text-sm">{t('client.subtitle')}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('client.label.total')}</span>
          <span className="value">{rows.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('client.label.active')}</span>
          <span className="value" style={{ color: 'var(--ok)' }}>{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('client.label.disabled')}</span>
          <span className="value" style={{ color: 'var(--muted)' }}>{rows.length - activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('client.label.pendingVerify')}</span>
          <span className="value" style={{ color: 'var(--warn)' }}>{pendingCount}</span>
        </div>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      {isAdmin && <div className="card">
        <div className="card-title">
          <h3>{t('client.create.title')}</h3>
          <span className="muted text-sm">{t('client.create.hint')}</span>
        </div>
        <div className="grid-3">
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('client.create.name')}</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('client.create.namePlaceholder')} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('client.create.username')}</label>
            <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('client.create.usernamePlaceholder')} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('client.create.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('client.create.passwordPlaceholder')} autoComplete="new-password" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>{t('client.create.salesperson')}</label>
            <select className="form-input" value={salesperson} onChange={e => setSalesperson(e.target.value)}>
              <option value="">{t('client.create.noAssign')}</option>
              {salespeople.map(s => (
                <option key={s.id} value={s.id}>{s.username}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row-between mt-16">
          <span className="muted text-sm">{t('client.create.rules')}</span>
          <button className="btn" disabled={creating || !name || !username || password.length < 6} onClick={create}>
            {creating ? t('client.create.submitting') : t('client.create.submit')}
          </button>
        </div>
      </div>}

      <div className="card">
        <div className="card-title">
          <h3>{t('client.list.title')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{t('client.list.refresh')}</button>
        </div>

        {loading ? (
          <p className="muted">{t('client.list.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t('client.list.noData')}</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('client.col.basic')}</th>
                  <th>{t('client.col.username')}</th>
                  <th>{t('client.col.verifyStatus')}</th>
                  <th>{t('client.col.accountStatus')}</th>
                  <th>{t('client.col.salesperson')}</th>
                  <th className="num">{t('client.col.quoteCount')}</th>
                  <th>{t('client.col.createdAt')}</th>
                  <th>{t('client.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td data-label={t('client.col.basic')}>
                      <strong>{r.china_company_name || r.name}</strong>
                      <span className="sub">
                        {r.china_uscc
                          ? t('client.verify.uscc', { code: r.china_uscc })
                          : t('client.verify.unregistered')}
                      </span>
                    </td>
                    <td data-label={t('client.col.username')}>
                      {r.username ? <code>{r.username}</code> : <span className="muted">{t('client.account.notOpened')}</span>}
                    </td>
                    <td data-label={t('client.col.verifyStatus')}>
                      <span className={`status-tag ${r.verification_status === 'approved' ? 'status-active' : r.verification_status === 'pending' ? 'status-pending_fee' : 'status-disabled'}`}
                        title={r.verification_note || undefined}>
                        {r.verification_status === 'approved' ? t('client.verify.approved') : r.verification_status === 'pending' ? t('client.verify.pending') : t('client.verify.rejected')}
                      </span>
                    </td>
                    <td data-label={t('client.col.accountStatus')}>
                      <span className={`status-tag ${r.status === 'active' ? 'status-active' : 'status-disabled'}`}>
                        {r.status === 'active' ? t('client.status.active') : t('client.status.disabled')}
                      </span>
                    </td>
                    <td data-label={t('client.col.salesperson')}>
                      <select
                        className="form-input form-input-sm"
                        style={{ width: 120 }}
                        value={r.salesperson_id || ''}
                        disabled={!isAdmin || busyId === r.id}
                        onChange={e => assignSales(r, e.target.value)}
                        title={isAdmin ? t('client.salesperson.title') : t('client.salesperson.notAdmin')}
                      >
                        <option value="">{t('client.salesperson.unassigned')}</option>
                        {salespeople.map(s => (
                          <option key={s.id} value={s.id}>{s.username}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num" data-label={t('client.col.quoteCount')}>{r.quote_count}</td>
                    <td className="muted text-sm" data-label={t('client.col.createdAt')}>{fmtTime(r.created_at)}</td>
                    <td className="table-action-cell" data-label={t('client.col.actions')}>
                      {!isAdmin ? (
                        <Link className="btn btn-ghost btn-sm" to={`/clients/${r.id}`}>{t('client.action.reviewDetail')}</Link>
                      ) : pwdFor === r.id ? (
                        <div className="row gap-sm table-actions">
                          <input
                            className="form-input-sm"
                            style={{ width: 120 }}
                            type="text"
                            value={pwdValue}
                            placeholder={t('client.pwd.placeholder')}
                            onChange={e => setPwdValue(e.target.value)}
                          />
                          <button className="btn btn-sm" disabled={busyId === r.id} onClick={() => resetPassword(r)}>{t('common.ok')}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setPwdFor(null); setPwdValue(''); }}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <div className="row gap-sm table-actions">
                          <Link className="btn btn-ghost btn-sm" to={`/clients/${r.id}`}>{t('client.action.viewDetail')}</Link>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={!r.username}
                            onClick={() => { setPwdFor(r.id); setPwdValue(''); }}
                          >{t('client.action.resetPwd')}</button>
                          <button
                            className={`btn btn-sm ${r.status === 'active' ? 'btn-danger' : 'btn-ghost'}`}
                            disabled={busyId === r.id}
                            onClick={() => toggleStatus(r)}
                          >{r.status === 'active' ? t('client.action.toggleDisable') : t('client.action.toggleEnable')}</button>
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
