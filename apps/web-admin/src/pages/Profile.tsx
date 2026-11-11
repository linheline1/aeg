import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface Profile {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

function fmtTime(s?: string) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

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
    api.get('/api/admin/profile')
      .then(r => setProfile(r.data))
      .catch(e => setLoadErr(getApiErrorMessage(e, t('profile.err.loadFail'))));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErr(''); setOk('');
    if (!currentPassword) { setErr(t('profile.pwd.errNeedCurrent')); return; }
    if (newPassword !== newPassword.trim()) { setErr(t('profile.pwd.errNoSpaces')); return; }
    if (newPassword.length < 6) { setErr(t('profile.pwd.errTooShort')); return; }
    if (newPassword !== confirmPassword) { setErr(t('profile.pwd.errMismatch')); return; }
    setBusy(true);
    try {
      await api.patch('/api/admin/profile/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setOk(t('profile.pwd.okMsg'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setErr(getApiErrorMessage(e, t('profile.err.pwdFail')));
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
        <div className="card-title"><h3>{t('profile.info.title')}</h3></div>
        {profile ? (
          <div className="profile-grid">
            <div><span className="profile-k">{t('profile.info.username')}</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">{t('profile.info.role')}</span><strong>{t(`user.role.${profile.role}`, { defaultValue: profile.role })}</strong></div>
            <div><span className="profile-k">{t('profile.info.status')}</span><strong>{profile.status === 'active' ? t('profile.info.statusNormal') : profile.status}</strong></div>
            <div><span className="profile-k">{t('profile.info.port')}</span><strong>{t('profile.info.portAdmin')}</strong></div>
            <div><span className="profile-k">{t('profile.info.createdAt')}</span><strong>{fmtTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">{t('profile.info.updatedAt')}</span><strong>{fmtTime(profile.updated_at)}</strong></div>
          </div>
        ) : (
          !loadErr && <p className="muted">{t('profile.info.loading')}</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>{t('profile.pwd.title')}</h3>
          <span className="muted text-sm">{t('profile.pwd.hint')}</span>
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}
        <form onSubmit={submit} className="profile-password-form">
          <div className="form-row">
            <label htmlFor="current-password">{t('profile.pwd.currentLabel')}</label>
            <input
              id="current-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder={t('profile.pwd.currentPlaceholder')}
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-password">{t('profile.pwd.newLabel')}</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('profile.pwd.newPlaceholder')}
            />
          </div>
          <div className="form-row">
            <label htmlFor="confirm-password">{t('profile.pwd.confirmLabel')}</label>
            <input
              id="confirm-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('profile.pwd.confirmPlaceholder')}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t('profile.pwd.submitting') : t('profile.pwd.submit')}
          </button>
        </form>
      </div>
    </>
  );
}
