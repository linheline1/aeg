import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { openOrShareFile } from '../lib/file-actions';

interface ProfileData {
  id: string;
  username: string;
  status: 'active' | 'disabled';
  created_at: string;
  client: {
    id: string;
    name: string;
    china_company_name: string | null;
    china_uscc: string | null;
    verification_status: 'pending' | 'approved' | 'rejected';
    verification_note: string | null;
    verified_by: string | null;
    verified_at: string | null;
    license_uploaded: boolean;
    license_file_name: string | null;
    license_mime_type: string | null;
    license_size_bytes: number | null;
  };
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [license, setLicense] = useState<File | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseVersion, setLicenseVersion] = useState(0);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/api/client/profile');
      setProfile(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '用户资料加载失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (passwords.new_password !== passwords.confirm_password) { setErr('两次输入的新密码不一致'); return; }
    setPasswordBusy(true);
    try {
      await api.patch('/api/client/profile/password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password
      });
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      setMsg('✅ 密码已修改，下次登录请使用新密码');
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '密码修改失败'));
    } finally { setPasswordBusy(false); }
  };

  const uploadLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!license) { setErr('请选择要上传的营业执照'); return; }
    setLicenseBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const data = new FormData();
      data.append('license', license);
      const r = await api.post('/api/client/profile/license', data);
      setProfile(r.data);
      setLicense(null);
      setLicenseVersion(v => v + 1);
      setMsg('✅ 营业执照已重新提交，企业认证状态已更新为待认证');
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '营业执照上传失败'));
    } finally { setLicenseBusy(false); }
  };

  const viewLicense = async () => {
    setErr(null);
    try {
      const r = await api.get('/api/client/profile/license', { responseType: 'blob' });
      const mimeType = profile?.client.license_mime_type || 'application/octet-stream';
      const fileName = profile?.client.license_file_name || `营业执照.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`;
      await openOrShareFile(new Blob([r.data], { type: mimeType }), fileName);
    } catch { setErr('营业执照加载失败，请稍后重试'); }
  };

  if (loading) return <div className="card"><p className="muted">用户资料加载中…</p></div>;
  if (!profile) return <div className="alert alert-err">❌ {err || '用户资料不存在'}</div>;
  const client = profile.client;
  const statusClass = client.verification_status === 'approved' ? 'status-done' : client.verification_status === 'rejected' ? 'status-failed' : 'status-pending_fee';
  const statusText = client.verification_status === 'approved' ? '已认证' : client.verification_status === 'rejected' ? '已驳回' : '待认证';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>用户中心</h1>
          <p className="muted">账户信息、企业认证与安全设置</p>
        </div>
      </div>
      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title"><h3>👤 账户信息</h3></div>
          <p><strong>登录账号：</strong>{profile.username}</p>
          <p><strong>账户类型：</strong>企业客户账号</p>
          <p><strong>账号状态：</strong>{profile.status === 'active' ? '正常' : '已禁用'}</p>
          <p><strong>注册时间：</strong>{fmtTime(profile.created_at)}</p>
          <p><strong>用户 ID：</strong></p>
          <code style={{ wordBreak: 'break-all' }}>{profile.id}</code>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="card-title"><h3>🏢 国内企业资料</h3></div>
          <p><strong>公司全称：</strong>{client.china_company_name || '未登记'}</p>
          <p><strong>统一社会信用代码：</strong></p>
          <code>{client.china_uscc || '—'}</code>
          <p className="muted text-sm" style={{ marginTop: 16 }}>企业名称与信用代码应与营业执照保持一致。如需更正，请联系我司工作人员。</p>
        </div>
      </div>

      <Link to="/cnpjs" className="card cnpj-profile-entry">
        <div>
          <div className="card-title" style={{ margin: 0 }}><h3>🏢 巴西公司开票资料</h3></div>
          <p className="muted text-sm">查询 CNPJ，维护 Razão Social、IE、登记状态和地址</p>
        </div>
        <span className="btn btn-ghost">管理开票资料</span>
      </Link>

      <div className="card">
        <div className="card-title">
          <h3>✅ 企业认证情况</h3>
          <span className={`status-tag ${statusClass}`}>{statusText}</span>
        </div>
        {client.verification_status === 'pending' && <div className="alert alert-warn">企业资料已提交，我司人员正在核对营业执照，请耐心等待审核。</div>}
        {client.verification_status === 'approved' && <div className="alert alert-ok">企业资料与营业执照已认证通过。</div>}
        {client.verification_status === 'rejected' && <div className="alert alert-err">认证未通过，请根据审核意见更新营业执照后重新提交。</div>}
        {client.verification_note && <p><strong>审核意见：</strong>{client.verification_note}</p>}
        {client.verified_by && <p className="muted text-sm">审核人：{client.verified_by} · 审核时间：{fmtTime(client.verified_at)}</p>}
        <div className="row gap-md" style={{ flexWrap: 'wrap', margin: '14px 0' }}>
          {client.license_uploaded
            ? <button className="btn btn-ghost" onClick={viewLicense}>查看营业执照{client.license_file_name ? `（${client.license_file_name}）` : ''}</button>
            : <span className="muted">尚未上传营业执照</span>}
        </div>
        <form onSubmit={uploadLicense}>
          <div className="form-row">
            <label>{client.verification_status === 'rejected' ? '重新上传营业执照并提交审核' : '更新营业执照'}</label>
            <input key={licenseVersion} className="form-input" required type="file" accept=".jpg,.jpeg,.png,.pdf"
              onChange={e => setLicense(e.target.files?.[0] || null)} />
            <span className="muted text-sm">支持 JPG、PNG、PDF，不超过 10MB；提交后认证状态将变为“待认证”。</span>
          </div>
          <button className="btn" disabled={licenseBusy || !license}>{licenseBusy ? '提交中…' : '上传并提交审核'}</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title"><h3>🔒 修改密码</h3><span className="muted text-sm">为账户安全，请定期更新密码</span></div>
        <form onSubmit={changePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-row">
              <label>当前密码</label>
              <input className="form-input" required type="password" value={passwords.current_password}
                onChange={e => setPasswords({ ...passwords, current_password: e.target.value })} autoComplete="current-password" />
            </div>
            <div className="form-row">
              <label>新密码</label>
              <input className="form-input" required minLength={6} type="password" value={passwords.new_password}
                onChange={e => setPasswords({ ...passwords, new_password: e.target.value })} autoComplete="new-password" placeholder="6-72 位，不含首尾空格" />
            </div>
            <div className="form-row">
              <label>确认新密码</label>
              <input className="form-input" required minLength={6} type="password" value={passwords.confirm_password}
                onChange={e => setPasswords({ ...passwords, confirm_password: e.target.value })} autoComplete="new-password" />
            </div>
          </div>
          <button className="btn" disabled={passwordBusy}>{passwordBusy ? '修改中…' : '确认修改密码'}</button>
        </form>
      </div>
    </>
  );
}
