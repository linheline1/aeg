import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { roleLabel } from '../lib/roles';

interface Profile {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

const fmtTime = (s?: string) => (s ? s.slice(0, 19).replace('T', ' ') : '—');

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api.get('/api/ops/profile')
      .then(r => setProfile(r.data))
      .catch(e => setLoadErr(getApiErrorMessage(e, '账户信息加载失败')));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErr(''); setOk('');
    if (!currentPassword) { setErr('请输入当前密码'); return; }
    if (newPassword !== newPassword.trim()) { setErr('新密码不能包含首尾空格'); return; }
    if (newPassword.length < 6) { setErr('新密码至少 6 位'); return; }
    if (newPassword !== confirmPassword) { setErr('两次输入的新密码不一致'); return; }
    setBusy(true);
    try {
      await api.patch('/api/ops/profile/password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setOk('密码已更新，下次登录请使用新密码。当前会话保持登录状态。');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) {
      setErr(getApiErrorMessage(e, '修改密码失败'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h1>用户中心</h1>
        <span className="sub">查看账户信息、修改登录密码</span>
      </div>

      {loadErr && <div className="alert alert-err">{loadErr}</div>}

      <div className="card">
        <div className="card-title"><h3>👤 账户信息</h3></div>
        {profile ? (
          <div className="profile-grid">
            <div><span className="profile-k">登录账号</span><strong>{profile.username}</strong></div>
            <div><span className="profile-k">角色</span><strong>{roleLabel(profile.role)}</strong></div>
            <div><span className="profile-k">账号状态</span><strong>{profile.status === 'active' ? '正常' : profile.status}</strong></div>
            <div><span className="profile-k">所属端口</span><strong>运营端</strong></div>
            <div><span className="profile-k">创建时间</span><strong>{fmtTime(profile.created_at)}</strong></div>
            <div><span className="profile-k">最近更新</span><strong>{fmtTime(profile.updated_at)}</strong></div>
          </div>
        ) : (
          !loadErr && <p className="muted">加载中…</p>
        )}
      </div>

      <div className="card" id="password">
        <div className="card-title">
          <h3>🔑 修改密码</h3>
          <span className="muted text-sm">至少 6 位，不能包含首尾空格</span>
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}
        <form onSubmit={submit} className="profile-password-form">
          <div className="form-row">
            <label htmlFor="current-password">当前密码</label>
            <input
              id="current-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="输入正在使用的密码"
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-password">新密码</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="至少 6 位，建议字母 + 数字"
            />
          </div>
          <div className="form-row">
            <label htmlFor="confirm-password">确认新密码</label>
            <input
              id="confirm-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再输入一次新密码"
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? '提交中…' : '保存新密码'}
          </button>
        </form>
      </div>
    </>
  );
}
