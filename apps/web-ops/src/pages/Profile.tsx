import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { roleLabel } from '../lib/roles';

interface Profile {
  id: string;
  username: string;
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

  useEffect(() => {
    api.get('/api/ops/profile')
      .then(r => setProfile(r.data))
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
          <div className="profile-grid">
            <div><span className="profile-k">{t('profile.username')}</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">{t('profile.role')}</span><strong>{roleLabel(profile.role)}</strong></div>
            <div><span className="profile-k">{t('profile.status')}</span><strong>{profile.status === 'active' ? t('profile.active') : profile.status}</strong></div>
            <div><span className="profile-k">{t('profile.portal')}</span><strong>{t('brand.subtitle')}</strong></div>
            <div><span className="profile-k">{t('profile.createdAt')}</span><strong>{fmtTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">{t('profile.updatedAt')}</span><strong>{fmtTime(profile.updated_at)}</strong></div>
          </div>
        ) : (
          !loadErr && <p className="muted">{t('common.loading')}</p>
        )}
      </div>

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
