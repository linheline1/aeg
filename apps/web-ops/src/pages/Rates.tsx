import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { useTranslation } from 'react-i18next';

interface FeeRateRow {
  id: string;
  scope: 'global' | 'client';
  client_id: string | null;
  client_name?: string;
  ocean_freight_usd: number;
  port_fee_usd: number;
  br_trucking_brl: number;
  sales_tax_rate?: number;
  sales_markup_rate?: number;
  profit_brl?: number;
  br_clearance_brl: number;
  fx_rate: number;
  updated_by: string;
  updated_at: string;
}

interface RatesData {
  global: FeeRateRow | null;
  overrides: FeeRateRow[];
  clients: { id: string; name: string; status: string }[];
}

interface Fees {
  ocean_freight_usd: number;
  port_fee_usd: number;
  /** 巴西本地拖车费（BRL/柜） */
  br_trucking_brl: number;
  fx_rate: number;
  /** 税基利润加成，存小数（0.20 = 20%） */
  sales_markup_rate: number;
  /** 销售税率，存小数（0.065 = 6.5%） */
  sales_tax_rate: number;
  /** 每票利润（BRL） */
  profit_brl: number;
}

interface RateField {
  key: keyof Fees;
  step: string;
  /** true = 界面按百分数展示，存储仍为小数 */
  percent?: boolean;
}

const DEFAULT_MARKUP_RATE = 0.20;
const DEFAULT_TAX_RATE = 0.065;
const DEFAULT_PROFIT_BRL = 30000;

const feeOf = (row?: Partial<FeeRateRow> | null): Fees => ({
  ocean_freight_usd: row?.ocean_freight_usd ?? 0,
  port_fee_usd: row?.port_fee_usd ?? 0,
  br_trucking_brl: row?.br_trucking_brl ?? 0,
  fx_rate: row?.fx_rate ?? 5,
  sales_markup_rate: row?.sales_markup_rate ?? DEFAULT_MARKUP_RATE,
  sales_tax_rate: row?.sales_tax_rate ?? DEFAULT_TAX_RATE,
  profit_brl: row?.profit_brl ?? DEFAULT_PROFIT_BRL
});

const EMPTY_FEES: Fees = feeOf(null);

const FIELDS: RateField[] = [
  { key: 'ocean_freight_usd', step: '10' },
  { key: 'port_fee_usd', step: '5' },
  { key: 'br_trucking_brl', step: '50' },
  { key: 'fx_rate', step: '0.1' },
  { key: 'sales_markup_rate', step: '1', percent: true },
  { key: 'sales_tax_rate', step: '0.1', percent: true },
  { key: 'profit_brl', step: '1000' }
];

const fieldValue = (fees: Fees, f: RateField) =>
  f.percent ? Math.round(fees[f.key] * 10000) / 100 : fees[f.key];

const fieldSet = (fees: Fees, f: RateField, raw: number): Fees => ({
  ...fees,
  [f.key]: f.percent ? raw / 100 : raw
});

/** 巴西进口税费由 AI DI 预估，不再维护固定清关价格；br_clearance_brl 仅保留兼容旧接口，固定提交 0。 */
const ratePayload = (fees: Fees) => ({ ...fees, br_clearance_brl: 0 });

