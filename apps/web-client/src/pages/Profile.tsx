import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { openOrShareFile } from '../lib/file-actions';

interface ProfileData {
  id: string;
  username: string;
  status: 'active' | 'disabled';
  created_at: string;
  salesperson: { name: string; avatar_data: string | null; phone: string | null; wechat: string | null } | null;
  client: {
    id: string;
    name: string;
    china_company_name: string | null;
    china_uscc: string | null;
    verification_status: 'pending' | 'approved' | 'rejected';
    verification_note: string | null;
    verified_by: string | null;
    verified_at: string | null;
    license_uploaded: boolean;
    license_file_name: string | null;
    license_mime_type: string | null;
    license_size_bytes: number | null;
  };
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function Profile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [license, setLicense] = useState<File | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseVersion, setLicenseVersion] = useState(0);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/api/client/profile');
      setProfile(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('profile.loadError')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (passwords.new_password !== passwords.confirm_password) { setErr(t('profile.passwordMismatch')); return; }
    setPasswordBusy(true);
    try {
      await api.patch('/api/client/profile/password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password
      });
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      setMsg(t('profile.passwordSuccess'));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('profile.passwordError')));
    } finally { setPasswordBusy(false); }
  };

  const uploadLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!license) { setErr(t('profile.selectLicense')); return; }
    setLicenseBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const data = new FormData();
      data.append('license', license);
      const r = await api.post('/api/client/profile/license', data);
      setProfile(r.data);
      setLicense(null);
      setLicenseVersion(v => v + 1);
      setMsg(t('profile.licenseSuccess'));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('profile.licenseError')));
    } finally { setLicenseBusy(false); }
  };

  const viewLicense = async () => {
    setErr(null);
    try {
      const r = await api.get('/api/client/profile/license', { responseType: 'blob' });
      const mimeType = profile?.client.license_mime_type || 'application/octet-stream';
      const fileName = profile?.client.license_file_name || `${t('profile.license')}.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`;
      await openOrShareFile(new Blob([r.data], { type: mimeType }), fileName);
    } catch { setErr(t('profile.licenseLoadError')); }
  };

  if (loading) return <div className="card"><p className="muted">{t('profile.loading')}</p></div>;
  if (!profile) return <div className="alert alert-err">❌ {err || t('profile.notFound')}</div>;
  const client = profile.client;
  const statusClass = client.verification_status === 'approved' ? 'status-done' : client.verification_status === 'rejected' ? 'status-failed' : 'status-pending_fee';
  const statusText = t(`profile.verification.${client.verification_status}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('profile.title')}</h1>
          <p className="muted">{t('profile.subtitle')}</p>
        </div>
      </div>
      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title"><h3>{t('profile.salespersonTitle')}</h3></div>
          {profile.salesperson ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {profile.salesperson.avatar_data ? <img src={profile.salesperson.avatar_data} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} /> : <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: '50%', background: '#e7eefc', display: 'grid', placeItems: 'center' }}>{profile.salesperson.name.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{profile.salesperson.name}</strong>
              {profile.salesperson.phone && <div><a href={`tel:${profile.salesperson.phone}`}>{t('profile.salesPhone')}：{profile.salesperson.phone}</a></div>}
              {profile.salesperson.wechat && <div>{t('profile.salesWechat')}：{profile.salesperson.wechat}</div>}
            </div>
          </div> : <p className="muted">{t('profile.salespersonUnassigned')}</p>}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title"><h3>👤 {t('profile.accountInfo')}</h3></div>
          <p><strong>{t('profile.username')}：</strong>{profile.username}</p>
          <p><strong>{t('profile.accountType')}：</strong>{t('profile.clientAccount')}</p>
          <p><strong>{t('profile.accountStatus')}：</strong>{profile.status === 'active' ? t('profile.active') : t('profile.disabled')}</p>
          <p><strong>{t('profile.registeredAt')}：</strong>{fmtTime(profile.created_at)}</p>
          <p><strong>{t('profile.userId')}：</strong></p>
          <code style={{ wordBreak: 'break-all' }}>{profile.id}</code>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="card-title"><h3>🏢 {t('profile.chinaCompany')}</h3></div>
          <p><strong>{t('profile.companyName')}：</strong>{client.china_company_name || t('profile.notRegistered')}</p>
          <p><strong>{t('profile.uscc')}：</strong></p>
          <code>{client.china_uscc || '—'}</code>
          <p className="muted text-sm" style={{ marginTop: 16 }}>{t('profile.companyHint')}</p>
        </div>
      </div>

      <Link to="/cnpjs" className="card cnpj-profile-entry">
        <div>
          <div className="card-title" style={{ margin: 0 }}><h3>🏢 {t('profile.invoiceData')}</h3></div>
          <p className="muted text-sm">{t('profile.invoiceHint')}</p>
        </div>
        <span className="btn btn-ghost">{t('profile.manageInvoice')}</span>
      </Link>

      <div className="card">
        <div className="card-title">
          <h3>✅ {t('profile.verificationTitle')}</h3>
          <span className={`status-tag ${statusClass}`}>{statusText}</span>
        </div>
        {client.verification_status === 'pending' && <div className="alert alert-warn">{t('profile.pendingMessage')}</div>}
        {client.verification_status === 'approved' && <div className="alert alert-ok">{t('profile.approvedMessage')}</div>}
        {client.verification_status === 'rejected' && <div className="alert alert-err">{t('profile.rejectedMessage')}</div>}
        {client.verification_note && <p><strong>{t('profile.reviewNote')}：</strong>{client.verification_note}</p>}
        {client.verified_by && <p className="muted text-sm">{t('profile.reviewMeta', { reviewer: client.verified_by, time: fmtTime(client.verified_at) })}</p>}
        <div className="row gap-md" style={{ flexWrap: 'wrap', margin: '14px 0' }}>
          {client.license_uploaded
            ? <button className="btn btn-ghost" onClick={viewLicense}>{t('profile.viewLicense')}{client.license_file_name ? `（${client.license_file_name}）` : ''}</button>
            : <span className="muted">{t('profile.noLicense')}</span>}
        </div>
        <form onSubmit={uploadLicense}>
          <div className="form-row">
            <label>{t(client.verification_status === 'rejected' ? 'profile.reuploadLicense' : 'profile.updateLicense')}</label>
            <input key={licenseVersion} className="form-input" required type="file" accept=".jpg,.jpeg,.png,.pdf"
              onChange={e => setLicense(e.target.files?.[0] || null)} />
            <span className="muted text-sm">{t('profile.licenseHint')}</span>
          </div>
          <button className="btn" disabled={licenseBusy || !license}>{licenseBusy ? t('profile.submitting') : t('profile.uploadSubmit')}</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title"><h3>🔒 {t('profile.changePassword')}</h3><span className="muted text-sm">{t('profile.passwordHint')}</span></div>
        <form onSubmit={changePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-row">
              <label>{t('profile.currentPassword')}</label>
              <input className="form-input" required type="password" value={passwords.current_password}
                onChange={e => setPasswords({ ...passwords, current_password: e.target.value })} autoComplete="current-password" />
            </div>
            <div className="form-row">
              <label>{t('profile.newPassword')}</label>
              <input className="form-input" required minLength={6} type="password" value={passwords.new_password}
                onChange={e => setPasswords({ ...passwords, new_password: e.target.value })} autoComplete="new-password" placeholder={t('profile.newPasswordPlaceholder')} />
            </div>
            <div className="form-row">
              <label>{t('profile.confirmPassword')}</label>
              <input className="form-input" required minLength={6} type="password" value={passwords.confirm_password}
                onChange={e => setPasswords({ ...passwords, confirm_password: e.target.value })} autoComplete="new-password" />
            </div>
          </div>
          <button className="btn" disabled={passwordBusy}>{passwordBusy ? t('profile.changing') : t('profile.confirmChange')}</button>
        </form>
      </div>
    </>
  );
}
