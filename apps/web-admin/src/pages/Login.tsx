import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoginCaptcha } from '../../../web-client/src/components/LoginCaptcha';
import { captchaErrorMessage } from '@aeg/web-shared/login-captcha-error';
import { loadRememberedPassword, rememberedUsername, saveRememberedPassword, shouldRememberPassword } from '@aeg/web-shared/remember-password';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
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
    if (!captchaToken) { setErr(t('login.captchaRequired')); return; }
    try {
      await login(username, password, captchaToken);
      await saveRememberedPassword(username, password, remember);
      nav('/');
    } catch (res: any) {
      setCaptchaToken('');
      setCaptchaReset(value => value + 1);
      setErr(captchaErrorMessage(res, t) || res?.response?.data?.message || t('login.wrong'));
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
        <form onSubmit={onSubmit} autoComplete={remember ? 'on' : 'off'}>
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
          <label className="remember-password"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t('login.rememberPassword')}</label>
          <LoginCaptcha language={i18n.language} onChange={setCaptchaToken} resetKey={captchaReset} />
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg">{t('login.submit')}</button>
        </form>
      </div>
    </div>
  );
}
