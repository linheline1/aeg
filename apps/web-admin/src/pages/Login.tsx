import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await login(username, password);
      nav('/');
    } catch (res: any) {
      setErr(res.response?.data?.message || t('login.failed'));
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <img className="logo-dot-lg" src={logo} alt="AEG" />
        </div>
        <h1>AEG DDP</h1>
        <p className="sub">{t('sidebar.brandSuffix')} · {t('login.subtitle')}</p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label>{t('login.username')}</label>
            <input
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.usernamePlaceholder')}
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
            />
          </div>
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg">{t('login.submit')}</button>
        </form>
      </div>
    </div>
  );
}