export default function Rates() {
  const { t } = useTranslation();
  const [data, setData] = useState<RatesData | null>(null);
  const [globalFees, setGlobalFees] = useState<Fees>(EMPTY_FEES);
  const [ovClient, setOvClient] = useState('');
  const [ovFees, setOvFees] = useState<Fees>(EMPTY_FEES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/api/ops/rates').then((r: any) => {
      const d: RatesData = r.data;
      setData(d);
      if (d.global) {
        setGlobalFees(feeOf(d.global));
      }
    }).catch((e: any) => setMsg({ type: 'err', text: getApiErrorMessage(e, '') }));
  };

  useEffect(() => { load(); }, []);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const saveGlobal = async () => {
    setSaving(true);
    try {
      await api.put('/api/ops/rates/global', ratePayload(globalFees));
      flash('ok', t('rates.globalSaved'));
      load();
    } catch (e: any) { flash('err', getApiErrorMessage(e, t('rates.saveError'))); }
    finally { setSaving(false); }
  };

  const startEdit = (row: FeeRateRow) => {
    setEditingId(row.id);
    setOvClient(row.client_id || '');
    setOvFees(feeOf(row));
  };

  const saveOverride = async () => {
    if (!ovClient) return flash('err', t('rates.selectClientError'));
    setSaving(true);
    try {
      await api.put(`/api/ops/rates/client/${ovClient}`, ratePayload(ovFees));
      flash('ok', t(editingId ? 'rates.overrideUpdated' : 'rates.overrideCreated'));
      setEditingId(null); setOvClient(''); setOvFees(EMPTY_FEES);
      load();
    } catch (e: any) { flash('err', getApiErrorMessage(e, t('rates.saveError'))); }
    finally { setSaving(false); }
  };

  const removeOverride = async (row: FeeRateRow) => {
    if (!window.confirm(t('rates.removeConfirm', { name: row.client_name }))) return;
    try {
      await api.delete(`/api/ops/rates/client/${row.client_id}`);
      flash('ok', t('rates.removed'));
      if (editingId === row.id) { setEditingId(null); setOvClient(''); setOvFees(EMPTY_FEES); }
      load();
    } catch (e: any) { flash('err', getApiErrorMessage(e, t('rates.deleteError'))); }
  };

  const overriddenIds = new Set(data?.overrides.map(o => o.client_id) || []);
  const availableClients = data?.clients.filter(c => !overriddenIds.has(c.id)) || [];

  return (
    <>
      <div className="page-title">
        <h1>{t('rates.title')}</h1>
        <button onClick={load} className="btn btn-ghost btn-sm">🔄 {t('common.refresh')}</button>
      </div>
      <p className="muted text-sm" style={{ margin: '0 0 16px' }}>
        {t('rates.description')}
      </p>

      {msg && <div className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-err'}`}>{msg.type === 'ok' ? '✅' : '❌'} {msg.text}</div>}

      {/* 全局默认 */}
      <div className="card">
        <div className="card-title">
          <h3>🌍 {t('rates.globalTitle')}</h3>
          {data?.global && <span className="muted text-sm">{t('rates.updatedBy', { name: data.global.updated_by, time: data.global.updated_at?.slice(0, 19).replace('T', ' ') })}</span>}
        </div>
        <div className="grid-3">
          {FIELDS.map(f => (
            <div className="form-row" key={f.key}>
              <label>{t(`rates.field.${f.key}`)}</label>
              <input
                className="form-input" type="number" step={f.step} min="0"
                value={fieldValue(globalFees, f)}
                onChange={e => setGlobalFees(fieldSet(globalFees, f, Number(e.target.value)))}
              />
            </div>
          ))}
        </div>
        <div className="mt-12">
          <button className="btn" disabled={saving} onClick={saveGlobal}>{saving ? t('common.saving') : `💾 ${t('rates.saveGlobal')}`}</button>
        </div>
      </div>

      {/* 客户覆盖：新增/编辑表单 */}
      <div className="card">
        <div className="card-title">
          <h3>🎯 {t('rates.overrideTitle')}</h3>
          <span className="muted text-sm">{t(editingId ? 'rates.editingOverride' : 'rates.overrideHint')}</span>
        </div>
        <div className="grid-4">
          <div className="form-row">
            <label>{t('rates.client')}</label>
            <select
              className="form-input" value={ovClient} disabled={!!editingId}
              onChange={e => setOvClient(e.target.value)}
            >
              <option value="">{t('rates.selectClient')}</option>
              {(editingId
                ? data?.clients.filter(c => c.id === ovClient)
                : availableClients
              )?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {FIELDS.map(f => (
            <div className="form-row" key={f.key}>
              <label>{t(`rates.field.${f.key}`)}</label>
              <input
                className="form-input" type="number" step={f.step} min="0"
                value={fieldValue(ovFees, f)}
                onChange={e => setOvFees(fieldSet(ovFees, f, Number(e.target.value)))}
              />
            </div>
          ))}
        </div>
        <div className="row gap-md mt-12">
          <button className="btn" disabled={saving || !ovClient} onClick={saveOverride}>
            {saving ? t('common.saving') : editingId ? `💾 ${t('rates.updateOverride')}` : `➕ ${t('rates.createOverride')}`}
          </button>
          {editingId && (
            <button className="btn btn-ghost" onClick={() => { setEditingId(null); setOvClient(''); setOvFees(EMPTY_FEES); }}>
              {t('rates.cancelEdit')}
            </button>
          )}
        </div>
      </div>

      {/* 覆盖列表 */}
      <div className="card">
        <div className="card-title">
          <h3>📋 {t('rates.existing')}</h3>
          <span className="muted text-sm">{data ? t('rates.count', { count: data.overrides.length }) : ''}</span>
        </div>
        {data && data.overrides.length === 0 && <p className="muted">{t('rates.empty')}</p>}
        {data && data.overrides.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('rates.client')}</th><th className="amt">{t('rates.oceanShort')}</th><th className="amt">{t('rates.portShort')}</th><th className="amt">{t('rates.truckingShort')}</th><th className="amt">{t('rates.fxShort')}</th><th className="amt">{t('rates.markupShort')}</th><th className="amt">{t('rates.taxShort')}</th><th className="amt">{t('rates.profitShort')}</th><th>{t('rates.updated')}</th><th>{t('rates.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.overrides.map(o => (
                  <tr key={o.id} className={editingId === o.id ? 'row-editing' : ''}>
                    <td><strong>{o.client_name}</strong></td>
                    <td className="amt">{o.ocean_freight_usd}</td>
                    <td className="amt">{o.port_fee_usd}</td>
                    <td className="amt">{(o.br_trucking_brl ?? 0).toFixed(2)}</td>
                    <td className="amt">{o.fx_rate}</td>
                    <td className="amt">{((o.sales_markup_rate ?? DEFAULT_MARKUP_RATE) * 100).toFixed(2)}%</td>
                    <td className="amt">{((o.sales_tax_rate ?? DEFAULT_TAX_RATE) * 100).toFixed(2)}%</td>
                    <td className="amt">{(o.profit_brl ?? DEFAULT_PROFIT_BRL).toFixed(2)}</td>
                    <td className="text-sm muted">{o.updated_by} · {o.updated_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td>
                      <div className="row gap-sm">
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(o)}>{t('common.edit')}</button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeOverride(o)}>{t('rates.remove')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
