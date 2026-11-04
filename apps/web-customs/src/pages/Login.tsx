import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import Icon from '../components/Icon';
import { errorMessage, useAuth } from '../store/auth';

export default function Login() {
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
      setError('Informe o usuário e a senha para continuar.');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || '/', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason, 'Usuário ou senha inválidos. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-label="Apresentação">
        <div className="login-brand"><img src={logo} alt="AEG" /><strong>AEG DDP</strong></div>
        <div><span className="eyebrow">Conectando operações globais</span><h1>Clareza em cada etapa do desembaraço.</h1><p>Análise de DI, tributos e cotas em um fluxo seguro, feito para a sua rotina aduaneira.</p></div>
        <div className="login-feature"><Icon name="check" /><span>Dados centralizados e histórico de revisões</span></div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <div className="mobile-login-logo"><img src={logo} alt="AEG" /></div>
        <span className="eyebrow">Acesso restrito</span>
        <h2 id="login-title">Portal do despachante</h2>
        <p className="muted">Entre com suas credenciais profissionais.</p>
        <form onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="username">Usuário</label><input id="username" className="form-input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required disabled={busy} /></div>
          <div className="field"><label htmlFor="password">Senha</label><input id="password" className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></div>
          {error && <div className="form-error" role="alert"><Icon name="alert" size={18} />{error}</div>}
          <button className="btn btn-lg login-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner spinner-light" />Entrando…</> : <>Acessar portal<Icon name="arrow" size={18} /></>}</button>
        </form>
        <p className="login-help"><Icon name="alert" size={16} />Acesso permitido somente a contas de despacho aduaneiro.</p>
      </section>
    </main>
  );
}
