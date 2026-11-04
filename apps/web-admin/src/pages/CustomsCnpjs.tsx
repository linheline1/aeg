import { FormEvent, useEffect, useState } from 'react';
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
      setErr(getApiErrorMessage(e, '加载进口抬头失败'));
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
    if (!formValid) { setErr('请完整填写抬头信息，额度须为不小于 0 的数字'); return; }
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
      flash(editing ? '✅ 进口抬头已更新' : '✅ 进口抬头已创建');
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, `${editing ? '更新' : '创建'}进口抬头失败`));
    } finally { setSaving(false); }
  };

  const toggleStatus = async (row: Cnpj) => {
    const next: CnpjStatus = row.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !window.confirm(`确认停用「${row.company_name}」？`)) return;
    setStatusBusyId(row.id); setErr(null);
    try {
      const r = await api.patch<Cnpj>(`/api/admin/customs-cnpjs/${row.id}`, { status: next });
      updateRow(r.data);
      flash(next === 'active' ? '✅ 进口抬头已启用' : '✅ 进口抬头已停用');
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '更新抬头状态失败'));
    } finally { setStatusBusyId(null); }
  };

  const selectFile = (key: string, file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    if (!/\.(pfx|p12)$/i.test(file.name)) {
      setErr('证书仅支持 .pfx 或 .p12 文件');
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
    if (!file) { setErr(`请选择要上传的${CERTIFICATE_NAMES[type]}证书`); return; }
    setUploadingKey(key); setErr(null);
    const data = new FormData();
    data.append('file', file);
    try {
      const r = await api.post<Cnpj>(`/api/admin/customs-cnpjs/${row.id}/certificates/${type}`, data);
      updateRow(r.data);
      setFiles(prev => { const next = { ...prev }; delete next[key]; return next; });
      formElement.reset();
      flash(`✅ ${CERTIFICATE_NAMES[type]}证书已上传`);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, `${CERTIFICATE_NAMES[type]}证书上传失败`));
    } finally { setUploadingKey(null); }
  };

  const download = async (row: Cnpj, type: CertificateType) => {
    const meta = row.certificates[type];
    if (!meta) return;
    const key = `${row.id}:${type}`;
    setDownloadingKey(key); setErr(null);
    try {
      const r = await api.get<Blob>(`/api/admin/customs-cnpjs/${row.id}/certificates/${type}/file`, { responseType: 'blob' });
      await downloadOrShareFile(r.data, meta.file_name);
      flash(`✅ ${CERTIFICATE_NAMES[type]}证书已开始下载`);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, `${CERTIFICATE_NAMES[type]}证书下载失败`));
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
          <h1>进口抬头</h1>
          <div className="subtitle">管理进口 CNPJ、额度与巴西数字证书</div>
        </div>
        <button className="btn" onClick={openCreate} disabled={saving}>新增抬头</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="label">总额度（USD）</span>
          <span className="value customs-money">{money.format(totals.limit)}</span>
        </div>
        <div className="stat-card">
          <span className="label">已用额度（USD）</span>
          <span className="value customs-money">{money.format(totals.used)}</span>
        </div>
        <div className="stat-card">
          <span className="label">可用额度（USD）</span>
          <span className="value customs-money" style={{ color: 'var(--ok)' }}>{money.format(totals.available)}</span>
        </div>
      </div>

      {err && <div className="alert alert-err" role="alert">❌ {err}</div>}
      {msg && <div className="alert alert-ok" role="status">{msg}</div>}

      {formOpen && (
        <form className="card" onSubmit={save}>
          <div className="card-title">
            <h3>{editing ? '编辑进口抬头' : '新增进口抬头'}</h3>
            <button className="btn btn-ghost btn-sm" type="button" onClick={closeForm} disabled={saving}>取消</button>
          </div>
          <div className="customs-form-grid">
            <div className="form-row">
              <label htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" className="form-input" value={form.cnpj} onChange={e => setForm(prev => ({ ...prev, cnpj: e.target.value }))} placeholder="如：12.345.678/0001-90" disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="company_name">公司名称</label>
              <input id="company_name" className="form-input" value={form.company_name} onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder="进口企业名称" disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="quota_limit_usd">总额度（USD）</label>
              <input id="quota_limit_usd" className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.quota_limit_usd} onChange={e => setForm(prev => ({ ...prev, quota_limit_usd: e.target.value }))} disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="quota_used_usd">已用额度（USD）</label>
              <input id="quota_used_usd" className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.quota_used_usd} onChange={e => setForm(prev => ({ ...prev, quota_used_usd: e.target.value }))} disabled={saving} required />
            </div>
            <div className="form-row">
              <label htmlFor="cnpj_status">状态</label>
              <select id="cnpj_status" className="form-input" value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as CnpjStatus }))} disabled={saving}>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>
          </div>
          <div className="row-between customs-form-actions">
            <span className="muted text-sm">可用额度与使用率由系统根据总额度和已用额度计算</span>
            <button className="btn" type="submit" disabled={saving || !formValid}>{saving ? '保存中…' : editing ? '保存修改' : '创建抬头'}</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-title">
          <h3>抬头列表</h3>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
        </div>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : rows.length === 0 ? (
          <p className="muted">暂无进口抬头，请点击“新增抬头”创建。</p>
        ) : (
          <div className="table-wrap customs-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>CNPJ / 公司名称</th>
                  <th className="num">总额度</th>
                  <th className="num">已用 / 可用</th>
                  <th>使用率</th>
                  <th>状态</th>
                  <th>操作</th>
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
          <span className="sub">可用 {money.format(row.quota_available_usd)}</span>
        </td>
        <td>
          <div className="quota-cell">
            <div className="quota-track" role="progressbar" aria-label={`${row.company_name}额度使用率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, percent))}>
              <span className={percent >= 90 ? 'quota-bar quota-bar-warn' : 'quota-bar'} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
            </div>
            <span className="text-sm text-num">{percent.toFixed(1)}%</span>
          </div>
        </td>
        <td>
          <span className={`status-tag ${row.status === 'active' ? 'status-active' : 'status-disabled'}`}>{row.status === 'active' ? '启用' : '停用'}</span>
        </td>
        <td>
          <div className="row gap-sm customs-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={onExpand} aria-expanded={expanded}>{expanded ? '收起证书' : '证书管理'}</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onEdit} disabled={statusBusy}>编辑</button>
            <button className={`btn btn-sm ${row.status === 'active' ? 'btn-danger' : 'btn-ghost'}`} type="button" onClick={onToggle} disabled={statusBusy}>
              {statusBusy ? '处理中…' : row.status === 'active' ? '停用' : '启用'}
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
                return (
                  <section className="certificate-card" key={type} aria-label={CERTIFICATE_NAMES[type]}>
                    <div className="row-between">
                      <strong>{CERTIFICATE_NAMES[type]}</strong>
                      <span className={`status-tag ${meta ? 'status-active' : 'status-disabled'}`}>{meta ? '已上传' : '未上传'}</span>
                    </div>
                    {meta ? (
                      <div className="certificate-meta">
                        <span title={meta.file_name}>{meta.file_name}</span>
                        <span>{fmtSize(meta.size_bytes)} · 上传于 {fmtTime(meta.uploaded_at)}</span>
                      </div>
                    ) : <p className="muted text-sm">请上传 .pfx 或 .p12 格式的证书文件。</p>}
                    <form onSubmit={event => onUpload(event, row, type)}>
                      <label className="certificate-file-label" htmlFor={`certificate-${key}`}>选择证书文件</label>
                      <input
                        id={`certificate-${key}`}
                        className="certificate-file-input"
                        type="file"
                        accept=".pfx,.p12,application/x-pkcs12"
                        disabled={uploading}
                        onChange={event => onSelectFile(key, event.target.files?.[0], event.currentTarget)}
                      />
                      <div className="row gap-sm mt-12">
                        <button className="btn btn-sm" type="submit" disabled={uploading || !files[key]}>{uploading ? '上传中…' : meta ? '替换证书' : '上传证书'}</button>
                        <button className="btn btn-ghost btn-sm" type="button" disabled={!meta || downloading} onClick={() => onDownload(row, type)}>{downloading ? '下载中…' : '下载证书'}</button>
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
