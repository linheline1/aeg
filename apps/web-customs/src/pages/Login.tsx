import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logo from '../assets/logo.png';
import Icon from '../components/Icon';
import { errorMessage, useAuth } from '../store/auth';

export default function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(t('login.invalid'));
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason, t('login.wrong')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-label={t('login.title')}>
        <div className="login-brand"><img src={logo} alt="AEG" /><strong>AEG DDP</strong></div>
        <div>
          <span className="eyebrow">{t('login.eyebrow')}</span>
          <h1>{t('login.headline')}</h1>
          <p>{t('login.desc')}</p>
        </div>
        <div className="login-feature"><Icon name="check" /><span>{t('login.feature')}</span></div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <div className="mobile-login-logo"><img src={logo} alt="AEG" /></div>
        <span className="eyebrow">{t('login.accessRestricted')}</span>
        <h2 id="login-title">{t('login.title')}</h2>
        <p className="muted">{t('login.subtitle')}</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="username">{t('login.username')}</label>
            <input id="username" className="form-input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <input id="password" className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} />
          </div>
          {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
          <button className="btn btn-lg login-submit" type="submit" disabled={busy}>
            {busy ? <><span className="spinner spinner-light" />{t('login.busy')}</> : <>{t('login.submit')}<Icon name="arrow" size={18} /></>}
          </button>
        </form>
        <p className="login-help"><Icon name="alert" size={16} />{t('login.help')}</p>
      </section>
    </main>
  );
}
