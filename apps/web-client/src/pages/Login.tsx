import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Login() {
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
      nav('/home');
    } catch (res: any) {
      setErr(getApiErrorMessage(res, '登录失败'));
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">
          <img className="logo-dot-lg" src={logo} alt="AEG" />
        </div>
        <h1>AEG DDP</h1>
        <p className="sub">客户端 · 客户自助报价平台</p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label>账号</label>
            <input
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>密码</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg">登 录</button>
        </form>
        <p className="login-back"><Link to="/register">注册国内企业账号</Link> · <Link to="/">返回首页</Link></p>
      </div>
    </div>
  );
}
