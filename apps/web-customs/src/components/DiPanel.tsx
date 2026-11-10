import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../store/auth';
import type { DiAdditionalFee, DiAnalysis, DiItem, DiParameters } from '../types';
import { brl } from '../utils/format';
import { additionalFeesTotal, analysisValue, importTaxesValue, parameterValue, text } from '../utils/data';
import { Empty, ErrorMessage, SuccessMessage } from './Feedback';
import Icon from './Icon';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const MAX_ADDITIONAL_FEES = 30;
type ParameterStrings = Record<keyof DiParameters, string>;
type FeeDraft = { name: string; amount: string; note: string };
const emptyParameters: ParameterStrings = { rmb_brl: '', insurance_brl: '0', uf: '', icms_rate: '', freight_brl: '0' };
const emptyFeeDraft: FeeDraft = { name: '', amount: '', note: '' };

export default function DiPanel({ orderId, initialAnalysis, onUpdated }: { orderId: string; initialAnalysis: DiAnalysis | null; onUpdated: () => Promise<void> }) {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<DiAnalysis | null>(initialAnalysis);
  const [items, setItems] = useState<DiItem[]>(initialAnalysis?.items || []);
  const [parameters, setParameters] = useState<ParameterStrings>(emptyParameters);
  const [additionalFees, setAdditionalFees] = useState<DiAdditionalFee[]>(initialAnalysis?.additional_fees || []);
  const [newFee, setNewFee] = useState<FeeDraft>(emptyFeeDraft);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editingFee, setEditingFee] = useState<FeeDraft>(emptyFeeDraft);
  const [feeError, setFeeError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'analyze' | 'approve' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setAnalysis(initialAnalysis); setItems(initialAnalysis?.items || []);
    setAdditionalFees(initialAnalysis?.additional_fees || []);
    setNewFee(emptyFeeDraft); setEditingFeeId(null); setEditingFee(emptyFeeDraft); setFeeError('');
    setParameters({
      rmb_brl: String(parameterValue(initialAnalysis, 'rmb_brl')),
      insurance_brl: String(parameterValue(initialAnalysis, 'insurance_brl') || '0'),
      uf: String(parameterValue(initialAnalysis, 'uf')),
      icms_rate: initialAnalysis ? String(Number(parameterValue(initialAnalysis, 'icms_rate')) * 100) : '',
      freight_brl: String(parameterValue(initialAnalysis, 'freight_brl') || '0')
    });
  }, [initialAnalysis]);

  const values = (): DiParameters | null => {
    const icmsPercent = Number(parameters.icms_rate.replace(',', '.'));
    const parsed = { rmb_brl: Number(parameters.rmb_brl.replace(',', '.')), insurance_brl: Number(parameters.insurance_brl.replace(',', '.')), uf: parameters.uf, icms_rate: icmsPercent / 100, freight_brl: Number(parameters.freight_brl.replace(',', '.')) };
    if (!Number.isFinite(parsed.rmb_brl) || parsed.rmb_brl <= 0 || !Number.isFinite(parsed.insurance_brl) || parsed.insurance_brl < 0 || !Number.isFinite(parsed.freight_brl) || parsed.freight_brl < 0 || !Number.isFinite(icmsPercent) || icmsPercent < 0 || icmsPercent >= 100 || !UFS.includes(parsed.uf)) {
      setError(t('di.invalidParameters')); return null;
    }
    return parsed;
  };
  const analyze = async () => {
    const body = values(); if (!body) return;
    setBusy('analyze'); setError(''); setSuccess('');
    try {
      const response = await api.post<DiAnalysis>(`/api/customs/orders/${orderId}/di/analyze`, body);
      const responseFees = response.data.additional_fees ?? additionalFees;
      setAnalysis({ ...response.data, additional_fees: responseFees });
      setItems(response.data.items || []);
      setAdditionalFees(responseFees);
      setEditingFeeId(null); setFeeError('');
      setSuccess(t('di.analysisSuccess'));
    } catch (reason) { setError(errorMessage(reason, t('di.analysisError'))); }
    finally { setBusy(null); }
  };
  const approve = async () => {
    const body = values(); if (!body) return;
    if (!items.length) { setError(t('di.calculateBeforeApprove')); return; }
    if (editingFeeId) { setFeeError(t('di.finishFeeEdit')); return; }
    setBusy('approve'); setError(''); setSuccess(''); setFeeError('');
    try {
      await api.patch(`/api/customs/orders/${orderId}/di/review`, { parameters: body, items, additional_fees: additionalFees, ...(note.trim() ? { note: note.trim() } : {}) });
      setSuccess(t('di.approveSuccess')); setNote(''); await onUpdated();
    } catch (reason) { setError(errorMessage(reason, t('di.approveError'))); }
    finally { setBusy(null); }
  };
  const updateItem = (index: number, key: string, value: string) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === 'ncm' ? value : key.endsWith('_rate') ? Number(value) / 100 : Number(value) } : item));
  const validateFee = (draft: FeeDraft): Omit<DiAdditionalFee, 'id'> | null => {
    const name = draft.name.trim();
    const amount = Number(draft.amount.replace(',', '.'));
    if (!name) { setFeeError(t('di.feeNameRequired')); return null; }
    if (!Number.isFinite(amount) || amount < 0) { setFeeError(t('di.feeValueInvalid')); return null; }
    setFeeError('');
    return { name, amount_brl: amount, note: draft.note.trim() || null };
  };
  const addFee = (event: FormEvent) => {
    event.preventDefault();
    if (additionalFees.length >= MAX_ADDITIONAL_FEES) { setFeeError(t('di.feeLimit')); return; }
    const fee = validateFee(newFee); if (!fee) return;
    const id = globalThis.crypto?.randomUUID?.() || `fee-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAdditionalFees((current) => [...current, { id, ...fee }]);
    setNewFee(emptyFeeDraft);
  };
  const startEditing = (fee: DiAdditionalFee) => {
    setEditingFeeId(fee.id);
    setEditingFee({ name: fee.name, amount: String(fee.amount_brl), note: fee.note || '' });
    setFeeError('');
  };
  const cancelEditing = () => { setEditingFeeId(null); setEditingFee(emptyFeeDraft); setFeeError(''); };
  const saveFee = (id: string) => {
    const fee = validateFee(editingFee); if (!fee) return;
    setAdditionalFees((current) => current.map((item) => item.id === id ? { id, ...fee } : item));
    cancelEditing();
  };
  const removeFee = (id: string) => {
    setAdditionalFees((current) => current.filter((fee) => fee.id !== id));
    if (editingFeeId === id) cancelEditing();
    setFeeError('');
  };

  const importTaxes = importTaxesValue(analysis, items);
  const additionalTotal = additionalFeesTotal(additionalFees);
  const summary = [
    [t('di.summary.cif'), analysisValue(analysis, ['total_cif_brl', 'cif_brl'], items, ['cif_brl'])],
    [t('di.summary.ii'), analysisValue(analysis, ['total_ii_brl', 'ii_brl'], items, ['ii_brl'])],
    ['IPI', analysisValue(analysis, ['total_ipi_brl', 'ipi_brl'], items, ['ipi_brl'])],
    ['PIS', analysisValue(analysis, ['total_pis_brl', 'pis_brl'], items, ['pis_brl'])],
    ['COFINS', analysisValue(analysis, ['total_cofins_brl', 'cofins_brl'], items, ['cofins_brl'])],
    ['ICMS', analysisValue(analysis, ['total_icms_brl', 'icms_brl'], items, ['icms_brl'])],
    [t('di.summary.importTaxes'), importTaxes],
    [t('di.summary.additionalFees'), additionalTotal],
    [t('di.summary.finalTotal'), importTaxes == null ? null : importTaxes + additionalTotal]
  ] as Array<[string, number | null]>;

  return <div className="di-workspace">
    <section className="di-parameters" aria-labelledby="parameters-title"><div className="subsection-heading"><div><h3 id="parameters-title">{t('di.parametersTitle')}</h3><p>{t('di.parametersDescription')}</p></div><button className="btn btn-ghost" type="button" onClick={analyze} disabled={busy !== null}>{busy === 'analyze' ? <><span className="spinner" />{t('di.calculating')}</> : <><Icon name="refresh" size={17} />{analysis ? t('di.recalculate') : t('di.calculate')}</>}</button></div><div className="parameter-grid"><div className="field"><label htmlFor="di-exchange">{t('di.exchange')}</label><input id="di-exchange" className="form-input" type="number" min="0.000001" step="0.000001" value={parameters.rmb_brl} onChange={(event) => setParameters({ ...parameters, rmb_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-insurance">{t('di.insurance')}</label><input id="di-insurance" className="form-input" type="number" min="0" step="0.01" value={parameters.insurance_brl} onChange={(event) => setParameters({ ...parameters, insurance_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-freight">{t('di.freight')}</label><input id="di-freight" className="form-input" type="number" min="0" step="0.01" value={parameters.freight_brl} onChange={(event) => setParameters({ ...parameters, freight_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-uf">{t('di.clearanceUf')}</label><select id="di-uf" className="form-input" value={parameters.uf} onChange={(event) => setParameters({ ...parameters, uf: event.target.value })} disabled={busy !== null} required><option value="">{t('di.select')}</option>{UFS.map((uf) => <option key={uf}>{uf}</option>)}</select></div><div className="field"><label htmlFor="di-icms">{t('di.icmsRate')}</label><input id="di-icms" className="form-input" type="number" min="0" max="100" step="0.0001" value={parameters.icms_rate} onChange={(event) => setParameters({ ...parameters, icms_rate: event.target.value })} disabled={busy !== null} required /></div></div></section>
    {error && <ErrorMessage message={error} />}{success && <SuccessMessage>{success}</SuccessMessage>}
    {!analysis ? <Empty title={t('di.emptyTitle')} description={t('di.emptyDescription')} /> : <>
      <div className="subsection-heading items-heading"><div><h3>{t('di.itemsTitle')}</h3><p>{t('di.itemsDescription')}</p></div><span className="badge badge-info">{t('di.items', { count: items.length })}</span></div>
      <div className="table-wrap"><table className="table di-table"><thead><tr><th>{t('products.row')}</th><th>{t('di.product')}</th><th>NCM</th><th className="amount">II (%)</th><th className="amount">IPI (%)</th><th className="amount">PIS (%)</th><th className="amount">COFINS (%)</th><th className="amount">CIF</th><th className="amount">II</th><th className="amount">IPI</th><th className="amount">PIS</th><th className="amount">COFINS</th><th className="amount">ICMS</th><th className="amount">{t('products.total')}</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? item.row_no ?? index)}><td>{text(item, ['row_no', 'line_no'])}</td><td className="di-product">{text(item, ['product_name', 'product_en', 'description', 'goods_description'])}</td><td><input className="form-input table-input ncm-input" aria-label={t('di.ncmAria', { row: index + 1 })} value={String(item.ncm ?? item.ncm_code ?? '')} onChange={(event) => updateItem(index, 'ncm', event.target.value)} disabled={busy !== null} /></td>{(['ii_rate', 'ipi_rate', 'pis_rate', 'cofins_rate'] as const).map((key) => <td className="amount" key={key}><input className="form-input table-input rate-input" aria-label={t('di.rateAria', { tax: key.replace('_rate', '').toUpperCase(), row: index + 1 })} type="number" min="0" max="99.9999" step="0.0001" value={Number(item[key] ?? 0) * 100} onChange={(event) => updateItem(index, key, event.target.value)} disabled={busy !== null} /></td>)}<td className="amount">{brl(Number(item.cif_brl ?? 0))}</td><td className="amount">{brl(Number(item.ii_brl ?? 0))}</td><td className="amount">{brl(Number(item.ipi_brl ?? 0))}</td><td className="amount">{brl(Number(item.pis_brl ?? 0))}</td><td className="amount">{brl(Number(item.cofins_brl ?? 0))}</td><td className="amount">{brl(Number(item.icms_brl ?? 0))}</td><td className="amount strong">{brl(Number(item.di_brl ?? item.total_brl ?? item.di_total_brl ?? 0))}</td></tr>)}</tbody></table></div>

      <section className="di-additional-fees" aria-labelledby="additional-fees-title">
        <div className="subsection-heading"><div><h3 id="additional-fees-title">{t('di.feesTitle')}</h3><p>{t('di.feesDescription')}</p></div><span className="badge badge-neutral">{t('di.feeCount', { count: additionalFees.length })}</span></div>
        <form className="di-fee-form" onSubmit={addFee}>
          <div className="field di-fee-name"><label htmlFor="di-fee-name">{t('di.feeName')}</label><input id="di-fee-name" className="form-input" value={newFee.name} onChange={(event) => setNewFee({ ...newFee, name: event.target.value })} placeholder={t('di.feeNamePlaceholder')} disabled={busy !== null} required /></div>
          <div className="field di-fee-amount"><label htmlFor="di-fee-amount">{t('di.feeValue')}</label><input id="di-fee-amount" className="form-input" type="number" min="0" step="0.01" value={newFee.amount} onChange={(event) => setNewFee({ ...newFee, amount: event.target.value })} placeholder="0,00" disabled={busy !== null} required /></div>
          <div className="field di-fee-note"><label htmlFor="di-fee-note">{t('shipment.note')} <span className="optional">{t('shipment.optional')}</span></label><input id="di-fee-note" className="form-input" value={newFee.note} onChange={(event) => setNewFee({ ...newFee, note: event.target.value })} placeholder={t('di.feeNotePlaceholder')} disabled={busy !== null} /></div>
          <button className="btn btn-ghost di-fee-add" type="submit" disabled={busy !== null || additionalFees.length >= MAX_ADDITIONAL_FEES}>{t('di.addFee')}</button>
        </form>
        {feeError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{feeError}</div>}
        {additionalFees.length === 0 ? <p className="muted di-fee-empty">{t('di.noFees')}</p> : <div className="table-wrap"><table className="table di-fees-table"><caption className="sr-only">{t('di.feesTitle')}</caption><thead><tr><th>{t('di.name')}</th><th className="amount">{t('di.feeValue')}</th><th>{t('shipment.note')}</th><th>{t('di.actions')}</th></tr></thead><tbody>{additionalFees.map((fee, index) => <tr key={fee.id}>{editingFeeId === fee.id ? <>
          <td data-label={t('di.name')}><input className="form-input table-input" aria-label={t('di.feeNameAria', { index: index + 1 })} value={editingFee.name} onChange={(event) => setEditingFee({ ...editingFee, name: event.target.value })} disabled={busy !== null} required /></td>
          <td data-label={t('di.feeValue')} className="amount"><input className="form-input table-input" aria-label={t('di.feeValueAria', { index: index + 1 })} type="number" min="0" step="0.01" value={editingFee.amount} onChange={(event) => setEditingFee({ ...editingFee, amount: event.target.value })} disabled={busy !== null} required /></td>
          <td data-label={t('shipment.note')}><input className="form-input table-input" aria-label={t('di.feeNoteAria', { index: index + 1 })} value={editingFee.note} onChange={(event) => setEditingFee({ ...editingFee, note: event.target.value })} placeholder={t('di.optionalNote')} disabled={busy !== null} /></td>
          <td data-label={t('di.actions')}><div className="di-fee-actions"><button className="btn btn-sm" type="button" onClick={() => saveFee(fee.id)} disabled={busy !== null}>{t('common.save')}</button><button className="btn btn-sm btn-ghost" type="button" onClick={cancelEditing} disabled={busy !== null}>{t('common.cancel')}</button></div></td>
        </> : <>
          <td data-label={t('di.name')} className="di-fee-name-text">{fee.name}</td><td data-label={t('di.feeValue')} className="amount strong">{brl(fee.amount_brl)}</td><td data-label={t('shipment.note')} className="di-fee-note-text">{fee.note || '—'}</td>
          <td data-label={t('di.actions')}><div className="di-fee-actions"><button className="btn btn-sm btn-ghost" type="button" onClick={() => startEditing(fee)} disabled={busy !== null} aria-label={t('di.editFeeAria', { name: fee.name })}><Icon name="edit" size={15} />{t('common.edit')}</button><button className="btn btn-sm btn-danger-ghost" type="button" onClick={() => removeFee(fee.id)} disabled={busy !== null} aria-label={t('di.deleteFeeAria', { name: fee.name })}>{t('common.delete')}</button></div></td>
        </>}</tr>)}</tbody></table></div>}
      </section>

      <section className="di-summary" aria-label={t('di.summaryLabel')}>{summary.map(([label, value], index) => <div className={index === summary.length - 1 ? 'di-grand-total' : ''} key={label}><span>{label}</span><strong>{brl(value)}</strong></div>)}</section>
      <div className="approval-box"><div className="field"><label htmlFor="di-review-note">{t('di.reviewNote')} <span className="optional">{t('shipment.optional')}</span></label><textarea id="di-review-note" className="form-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('di.reviewNotePlaceholder')} disabled={busy !== null} /></div><div className="approval-footer"><span><Icon name="check" size={18} />{t('di.approveHint')}</span><button className="btn btn-success" type="button" onClick={approve} disabled={busy !== null || !items.length}>{busy === 'approve' ? t('di.approving') : t('di.approve')}</button></div></div>
    </>}
  </div>;
}
