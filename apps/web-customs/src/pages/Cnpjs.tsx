import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, ErrorMessage, Loading, SuccessMessage } from '../components/Feedback';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { api, errorMessage } from '../store/auth';
import type { Cnpj } from '../types';
import { usd, dateTime, number, percent } from '../utils/format';

export default function Cnpjs() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Cnpj[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState<Cnpj | null>(null);
  const [limit, setLimit] = useState('');
  const [used, setUsed] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await api.get<Cnpj[]>('/api/customs/cnpjs')).data); }
    catch (reason) { setError(errorMessage(reason, t('cnpjs.loadError'))); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openEdit = (cnpj: Cnpj) => {
    setEditing(cnpj); setLimit(String(cnpj.quota_limit_usd)); setUsed(String(cnpj.quota_used_usd)); setFormError(''); setSuccess('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const quotaLimit = Number(limit.replace(',', '.'));
    const quotaUsed = Number(used.replace(',', '.'));
    if (!Number.isFinite(quotaLimit) || quotaLimit < 0 || !Number.isFinite(quotaUsed) || quotaUsed < 0) {
      setFormError(t('cnpjs.invalidValues')); return;
    }
    setSaving(true); setFormError('');
    try {
      const response = await api.patch<Cnpj>(`/api/customs/cnpjs/${editing.id}`, { quota_limit_usd: quotaLimit, quota_used_usd: quotaUsed });
      setItems((current) => current?.map((item) => item.id === response.data.id ? response.data : item) || null);
      setEditing(null); setSuccess(t('cnpjs.updateSuccess', { company: response.data.company_name }));
    } catch (reason) { setFormError(errorMessage(reason, t('cnpjs.updateError'))); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{t('cnpjs.eyebrow')}</span><h1>{t('cnpjs.title')}</h1><p>{t('cnpjs.description')}</p></div><button className="btn btn-ghost" onClick={load} disabled={loading}><Icon name="refresh" size={18} />{t('common.refresh')}</button></div>
      {success && <SuccessMessage>{success}</SuccessMessage>}
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && !items ? <Loading label={t('cnpjs.loading')} /> : items?.length === 0 ? <Empty title={t('cnpjs.emptyTitle')} description={t('cnpjs.emptyDescription')} /> : items && <div className="cnpj-grid">{items.map((item) => <article className="card cnpj-card" key={item.id}>
        <div className="cnpj-header"><div><span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{t(item.status === 'active' ? 'cnpjs.active' : 'cnpjs.disabled')}</span><h2>{item.company_name}</h2><p>CNPJ {item.cnpj}</p></div><button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}><Icon name="edit" size={17} />{t('cnpjs.editQuota')}</button></div>
        <div className="quota-values"><div><span>{t('cnpjs.totalLimit')}</span><strong>{usd(item.quota_limit_usd)}</strong></div><div><span>{t('cnpjs.used')}</span><strong>{usd(item.quota_used_usd)}</strong></div><div><span>{t('cnpjs.available')}</span><strong className="positive">{usd(item.quota_available_usd)}</strong></div></div>
        <div className="quota-progress"><div className="progress-label"><span>{t('cnpjs.quotaUsage')}</span><strong>{percent(item.quota_used_percent)}</strong></div><div className="progress-track" role="progressbar" aria-label={t('cnpjs.quotaUsageAria', { company: item.company_name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, item.quota_used_percent))}><span style={{ width: `${Math.min(100, Math.max(0, item.quota_used_percent))}%` }} /></div></div>
        <div className="certificates"><h3>{t('cnpjs.certificates')}</h3><div className="certificate-row"><div><Icon name="file" /><span><strong>{t('cnpjs.certA1')}</strong><small>{item.certificates.a1 ? t('cnpjs.configuredAt', { date: dateTime(item.certificates.a1.uploaded_at) }) : t('cnpjs.notConfigured')}</small></span></div><span className={`certificate-status ${item.certificates.a1 ? 'configured' : ''}`}>{t(item.certificates.a1 ? 'cnpjs.configured' : 'cnpjs.pending')}</span></div><div className="certificate-row"><div><Icon name="file" /><span><strong>{t('cnpjs.certEcpf')}</strong><small>{item.certificates.ecpf ? t('cnpjs.configuredAt', { date: dateTime(item.certificates.ecpf.uploaded_at) }) : t('cnpjs.notConfigured')}</small></span></div><span className={`certificate-status ${item.certificates.ecpf ? 'configured' : ''}`}>{t(item.certificates.ecpf ? 'cnpjs.configured' : 'cnpjs.pending')}</span></div></div>
        <small className="updated-note">{t('cnpjs.updatedUsage', { date: dateTime(item.updated_at), percent: number(item.quota_used_percent) })}</small>
      </article>)}</div>}
      {editing && <Modal title={t('cnpjs.editTitle', { company: editing.company_name })} onClose={() => { if (!saving) setEditing(null); }}><form onSubmit={save}><p className="modal-description">{t('cnpjs.editDescription', { cnpj: editing.cnpj })}</p><div className="field"><label htmlFor="quota-limit">{t('cnpjs.totalLimitUsd')}</label><input id="quota-limit" className="form-input" type="number" min="0" step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} required disabled={saving} /></div><div className="field"><label htmlFor="quota-used">{t('cnpjs.usedUsd')}</label><input id="quota-used" className="form-input" type="number" min="0" step="0.01" value={used} onChange={(event) => setUsed(event.target.value)} required disabled={saving} /></div>{formError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{formError}</div>}<div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>{t('common.cancel')}</button><button className="btn" type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.saveChanges')}</button></div></form></Modal>}
    </>
  );
}
