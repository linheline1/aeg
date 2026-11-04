import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Register() {
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
    if (form.password !== form.confirm_password) { setErr('两次输入的密码不一致'); return; }
    if (!license) { setErr('请上传营业执照'); return; }
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
      setErr(getApiErrorMessage(res, '注册失败，请稍后重试'));
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo"><img className="logo-dot-lg" src={logo} alt="AEG" /></div>
        <h1>企业账号注册</h1>
        <p className="sub">请填写中国境内公司信息，用于企业身份认证</p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label>国内公司名称</label>
            <input className="form-input" required maxLength={128} value={form.china_company_name}
              onChange={e => update('china_company_name', e.target.value)} placeholder="与营业执照一致的公司全称" />
          </div>
          <div className="form-row">
            <label>统一社会信用代码</label>
            <input className="form-input" required minLength={18} maxLength={18} value={form.china_uscc}
              onChange={e => update('china_uscc', e.target.value.toUpperCase())} placeholder="18 位统一社会信用代码"
              autoCapitalize="characters" />
          </div>
          <div className="form-row">
            <label>营业执照</label>
            <input className="form-input" required type="file" accept=".jpg,.jpeg,.png,.pdf"
              onChange={e => setLicense(e.target.files?.[0] || null)} />
            <span className="muted text-sm">上传与上述公司一致的营业执照，JPG、PNG 或 PDF，不超过 10MB。</span>
          </div>
          <div className="form-row">
            <label>登录账号</label>
            <input className="form-input" required minLength={3} maxLength={32} value={form.username}
              onChange={e => update('username', e.target.value)} placeholder="3-32 位字母、数字或 _ . -" autoComplete="username" />
          </div>
          <div className="form-row">
            <label>密码</label>
            <input className="form-input" required minLength={6} type="password" value={form.password}
              onChange={e => update('password', e.target.value)} placeholder="6-72 位，不含首尾空格" autoComplete="new-password" />
          </div>
          <div className="form-row">
            <label>确认密码</label>
            <input className="form-input" required minLength={6} type="password" value={form.confirm_password}
              onChange={e => update('confirm_password', e.target.value)} placeholder="再次输入密码" autoComplete="new-password" />
          </div>
          {err && <p className="err-msg" style={{ textAlign: 'center' }}>❌ {err}</p>}
          <button type="submit" className="btn btn-lg" disabled={busy}>{busy ? '注册中…' : '注册企业账号'}</button>
        </form>
        <p className="tips">提交后由我司人员核对企业资料与营业执照，并完成认证审核。</p>
        <p className="login-back">已有账号？<Link to="/login">直接登录</Link> · <Link to="/">返回首页</Link></p>
      </div>
    </div>
  );
}
