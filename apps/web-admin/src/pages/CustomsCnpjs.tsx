import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

type CnpjStatus = 'active' | 'disabled';
type CertificateType = 'a1' | 'ecpf';

interface CertificateMeta {
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
}

interface Cnpj {
  id: string;
  cnpj: string;
  company_name: string;
  status: CnpjStatus;
  quota_limit_usd: number;
  quota_used_usd: number;
  quota_available_usd: number;
  quota_used_percent: number;
  certificates: Record<CertificateType, CertificateMeta | null>;
  created_at: string;
  updated_at: string;
}

interface CnpjForm {
  cnpj: string;
  company_name: string;
  quota_limit_usd: string;
  quota_used_usd: string;
  status: CnpjStatus;
}

const EMPTY_FORM: CnpjForm = {
  cnpj: '',
  company_name: '',
  quota_limit_usd: '',
  quota_used_usd: '0',
  status: 'active'
};

const CERTIFICATE_NAMES: Record<CertificateType, string> = {
  a1: 'Certificado A1',
  ecpf: 'e-CPF'
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

function fmtTime(s?: string | null) {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomsCnpjs() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Cnpj[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Cnpj | null>(null);
  const [form, setForm] = useState<CnpjForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get<Cnpj[]>('/api/admin/customs-cnpjs');
      setRows(r.data);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('customsCnpj.err.loadFail')));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 3000); };

  const updateRow = (row: Cnpj) => {
    setRows(prev => prev.map(item => item.id === row.id ? row : item));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setErr(null);
  };

  const openEdit = (row: Cnpj) => {
    setEditing(row);
    setForm({
      cnpj: row.cnpj,
      company_name: row.company_name,
      quota_limit_usd: String(row.quota_limit_usd),
      quota_used_usd: String(row.quota_used_usd),
      status: row.status
    });
    setFormOpen(true);
    setErr(null);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const validAmount = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  const formValid = form.cnpj.trim() && form.company_name.trim()
    && validAmount(form.quota_limit_usd) && validAmount(form.quota_used_usd);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!formValid) { setErr(t('customsCnpj.err.invalidForm')); return; }
    setSaving(true); setErr(null);
    const body = {
      cnpj: form.cnpj.trim(),
      company_name: form.company_name.trim(),
      quota_limit_usd: Number(form.quota_limit_usd),
      quota_used_usd: Number(form.quota_used_usd),
      status: form.status
    };
    try {
      const r = editing
        ? await api.patch<Cnpj>(`/api/admin/customs-cnpjs/${editing.id}`, body)
        : await api.post<Cnpj>('/api/admin/customs-cnpjs', body);
      if (editing) updateRow(r.data);
      else setRows(prev => [r.data, ...prev]);
      flash(editing ? t('customsCnpj.flash.updated') : t('customsCnpj.flash.created'));
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('customsCnpj.err.loadFail')));
    } finally { setSaving(false); }
  };

  const toggleStatus = async (row: Cnpj) => {
    const next: CnpjStatus = row.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(t('customsCnpj.confirm.disable', { name: row.company_name }))) return;
    setStatusBusyId(row.id); setErr(null);
    try {
      const r = await api.patch<Cnpj>(`/api/admin/customs-cnpjs/${row.id}`, { status: next });
      updateRow(r.data);
      flash(next === 'active' ? t('customsCnpj.flash.enabled') : t('customsCnpj.flash.disabled'));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('customsCnpj.err.updateStatusFail')));
    } finally { setStatusBusyId(null); }
  };

  const selectFile = (key: string, file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    if (!/\.(pfx|p12)$/i.test(file.name)) {
      setErr(t('customsCnpj.err.badCertExt'));
      input.value = '';
      setFiles(prev => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    setErr(null);
    setFiles(prev => ({ ...prev, [key]: file }));
  };

  const upload = async (event: FormEvent<HTMLFormElement>, row: Cnpj, type: CertificateType) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const key = `${row.id}:${type}`;
    const file = files[key];
    const certName = CERTIFICATE_NAMES[type];
    if (!file) { setErr(t('customsCnpj.err.noCert', { certName })); return; }
    setUploadingKey(key); setErr(null);
    const data = new FormData();
    data.append('file', file);
    try {
      const r = await api.post<Cnpj>(`/api/admin/customs-cnpjs/${row.id}/certificates/${type}`, data);
      updateRow(r.data);
      setFiles(prev => { const next = { ...prev }; delete next[key]; return next; });
      formElement.reset();
      flash(t('customsCnpj.flash.certUploaded', { certName }));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('customsCnpj.err.uploadFail', { certName })));
    } finally { setUploadingKey(null); }
  };

  const download = async (row: Cnpj, type: CertificateType) => {
    const meta = row.certificates[type];
    if (!meta) return;
    const certName = CERTIFICATE_NAMES[type];
    const key = `${row.id}:${type}`;
    setDownloadingKey(key); setErr(null);
    try {
      const r = await api.get<Blob>(`/api/admin/customs-cnpjs/${row.id}/certificates/${type}/file`, { responseType: 'blob' });
      await downloadOrShareFile(r.data, meta.file_name);
      flash(t('customsCnpj.flash.certDownloaded', { certName }));
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('customsCnpj.err.downloadFail', { certName })));
    } finally { setDownloadingKey(null); }
  };

  const totals = rows.reduce((sum, row) => ({
    limit: sum.limit + row.quota_limit_usd,
    used: sum.used + row.quota_used_usd,
    available: sum.available + row.quota_available_usd
  }), { limit: 0, used: 0, available: 0 });

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{t('customsCnpj.title')}</h1>
          <div className="subtitle">{t('customsCnpj.subtitle')}</div>
        </div>
        <button className="btn" onClick={openCreate} disabled={saving}>{t('customsCnpj.addBtn')}</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">{t('customsCnpj.label.totalQuota')}</span>
          <span className="value customs-money">{money.format(totals.limit)}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('customsCnpj.label.usedQuota')}</span>
          <span className="value customs-money">{money.format(totals.used)}</span>
        </div>
        <div className="stat-card">
          <span className="label">{t('customsCnpj.label.availableQuota')}</span>
          <span className="value customs-money" style={{ color: 'var(--ok)' }}>{money.format(totals.available)}</span>
        </div>
      </div>

      {err && <div className="alert alert-err" role="alert">❌ {err}</div>}
      {msg && <div className="alert alert-ok" role="status">{msg}</div>}

      {formOpen && (
        <form className="card" onSubmit={save}>
          <div className="card-title">
            <h3>{editing ? t('customsCnpj.form.editTitle') : t('customsCnpj.form.addTitle')}</h3>
            <button className="btn btn-ghost btn-sm" type="button" onClick={closeForm} disabled={saving}>{t('customsCnpj.form.cancel')}</button>
          </div>
          <div className="customs-form-grid">
            <div className="form-row">
              <label htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" className="form-input" value={form.cnpj} onChange={e => setForm(prev => ({ ...prev, cnpj: e.target.value }))} placeholder="如：12.345.678/0001-90" disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="company_name">{t('customsCnpj.form.companyName')}</label>
              <input id="company_name" className="form-input" value={form.company_name} onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder={t('customsCnpj.form.companyNamePlaceholder')} disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="quota_limit_usd">{t('customsCnpj.form.quotaLimit')}</label>
              <input id="quota_limit_usd" className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.quota_limit_usd} onChange={e => setForm(prev => ({ ...prev, quota_limit_usd: e.target.value }))} disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="quota_used_usd">{t('customsCnpj.form.quotaUsed')}</label>
              <input id="quota_used_usd" className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.quota_used_usd} onChange={e => setForm(prev => ({ ...prev, quota_used_usd: e.target.value }))} disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="cnpj_status">{t('customsCnpj.form.statusLabel')}</label>
              <select id="cnpj_status" className="form-input" value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as CnpjStatus }))} disabled={saving}>
                <option value="active">{t('customsCnpj.form.statusActive')}</option>
                <option value="disabled">{t('customsCnpj.form.statusDisabled')}</option>
              </select>
            </div>
          </div>
          <div className="row-between customs-form-actions">
            <span className="muted text-sm">{t('customsCnpj.form.hint')}</span>
            <button className="btn" type="submit" disabled={saving || !formValid}>
              {saving ? t('customsCnpj.form.saving') : editing ? t('customsCnpj.form.saveEdit') : t('customsCnpj.form.saveAdd')}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-title">
          <h3>{t('customsCnpj.list.title')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? t('customsCnpj.list.loading') : t('customsCnpj.list.refresh')}
          </button>
        </div>
        {loading ? (
          <p className="muted">{t('customsCnpj.list.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t('customsCnpj.list.noData')}</p>
        ) : (
          <div className="table-wrap customs-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('customsCnpj.col.cnpjCompany')}</th>
                  <th className="num">{t('customsCnpj.col.totalQuota')}</th>
                  <th className="num">{t('customsCnpj.col.usedAvailable')}</th>
                  <th>{t('customsCnpj.col.usageRate')}</th>
                  <th>{t('customsCnpj.col.status')}</th>
                  <th>{t('customsCnpj.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const expanded = expandedId === row.id;
                  const percent = Number.isFinite(row.quota_used_percent) ? row.quota_used_percent : 0;
                  return (
                    <CnpjRows
                      key={row.id}
                      row={row}
                      expanded={expanded}
                      percent={percent}
                      files={files}
                      statusBusy={statusBusyId === row.id}
                      uploadingKey={uploadingKey}
                      downloadingKey={downloadingKey}
                      onExpand={() => setExpandedId(expanded ? null : row.id)}
                      onEdit={() => openEdit(row)}
                      onToggle={() => toggleStatus(row)}
                      onSelectFile={selectFile}
                      onUpload={upload}
                      onDownload={download}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

interface CnpjRowsProps {
  row: Cnpj;
  expanded: boolean;
  percent: number;
  files: Record<string, File>;
  statusBusy: boolean;
  uploadingKey: string | null;
  downloadingKey: string | null;
  onExpand: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onSelectFile: (key: string, file: File | undefined, input: HTMLInputElement) => void;
  onUpload: (event: FormEvent<HTMLFormElement>, row: Cnpj, type: CertificateType) => void;
  onDownload: (row: Cnpj, type: CertificateType) => void;
}

function CnpjRows({ row, expanded, percent, files, statusBusy, uploadingKey, downloadingKey, onExpand, onEdit, onToggle, onSelectFile, onUpload, onDownload }: CnpjRowsProps) {
  const { t } = useTranslation();
  return (
    <>
      <tr>
        <td>
          <strong>{row.company_name}</strong>
          <span className="sub">{row.cnpj}</span>
        </td>
        <td className="num">{money.format(row.quota_limit_usd)}</td>
        <td className="num">
          {money.format(row.quota_used_usd)}
          <span className="sub">{t('customsCnpj.available', { quota: money.format(row.quota_available_usd) })}</span>
        </td>
        <td>
          <div className="quota-cell">
            <div className="quota-track" role="progressbar" aria-label={t('customsCnpj.ariaLabel.usage', { company: row.company_name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, percent))}>
              <span className={percent >= 90 ? 'quota-bar quota-bar-warn' : 'quota-bar'} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
            </div>
            <span className="text-sm text-num">{percent.toFixed(1)}%</span>
          </div>
        </td>
        <td>
          <span className={`status-tag ${row.status === 'active' ? 'status-active' : 'status-disabled'}`}>
            {row.status === 'active' ? t('customsCnpj.status.active') : t('customsCnpj.status.disabled')}
          </span>
        </td>
        <td>
          <div className="row gap-sm customs-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={onExpand} aria-expanded={expanded}>
              {expanded ? t('customsCnpj.action.collapse') : t('customsCnpj.action.manageCerts')}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onEdit} disabled={statusBusy}>{t('customsCnpj.action.edit')}</button>
            <button className={`btn btn-sm ${row.status === 'active' ? 'btn-danger' : 'btn-ghost'}`} type="button" onClick={onToggle} disabled={statusBusy}>
              {statusBusy ? t('customsCnpj.action.processing') : row.status === 'active' ? t('customsCnpj.action.toggleDisable') : t('customsCnpj.action.toggleEnable')}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="certificate-row">
          <td colSpan={6}>
            <div className="certificate-grid">
              {(['a1', 'ecpf'] as CertificateType[]).map(type => {
                const meta = row.certificates[type];
                const key = `${row.id}:${type}`;
                const uploading = uploadingKey === key;
                const downloading = downloadingKey === key;
                const certName = CERTIFICATE_NAMES[type];
                return (
                  <section className="certificate-card" key={type} aria-label={certName}>
                    <div className="row-between">
                      <strong>{certName}</strong>
                      <span className={`status-tag ${meta ? 'status-active' : 'status-disabled'}`}>
                        {meta ? t('customsCnpj.cert.uploaded') : t('customsCnpj.cert.notUploaded')}
                      </span>
                    </div>
                    {meta ? (
                      <div className="certificate-meta">
                        <span title={meta.file_name}>{meta.file_name}</span>
                        <span>{fmtSize(meta.size_bytes)} · {t('customsCnpj.cert.uploadedAt', { time: fmtTime(meta.uploaded_at) })}</span>
                      </div>
                    ) : <p className="muted text-sm">{t('customsCnpj.cert.noCertHint')}</p>}
                    <form onSubmit={event => onUpload(event, row, type)}>
                      <label className="certificate-file-label" htmlFor={`certificate-${key}`}>{t('customsCnpj.cert.selectFile')}</label>
                      <input
                        id={`certificate-${key}`}
                        className="certificate-file-input"
                        type="file"
                        accept=".pfx,.p12,application/x-pkcs12"
                        disabled={uploading}
                        onChange={event => onSelectFile(key, event.target.files?.[0], event.currentTarget)}
                      />
                      <div className="row gap-sm mt-12">
                        <button className="btn btn-sm" type="submit" disabled={uploading || !files[key]}>
                          {uploading ? t('customsCnpj.cert.uploading') : meta ? t('customsCnpj.cert.replace') : t('customsCnpj.cert.upload')}
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" disabled={!meta || downloading} onClick={() => onDownload(row, type)}>
                          {downloading ? t('customsCnpj.cert.downloading') : t('customsCnpj.cert.download')}
                        </button>
                      </div>
                    </form>
                  </section>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
