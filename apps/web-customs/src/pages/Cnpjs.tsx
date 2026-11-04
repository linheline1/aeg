import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorMessage, Loading, SuccessMessage } from '../components/Feedback';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { api, errorMessage } from '../store/auth';
import type { Cnpj } from '../types';
import { usd, dateTime, number, percent } from '../utils/format';

export default function Cnpjs() {
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
    catch (reason) { setError(errorMessage(reason, 'Não foi possível carregar os CNPJs.')); }
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
      setFormError('Informe valores numéricos maiores ou iguais a zero.'); return;
    }
    setSaving(true); setFormError('');
    try {
      const response = await api.patch<Cnpj>(`/api/customs/cnpjs/${editing.id}`, { quota_limit_usd: quotaLimit, quota_used_usd: quotaUsed });
      setItems((current) => current?.map((item) => item.id === response.data.id ? response.data : item) || null);
      setEditing(null); setSuccess(`Cota de ${response.data.company_name} atualizada com sucesso.`);
    } catch (reason) { setFormError(errorMessage(reason, 'Não foi possível atualizar a cota.')); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Cadastros de importação</span><h1>CNPJs e cotas</h1><p>Controle os limites disponíveis e a configuração dos certificados.</p></div><button className="btn btn-ghost" onClick={load} disabled={loading}><Icon name="refresh" size={18} />Atualizar</button></div>
      {success && <SuccessMessage>{success}</SuccessMessage>}
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && !items ? <Loading label="Carregando CNPJs…" /> : items?.length === 0 ? <Empty title="Nenhum CNPJ cadastrado" description="Os cadastros disponíveis aparecerão aqui." /> : items && <div className="cnpj-grid">{items.map((item) => <article className="card cnpj-card" key={item.id}>
        <div className="cnpj-header"><div><span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{item.status === 'active' ? 'Ativo' : 'Desativado'}</span><h2>{item.company_name}</h2><p>CNPJ {item.cnpj}</p></div><button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}><Icon name="edit" size={17} />Editar cota</button></div>
        <div className="quota-values"><div><span>Limite total</span><strong>{usd(item.quota_limit_usd)}</strong></div><div><span>Valor utilizado</span><strong>{usd(item.quota_used_usd)}</strong></div><div><span>Disponível</span><strong className="positive">{usd(item.quota_available_usd)}</strong></div></div>
        <div className="quota-progress"><div className="progress-label"><span>Uso da cota</span><strong>{percent(item.quota_used_percent)}</strong></div><div className="progress-track" role="progressbar" aria-label={`Uso da cota de ${item.company_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, item.quota_used_percent))}><span style={{ width: `${Math.min(100, Math.max(0, item.quota_used_percent))}%` }} /></div></div>
        <div className="certificates"><h3>Certificados digitais</h3><div className="certificate-row"><div><Icon name="file" /><span><strong>Certificado A1</strong><small>{item.certificates.a1 ? `Configurado em ${dateTime(item.certificates.a1.uploaded_at)}` : 'Não configurado'}</small></span></div><span className={`certificate-status ${item.certificates.a1 ? 'configured' : ''}`}>{item.certificates.a1 ? 'Configurado' : 'Pendente'}</span></div><div className="certificate-row"><div><Icon name="file" /><span><strong>Certificado e-CPF</strong><small>{item.certificates.ecpf ? `Configurado em ${dateTime(item.certificates.ecpf.uploaded_at)}` : 'Não configurado'}</small></span></div><span className={`certificate-status ${item.certificates.ecpf ? 'configured' : ''}`}>{item.certificates.ecpf ? 'Configurado' : 'Pendente'}</span></div></div>
        <small className="updated-note">Atualizado em {dateTime(item.updated_at)} · {number(item.quota_used_percent)}% utilizado</small>
      </article>)}</div>}
      {editing && <Modal title={`Editar cota · ${editing.company_name}`} onClose={() => { if (!saving) setEditing(null); }}><form onSubmit={save}><p className="modal-description">CNPJ {editing.cnpj}. Atualize os valores consolidados da cota em dólares americanos (USD).</p><div className="field"><label htmlFor="quota-limit">Limite total (US$)</label><input id="quota-limit" className="form-input" type="number" min="0" step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} required disabled={saving} /></div><div className="field"><label htmlFor="quota-used">Valor utilizado (US$)</label><input id="quota-used" className="form-input" type="number" min="0" step="0.01" value={used} onChange={(event) => setUsed(event.target.value)} required disabled={saving} /></div>{formError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{formError}</div>}<div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button><button className="btn" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></div></form></Modal>}
    </>
  );
}
