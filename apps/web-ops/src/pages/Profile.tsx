import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { roleLabel } from '../lib/roles';

interface Profile {
  id: string;
  username: string;
  avatar_data?: string | null;
  sales_phone?: string | null;
  sales_wechat?: string | null;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

const fmtTime = (s?: string) => (s ? s.slice(0, 19).replace('T', ' ') : '—');

export default function Profile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [wechat, setWechat] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault(); setErr(''); setOk(''); setContactBusy(true);
    try {
      const response = await api.patch('/api/ops/profile/contact', { phone, wechat });
      setProfile(current => current ? { ...current, sales_phone: response.data.phone, sales_wechat: response.data.wechat } : current);
      setOk(t('profile.contact.saved'));
    } catch (error) { setErr(getApiErrorMessage(error, t('profile.contact.saveFailed'))); }
    finally { setContactBusy(false); }
  };
  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      setErr(t('profile.avatar.invalidType')); return;
    }
    setAvatarBusy(true); setErr('');
    try {
      const form = new FormData(); form.append('avatar', file);
      const response = await api.post('/api/ops/profile/avatar', form);
      setProfile(current => current ? { ...current, avatar_data: response.data.avatar_data } : current);
      setOk(t('profile.avatar.updated'));
    } catch (error) { setErr(getApiErrorMessage(error, t('profile.avatar.uploadFailed'))); }
    finally { setAvatarBusy(false); }
  };

  useEffect(() => {
    api.get('/api/ops/profile')
      .then(r => { setProfile(r.data); setPhone(r.data.sales_phone || ''); setWechat(r.data.sales_wechat || ''); })
      .catch(e => setLoadErr(getApiErrorMessage(e, t('profile.loadError'))));
  }, [t]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErr(''); setOk('');
    if (!currentPassword) { setErr(t('profile.currentRequired')); return; }
    if (newPassword !== newPassword.trim()) { setErr(t('profile.noEdgeSpaces')); return; }
    if (newPassword.length < 6) { setErr(t('profile.minLength')); return; }
    if (newPassword !== confirmPassword) { setErr(t('profile.mismatch')); return; }
    setBusy(true);
    try {
      await api.patch('/api/ops/profile/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setOk(t('profile.success'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setErr(getApiErrorMessage(e, t('profile.changeError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h1>{t('profile.title')}</h1>
        <span className="sub">{t('profile.subtitle')}</span>
      </div>

      {loadErr && <div className="alert alert-err">{loadErr}</div>}

      <div className="card">
        <div className="card-title"><h3>👤 {t('profile.accountInfo')}</h3></div>
        {profile ? (
          <>
          {profile.role === 'sales' && <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            {profile.avatar_data ? <img src={profile.avatar_data} alt={t('profile.avatar.alt')} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} /> : <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#e7eefc', fontSize: 28 }}>{profile.username.slice(0, 1).toUpperCase()}</span>}
            <label className="btn btn-ghost">{avatarBusy ? t('profile.avatar.uploading') : t('profile.avatar.upload')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy} onChange={event => uploadAvatar(event.target.files?.[0])} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} /></label>
            <span className="muted text-sm">{t('profile.avatar.hint')}</span>
          </div>}
          <div className="profile-grid">
            <div><span className="profile-k">{t('profile.username')}</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">{t('profile.role')}</span><strong>{roleLabel(profile.role)}</strong></div>
            <div><span className="profile-k">{t('profile.status')}</span><strong>{profile.status === 'active' ? t('profile.active') : profile.status}</strong></div>
            <div><span className="profile-k">{t('profile.portal')}</span><strong>{t('brand.subtitle')}</strong></div>
            <div><span className="profile-k">{t('profile.createdAt')}</span><strong>{fmtTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">{t('profile.updatedAt')}</span><strong>{fmtTime(profile.updated_at)}</strong></div>
          </div>
          </>
        ) : (
          !loadErr && <p className="muted">{t('common.loading')}</p>
        )}
      </div>

      {profile?.role === 'sales' && <div className="card">
        <div className="card-title"><h3>{t('profile.contact.visibleTitle')}</h3></div>
        <form onSubmit={saveContact} className="profile-password-form">
          <div className="form-row"><label htmlFor="sales-phone">{t('profile.contact.phone')}</label><input id="sales-phone" className="form-input" type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} placeholder={t('profile.contact.phonePlaceholder')} /></div>
          <div className="form-row"><label htmlFor="sales-wechat">{t('profile.contact.wechat')}</label><input id="sales-wechat" className="form-input" maxLength={80} value={wechat} onChange={event => setWechat(event.target.value)} placeholder={t('profile.contact.wechatPlaceholder')} /></div>
          <button className="btn" type="submit" disabled={contactBusy}>{contactBusy ? t('common.saving') : t('profile.contact.save')}</button>
        </form>
      </div>}

      <div className="card" id="password">
        <div className="card-title">
          <h3>🔑 {t('profile.changePassword')}</h3>
          <span className="muted text-sm">{t('profile.passwordHint')}</span>
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}
        <form onSubmit={submit} className="profile-password-form">
          <div className="form-row">
            <label htmlFor="current-password">{t('profile.currentPassword')}</label>
            <input
              id="current-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder={t('profile.currentPlaceholder')}
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-password">{t('profile.newPassword')}</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('profile.newPlaceholder')}
            />
          </div>
          <div className="form-row">
            <label htmlFor="confirm-password">{t('profile.confirmPassword')}</label>
            <input
              id="confirm-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('profile.confirmPlaceholder')}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t('profile.submitting') : t('profile.savePassword')}
          </button>
        </form>
      </div>
    </>
  );
}
