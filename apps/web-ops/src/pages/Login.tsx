import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { loadRememberedPassword, rememberedUsername, saveRememberedPassword, shouldRememberPassword } from '@aeg/web-shared/remember-password';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(shouldRememberPassword);
  const [err, setErr] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    void loadRememberedPassword().then((saved) => {
      if (saved?.id && saved.password) {
        setUsername(saved.id);
        setPassword(saved.password);
      }
    });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await login(username, password);
      await saveRememberedPassword(username, password, remember);
      nav('/');
    } catch (res: any) {
      setErr(getApiErrorMessage(res, t('login.failed')));
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <img className="logo-dot-lg" src={logo} alt="AEG" />
        </div>
        <h1>AEG DDP</h1>
        <p className="sub">{t('brand.subtitle')} · {t('login.subtitle')}</p>
        <form onSubmit={onSubmit} autoComplete={remember ? 'on' : 'off'}>
          <div className="form-row">
            <label>{t('login.username')}</label>
            <input
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.usernamePlaceholder')}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>{t('login.password')}</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              autoComplete="current-password"
            />
          </div>
          <label className="remember-password"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t('login.rememberPassword')}</label>
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg">{t('login.submit')}</button>
        </form>
      </div>
    </div>
  );
}
