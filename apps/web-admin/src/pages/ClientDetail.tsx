import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../store/auth';

interface ClientDetailRow {
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
  status: 'active' | 'disabled';
  username: string | null;
  user_status: 'active' | 'disabled' | null;
  salesperson_name: string | null;
  quote_count: number;
  last_quote_at: string | null;
  created_at: string;
  updated_at: string;
  cnpjs: {
    id: string;
    cnpj: string;
    ie: string | null;
    company_name: string;
    is_default: boolean;
    created_at: string;
  }[];
}

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ClientDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [licenseBusy, setLicenseBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get(`/api/admin/clients/${id}`);
      setDetail(r.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || '客户详情加载失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const review = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !note.trim()) { setErr('驳回认证时必须填写原因'); return; }
    setReviewBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.patch(`/api/admin/clients/${id}/verification`, { status, note });
      setMsg(status === 'approved' ? '✅ 企业认证已通过' : '✅ 已驳回企业认证');
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || '审核失败');
    } finally { setReviewBusy(false); }
  };

  const viewLicense = async () => {
    setLicenseBusy(true);
    setErr(null);
    try {
      const r = await api.get(`/api/admin/clients/${id}/license`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: detail?.license_mime_type || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setErr('营业执照加载失败，请稍后重试');
    } finally { setLicenseBusy(false); }
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h1>客户详情</h1>
          <span className="muted text-sm">{detail?.china_company_name || detail?.name || '查看企业认证、账号与开票资料'}</span>
        </div>
        <Link className="btn btn-ghost" to="/clients">← 返回客户列表</Link>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      {loading ? <div className="card"><p className="muted">客户详情加载中…</p></div> : detail && (
        <>
          <div className="card">
            <div className="card-title">
              <h3>企业认证审核</h3>
              <span className={`status-tag ${detail.verification_status === 'approved' ? 'status-active' : detail.verification_status === 'pending' ? 'status-pending_fee' : 'status-disabled'}`}>
                {detail.verification_status === 'approved' ? '已认证' : detail.verification_status === 'pending' ? '待认证' : '已驳回'}
              </span>
            </div>
            <div className="row gap-md" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
              {detail.license_uploaded
                ? <button className="btn btn-ghost" disabled={licenseBusy} onClick={viewLicense}>{licenseBusy ? '执照加载中…' : `查看营业执照${detail.license_file_name ? `（${detail.license_file_name}）` : ''}`}</button>
                : <span className="muted">未上传营业执照（历史客户）</span>}
              {detail.verified_by && <span className="muted text-sm">审核人：{detail.verified_by} · 审核时间：{fmtTime(detail.verified_at)}</span>}
            </div>
            {detail.verification_note && <p><strong>最近审核备注：</strong>{detail.verification_note}</p>}
            <div className="form-row">
              <label>审核备注{detail.verification_status !== 'approved' && '（驳回时必填）'}</label>
              <textarea className="form-input" rows={3} maxLength={1000} value={note}
                onChange={e => setNote(e.target.value)} placeholder="填写认证意见；驳回时请说明需要客户补充或更正的内容" />
            </div>
            <div className="row gap-sm">
              <button className="btn" disabled={reviewBusy} onClick={() => review('approved')}>认证通过</button>
              <button className="btn btn-danger" disabled={reviewBusy || !note.trim()} onClick={() => review('rejected')}>驳回认证</button>
            </div>
          </div>

          <div className="grid-3">
            <div className="card">
              <div className="card-title"><h3>国内企业认证</h3></div>
              <p><strong>公司全称：</strong>{detail.china_company_name || '未登记'}</p>
              <p><strong>统一社会信用代码：</strong></p>
              <code>{detail.china_uscc || '—'}</code>
            </div>
            <div className="card">
              <div className="card-title"><h3>账号信息</h3></div>
              <p><strong>登录账号：</strong>{detail.username || '未开通'}</p>
              <p><strong>客户状态：</strong>{detail.status === 'active' ? '启用' : '禁用'}</p>
              <p><strong>账号状态：</strong>{detail.user_status === 'active' ? '启用' : detail.user_status === 'disabled' ? '禁用' : '—'}</p>
              <p><strong>客户 ID：</strong></p>
              <code style={{ wordBreak: 'break-all' }}>{detail.id}</code>
            </div>
            <div className="card">
              <div className="card-title"><h3>业务信息</h3></div>
              <p><strong>归属业务员：</strong>{detail.salesperson_name || '未分配'}</p>
              <p><strong>报价数量：</strong>{detail.quote_count}</p>
              <p><strong>最近报价：</strong>{fmtTime(detail.last_quote_at)}</p>
              <p><strong>创建时间：</strong>{fmtTime(detail.created_at)}</p>
              <p><strong>更新时间：</strong>{fmtTime(detail.updated_at)}</p>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <h3>巴西公司开票资料</h3>
              <span className="muted text-sm">用于开具 NF 的 CNPJ、IE 及法定公司名称</span>
            </div>
            {detail.cnpjs.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>法定公司名称</th><th>CNPJ</th><th>IE</th><th>默认抬头</th><th>添加时间</th></tr></thead>
                  <tbody>
                    {detail.cnpjs.map(c => (
                      <tr key={c.id}>
                        <td>{c.company_name}</td>
                        <td><code>{c.cnpj}</code></td>
                        <td><code>{c.ie || '未登记'}</code></td>
                        <td>{c.is_default ? '默认' : '备用'}</td>
                        <td>{fmtTime(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">客户尚未维护巴西公司 CNPJ、IE 开票资料。</p>}
          </div>
        </>
      )}
    </>
  );
}
