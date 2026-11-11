import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';
import logo from '../assets/logo.png';
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    china_company_name: '', china_uscc: '', username: '', password: '', confirm_password: ''
  });
  const [license, setLicense] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (form.password !== form.confirm_password) { setErr(t('register.passwordMismatch')); return; }
    if (!license) { setErr(t('register.licenseRequired')); return; }
    setBusy(true);
    try {
      const data = new FormData();
      data.append('china_company_name', form.china_company_name);
      data.append('china_uscc', form.china_uscc);
      data.append('username', form.username);
      data.append('password', form.password);
      data.append('license', license);
      await api.post('/api/auth/register', data);
      await login(form.username, form.password);
      nav('/home');
    } catch (res: any) {
      setErr(getApiErrorMessage(res, t('register.failed')));
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo"><img className="logo-dot-lg" src={logo} alt="AEG" /></div>
        <h1>{t('register.title')}</h1>
        <p className="sub">{t('register.subtitle')}</p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label>{t('register.companyName')}</label>
            <input className="form-input" required maxLength={128} value={form.china_company_name}
              onChange={e => update('china_company_name', e.target.value)} placeholder={t('register.companyPlaceholder')} />
          </div>
          <div className="form-row">
            <label>{t('register.uscc')}</label>
            <input className="form-input" required minLength={18} maxLength={18} value={form.china_uscc}
              onChange={e => update('china_uscc', e.target.value.toUpperCase())} placeholder={t('register.usccPlaceholder')}
              autoCapitalize="characters" />
          </div>
          <div className="form-row">
            <label>{t('register.license')}</label>
            <input className="form-input" required type="file" accept=".jpg,.jpeg,.png,.pdf"
              onChange={e => setLicense(e.target.files?.[0] || null)} />
            <span className="muted text-sm">{t('register.licenseHint')}</span>
          </div>
          <div className="form-row">
            <label>{t('register.username')}</label>
            <input className="form-input" required minLength={3} maxLength={32} value={form.username}
              onChange={e => update('username', e.target.value)} placeholder={t('register.usernamePlaceholder')} autoComplete="username" />
          </div>
          <div className="form-row">
            <label>{t('register.password')}</label>
            <input className="form-input" required minLength={6} type="password" value={form.password}
              onChange={e => update('password', e.target.value)} placeholder={t('register.passwordPlaceholder')} autoComplete="new-password" />
          </div>
          <div className="form-row">
            <label>{t('register.confirmPassword')}</label>
            <input className="form-input" required minLength={6} type="password" value={form.confirm_password}
              onChange={e => update('confirm_password', e.target.value)} placeholder={t('register.confirmPlaceholder')} autoComplete="new-password" />
          </div>
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg" disabled={busy}>{busy ? t('register.submitting') : t('register.submit')}</button>
        </form>
        <p className="tips">{t('register.reviewHint')}</p>
        <p className="login-back">{t('register.hasAccount')}<Link to="/login">{t('register.login')}</Link> · <Link to="/">{t('login.backHome')}</Link></p>
      </div>
    </div>
  );
}
