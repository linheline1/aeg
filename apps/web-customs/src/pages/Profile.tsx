import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorMessage, Loading, SuccessMessage } from '../components/Feedback';
import Icon from '../components/Icon';
import { api, errorMessage } from '../store/auth';
import { dateTime } from '../utils/format';

interface Profile {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

const API_ERROR_KEYS: Record<string, string> = {
  '当前密码不正确': 'profile.errors.currentWrong',
  '新密码至少 6 位': 'profile.errors.minLength',
  '新密码不能包含首尾空格': 'profile.errors.trim',
  '新密码不能与当前密码相同': 'profile.errors.same',
  '账户不存在': 'profile.errors.notFound'
};

export default function Profile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setLoadError('');
    try { setProfile((await api.get<Profile>('/api/customs/profile')).data); }
    catch (reason) {
      const raw = errorMessage(reason, t('profile.loadError'));
      setLoadError(API_ERROR_KEYS[raw] ? t(API_ERROR_KEYS[raw]) : raw);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(''); setSuccess('');
    if (!currentPassword) { setFormError(t('profile.errors.currentRequired')); return; }
    if (newPassword !== newPassword.trim()) { setFormError(t('profile.errors.trim')); return; }
    if (newPassword.length < 6) { setFormError(t('profile.errors.minLength')); return; }
    if (newPassword !== confirmPassword) { setFormError(t('profile.errors.mismatch')); return; }
    setSaving(true);
    try {
      await api.patch('/api/customs/profile/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setSuccess(t('profile.passwordSuccess'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (reason) {
      const raw = errorMessage(reason, t('profile.passwordError'));
      setFormError(API_ERROR_KEYS[raw] ? t(API_ERROR_KEYS[raw]) : raw);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('profile.eyebrow')}</span>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.description')}</p>
        </div>
      </div>

      {loadError && <ErrorMessage message={loadError} onRetry={load} />}
      {loading && !profile ? <Loading label={t('profile.loading')} /> : profile && (
        <section className="card profile-card">
          <h2 className="profile-title"><Icon name="user" size={20} />{t('profile.accountInfo')}</h2>
          <div className="profile-grid">
            <div><span className="profile-k">{t('profile.username')}</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">{t('profile.role')}</span><strong>{t('user.role.despachante')}</strong></div>
            <div><span className="profile-k">{t('profile.status')}</span><strong>{profile.status === 'active' ? t('profile.active') : profile.status}</strong></div>
            <div><span className="profile-k">{t('profile.portal')}</span><strong>{t('sidebar.brandSuffix')}</strong></div>
            <div><span className="profile-k">{t('profile.createdAt')}</span><strong>{dateTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">{t('profile.updatedAt')}</span><strong>{dateTime(profile.updated_at)}</strong></div>
          </div>
        </section>
      )}

      <section className="card profile-card">
        <h2 className="profile-title"><Icon name="edit" size={20} />{t('profile.changePassword')}</h2>
        <p className="profile-hint">{t('profile.passwordHint')}</p>
        {success && <SuccessMessage>{success}</SuccessMessage>}
        <form onSubmit={submit} className="profile-password-form">
          <div className="field">
            <label htmlFor="current-password">{t('profile.currentPassword')}</label>
            <input
              id="current-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder={t('profile.currentPlaceholder')}
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">{t('profile.newPassword')}</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder={t('profile.newPlaceholder')}
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">{t('profile.confirmPassword')}</label>
            <input
              id="confirm-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder={t('profile.confirmPlaceholder')}
              disabled={saving}
            />
          </div>
          {formError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{formError}</div>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('profile.savePassword')}
          </button>
        </form>
      </section>
    </>
  );
}
