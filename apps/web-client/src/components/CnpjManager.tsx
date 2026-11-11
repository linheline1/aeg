import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage as errorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface CnpjAddress {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

interface CnpjRow {
  id: string;
  cnpj: string;
  company_name: string;
  ie?: string | null;
  is_default: boolean;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
  endereco?: Partial<CnpjAddress> | null;
  registry_snapshot?: Record<string, any> | null;
  queried_at?: string | null;
}

interface CnpjForm {
  cnpj: string;
  company_name: string;
  ie: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  endereco: CnpjAddress;
  registry_snapshot: Record<string, any> | null;
  queried_at: string | null;
}

const emptyAddress = (): CnpjAddress => ({
  logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: ''
});

const emptyForm = (): CnpjForm => ({
  cnpj: '', company_name: '', ie: '', nome_fantasia: '', situacao_cadastral: '',
  endereco: emptyAddress(), registry_snapshot: null, queried_at: null
});

function formatAddress(address?: Partial<CnpjAddress> | null) {
  if (!address) return '';
  const street = [address.logradouro, address.numero].filter(Boolean).join(', ');
  return [street, address.complemento, address.bairro, address.municipio, address.uf, address.cep]
    .filter(Boolean).join(' · ');
}

export default function CnpjManager() {
  const { t } = useTranslation();
  const [cnpjs, setCnpjs] = useState<CnpjRow[]>([]);
  const [cnpjForm, setCnpjForm] = useState<CnpjForm>(emptyForm);
  const [cnpjBusy, setCnpjBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [cnpjMsg, setCnpjMsg] = useState<string | null>(null);
  const [cnpjErr, setCnpjErr] = useState<string | null>(null);

  const loadCnpjs = async () => {
    try {
      const r = await api.get('/api/client/cnpjs');
      setCnpjs(r.data || []);
    } catch (e: any) {
      setCnpjErr(errorMessage(e, t('cnpj.loadError')));
    }
  };

  useEffect(() => { loadCnpjs(); }, []);

  const onCnpjChange = (value: string) => {
    setCnpjErr(null);
    setCnpjMsg(null);
    setCnpjForm(prev => ({ ...emptyForm(), cnpj: value, ie: prev.ie }));
  };

  const updateAddress = (field: keyof CnpjAddress, value: string) => {
    setCnpjForm(prev => ({ ...prev, endereco: { ...prev.endereco, [field]: value } }));
  };

  const doCnpjLookup = async () => {
    const digits = cnpjForm.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      setCnpjErr(t('cnpj.invalid'));
      return;
    }
    setLookupBusy(true);
    setCnpjErr(null);
    setCnpjMsg(null);
    try {
      const r = await api.get('/api/client/cnpjs/lookup', {
        params: { cnpj: digits },
        timeout: 15_000
      });
      const data = r.data;
      setCnpjForm(prev => ({
        cnpj: data.cnpj || prev.cnpj,
        company_name: data.company_name || '',
        ie: prev.ie,
        nome_fantasia: data.nome_fantasia || '',
        situacao_cadastral: data.situacao_cadastral || '',
        endereco: { ...emptyAddress(), ...(data.endereco || {}) },
        registry_snapshot: data.registry_snapshot || null,
        queried_at: data.queried_at || null
      }));
      setCnpjMsg(t('cnpj.lookupSuccess'));
    } catch (e: any) {
      setCnpjErr(`${errorMessage(e, t('cnpj.lookupError'))}${t('cnpj.manualSuffix')}`);
    } finally {
      setLookupBusy(false);
    }
  };

  const doCnpjAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!cnpjForm.cnpj || !cnpjForm.ie || !cnpjForm.company_name) return;
    setCnpjBusy(true);
    setCnpjErr(null);
    setCnpjMsg(null);
    try {
      await api.post('/api/client/cnpjs', cnpjForm);
      setCnpjMsg(t('cnpj.saveSuccess'));
      setCnpjForm(emptyForm());
      await loadCnpjs();
    } catch (e: any) {
      setCnpjErr(errorMessage(e, t('cnpj.saveError')));
    } finally {
      setCnpjBusy(false);
    }
  };

  const doCnpjDefault = async (id: string) => {
    setCnpjBusy(true);
    setCnpjErr(null);
    try {
      await api.patch(`/api/client/cnpjs/${id}/default`, {});
      await loadCnpjs();
    } catch (e: any) {
      setCnpjErr(errorMessage(e, t('cnpj.defaultError')));
    } finally {
      setCnpjBusy(false);
    }
  };

  const doCnpjDel = async (id: string) => {
    if (!window.confirm(t('cnpj.deleteConfirm'))) return;
    setCnpjBusy(true);
    setCnpjErr(null);
    try {
      await api.delete(`/api/client/cnpjs/${id}`);
      setCnpjMsg(t('cnpj.deleted'));
      await loadCnpjs();
    } catch (e: any) {
      setCnpjErr(errorMessage(e, t('cnpj.deleteError')));
    } finally {
      setCnpjBusy(false);
    }
  };

  const busy = cnpjBusy || lookupBusy;

  return (
    <div className="card">
      <div className="card-title">
        <h3>🏢 {t('cnpj.cardTitle')}</h3>
        <span className="muted text-sm">{t('cnpj.cardSubtitle')}</span>
      </div>
      <p className="muted text-sm" style={{ margin: '0 0 16px', lineHeight: 1.7 }}>
        {t('cnpj.instructionsBefore')} <strong>ISENTO</strong>{t('cnpj.instructionsAfter')}
      </p>

      <form onSubmit={doCnpjAdd}>
        <div className="cnpj-form-grid">
          <div className="form-row cnpj-field-wide">
            <label>CNPJ</label>
            <div className="row gap-sm cnpj-lookup-row">
              <input className="form-input" placeholder={t('cnpj.cnpjPlaceholder')}
                value={cnpjForm.cnpj} disabled={busy} maxLength={18}
                onChange={e => onCnpjChange(e.target.value)} />
              <button type="button" className="btn btn-ghost" disabled={busy || !cnpjForm.cnpj} onClick={doCnpjLookup}>
                {lookupBusy ? t('cnpj.lookingUp') : t('cnpj.lookup')}
              </button>
            </div>
          </div>
          <div className="form-row">
            <label>{t('cnpj.ieLabel')}</label>
            <input className="form-input" required placeholder={t('cnpj.iePlaceholder')}
              value={cnpjForm.ie} disabled={busy} maxLength={30}
              onChange={e => setCnpjForm({ ...cnpjForm, ie: e.target.value.toUpperCase() })} />
          </div>
          <div className="form-row">
            <label>{t('cnpj.companyLabel')}</label>
            <input className="form-input" required placeholder={t('cnpj.companyPlaceholder')}
              value={cnpjForm.company_name} disabled={busy} maxLength={120}
              onChange={e => setCnpjForm({ ...cnpjForm, company_name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Nome Fantasia</label>
            <input className="form-input" value={cnpjForm.nome_fantasia} disabled={busy} maxLength={200}
              onChange={e => setCnpjForm({ ...cnpjForm, nome_fantasia: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('cnpj.statusLabel')}</label>
            <input className="form-input" value={cnpjForm.situacao_cadastral} disabled={busy} maxLength={80}
              onChange={e => setCnpjForm({ ...cnpjForm, situacao_cadastral: e.target.value })} />
          </div>
          <div className="form-row cnpj-field-wide">
            <label>Logradouro / Número</label>
            <div className="cnpj-address-pair">
              <input className="form-input" placeholder={t('cnpj.street')} value={cnpjForm.endereco.logradouro} disabled={busy}
                onChange={e => updateAddress('logradouro', e.target.value)} />
              <input className="form-input" placeholder={t('cnpj.number')} value={cnpjForm.endereco.numero} disabled={busy}
                onChange={e => updateAddress('numero', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <label>Complemento</label>
            <input className="form-input" value={cnpjForm.endereco.complemento} disabled={busy}
              onChange={e => updateAddress('complemento', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Bairro</label>
            <input className="form-input" value={cnpjForm.endereco.bairro} disabled={busy}
              onChange={e => updateAddress('bairro', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Município / UF</label>
            <div className="cnpj-address-pair">
              <input className="form-input" value={cnpjForm.endereco.municipio} disabled={busy}
                onChange={e => updateAddress('municipio', e.target.value)} />
              <input className="form-input" placeholder="UF" value={cnpjForm.endereco.uf} disabled={busy} maxLength={2}
                onChange={e => updateAddress('uf', e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="form-row">
            <label>CEP</label>
            <input className="form-input" value={cnpjForm.endereco.cep} disabled={busy}
              onChange={e => updateAddress('cep', e.target.value)} />
          </div>
        </div>
        <button className="btn" disabled={busy || !cnpjForm.cnpj || !cnpjForm.ie || !cnpjForm.company_name}>
          {cnpjBusy ? t('cnpj.saving') : t('cnpj.save')}
        </button>
      </form>

      {cnpjErr && <div className="alert alert-err mt-12">{cnpjErr}</div>}
      {cnpjMsg && <div className="alert alert-ok mt-12">{cnpjMsg}</div>}

      {cnpjs.length > 0 && (
        <div className="cnpj-list mt-16">
          {cnpjs.map(c => (
            <div className="cnpj-row" key={c.id}>
              <div className="cnpj-row-main">
                <div className="text-sm" style={{ fontWeight: 600 }}>{c.company_name}</div>
                <div className="muted text-sm cnpj-mono">CNPJ: {c.cnpj} · IE: {c.ie || t('cnpj.notRegistered')}</div>
                {c.nome_fantasia && <div className="muted text-sm">Nome Fantasia: {c.nome_fantasia}</div>}
                {c.situacao_cadastral && <div className="muted text-sm">{t('cnpj.registryStatus')}: {c.situacao_cadastral}</div>}
                {formatAddress(c.endereco) && <div className="muted text-sm">{t('cnpj.address')}: {formatAddress(c.endereco)}</div>}
                {c.queried_at && <div className="muted text-sm">{t('cnpj.queriedAt')}: {c.queried_at.slice(0, 19).replace('T', ' ')}</div>}
              </div>
              <div className="cnpj-row-actions">
                {c.is_default
                  ? <span className="deal-tag deal-default">{t('cnpj.default')}</span>
                  : <span className="deal-tag deal-open">{t('cnpj.alternative')}</span>}
                {!c.is_default && (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => doCnpjDefault(c.id)}>{t('cnpj.setDefault')}</button>
                )}
                <button className="btn btn-sm btn-ghost" disabled={busy} title={t('cnpj.delete')} onClick={() => doCnpjDel(c.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {cnpjs.length === 0 && (
        <p className="muted text-sm" style={{ margin: '16px 0 0' }}>
          {t('cnpj.empty')}
        </p>
      )}
    </div>
  );
}
