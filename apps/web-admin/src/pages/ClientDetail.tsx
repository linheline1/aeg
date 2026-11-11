import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { openOrShareFile } from '@aeg/web-shared/file-actions';
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
  const { t } = useTranslation();
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
      setErr(getApiErrorMessage(e, t('client.detail.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const review = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !note.trim()) { setErr(t('client.detail.err.rejectNeedNote')); return; }
    setReviewBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.patch(`/api/admin/clients/${id}/verification`, { status, note });
      setMsg(status === 'approved' ? t('client.detail.flash.approved') : t('client.detail.flash.rejected'));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('client.detail.err.reviewFail')));
    } finally { setReviewBusy(false); }
  };

  const viewLicense = async () => {
    setLicenseBusy(true);
    setErr(null);
    try {
      const r = await api.get(`/api/admin/clients/${id}/license`, { responseType: 'blob' });
      const mimeType = detail?.license_mime_type || 'application/octet-stream';
      const fileName = detail?.license_file_name || `营业执照.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`;
      await openOrShareFile(new Blob([r.data], { type: mimeType }), fileName);
    } catch (e: any) {
      setErr(t('client.detail.err.licenseFail'));
    } finally { setLicenseBusy(false); }
  };

  const suffix = detail && detail.verification_status !== 'approved' ? t('client.detail.noteRequired') : '';

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{t('client.detail.title')}</h1>
          <span className="muted text-sm">{detail?.china_company_name || detail?.name || t('client.detail.subtitle')}</span>
        </div>
        <Link className="btn btn-ghost" to="/clients">{t('client.detail.back')}</Link>
      </div>

      {err && <div className="alert alert-err">❌ {err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      {loading ? <div className="card"><p className="muted">{t('client.detail.loading')}</p></div> : detail && (
        <>
          <div className="card">
            <div className="card-title">
              <h3>{t('client.detail.reviewTitle')}</h3>
              <span className={`status-tag ${detail.verification_status === 'approved' ? 'status-active' : detail.verification_status === 'pending' ? 'status-pending_fee' : 'status-disabled'}`}>
                {detail.verification_status === 'approved' ? t('client.verify.approved') : detail.verification_status === 'pending' ? t('client.verify.pending') : t('client.verify.rejected')}
              </span>
            </div>
            <div className="row gap-md" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
              {detail.license_uploaded
                ? <button className="btn btn-ghost" disabled={licenseBusy} onClick={viewLicense}>
                    {licenseBusy
                      ? t('client.detail.licenseLoading')
                      : t('client.detail.viewLicense', { fileName: detail.license_file_name ? `（${detail.license_file_name}）` : '' })}
                  </button>
                : <span className="muted">{t('client.detail.noLicense')}</span>}
              {detail.verified_by && <span className="muted text-sm">{t('client.detail.reviewerInfo', { by: detail.verified_by, at: fmtTime(detail.verified_at) })}</span>}
            </div>
            {detail.verification_note && <p>{t('client.detail.lastNote', { note: detail.verification_note })}</p>}
            <div className="form-row">
              <label>{t('client.detail.noteLabel', { suffix })}</label>
              <textarea className="form-input" rows={3} maxLength={1000} value={note}
                onChange={e => setNote(e.target.value)} placeholder={t('client.detail.notePlaceholder')} />
            </div>
            <div className="row gap-sm">
              <button className="btn" disabled={reviewBusy} onClick={() => review('approved')}>{t('client.detail.verifyBtn')}</button>
              <button className="btn btn-danger" disabled={reviewBusy || !note.trim()} onClick={() => review('rejected')}>{t('client.detail.rejectBtn')}</button>
            </div>
          </div>

          <div className="grid-3">
            <div className="card">
              <div className="card-title"><h3>{t('client.detail.chinaTitle')}</h3></div>
              <p>{t('client.detail.companyName', { name: detail.china_company_name || t('client.detail.notRegistered') })}</p>
              <p>{t('client.detail.usccLabel')}</p>
              <code>{detail.china_uscc || t('common.dash')}</code>
            </div>
            <div className="card">
              <div className="card-title"><h3>{t('client.detail.accountTitle')}</h3></div>
              <p>{t('client.detail.loginAccount', { account: detail.username || t('client.detail.accountNotOpened') })}</p>
              <p>{t('client.detail.customerStatus', { status: detail.status === 'active' ? t('client.status.active') : t('client.status.disabled') })}</p>
              <p>{t('client.detail.accountStatusLabel', { status: detail.user_status === 'active' ? t('client.status.active') : detail.user_status === 'disabled' ? t('client.status.disabled') : t('common.dash') })}</p>
              <p>{t('client.detail.customerId')}</p>
              <code style={{ wordBreak: 'break-all' }}>{detail.id}</code>
            </div>
            <div className="card">
              <div className="card-title"><h3>{t('client.detail.businessTitle')}</h3></div>
              <p>{t('client.detail.salespersonLabel', { name: detail.salesperson_name || t('client.detail.notAssigned') })}</p>
              <p>{t('client.detail.quoteCountLabel', { count: detail.quote_count })}</p>
              <p>{t('client.detail.lastQuote', { time: fmtTime(detail.last_quote_at) })}</p>
              <p>{t('client.detail.createdAtLabel', { time: fmtTime(detail.created_at) })}</p>
              <p>{t('client.detail.updatedAtLabel', { time: fmtTime(detail.updated_at) })}</p>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <h3>{t('client.detail.cnpjTitle')}</h3>
              <span className="muted text-sm">{t('client.detail.cnpjSub')}</span>
            </div>
            {detail.cnpjs.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>{t('client.detail.col.companyLegal')}</th>
                    <th>{t('client.detail.col.cnpj')}</th>
                    <th>{t('client.detail.col.ie')}</th>
                    <th>{t('client.detail.col.defaultTitle')}</th>
                    <th>{t('client.detail.col.addedAt')}</th>
                  </tr></thead>
                  <tbody>
                    {detail.cnpjs.map(c => (
                      <tr key={c.id}>
                        <td>{c.company_name}</td>
                        <td><code>{c.cnpj}</code></td>
                        <td><code>{c.ie || t('client.detail.ie.unregistered')}</code></td>
                        <td>{c.is_default ? t('client.detail.default') : t('client.detail.backup')}</td>
                        <td>{fmtTime(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">{t('client.detail.noCnpj')}</p>}
          </div>
        </>
      )}
    </>
  );
}
