import { useEffect, useState, type FormEvent } from 'react';
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
      setError('Preencha os parâmetros corretamente. O câmbio deve ser maior que zero e o ICMS deve ser maior ou igual a 0% e menor que 100%.'); return null;
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
      setSuccess('Análise da DI calculada. Revise os tributos antes de aprovar.');
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível analisar a DI.')); }
    finally { setBusy(null); }
  };
  const approve = async () => {
    const body = values(); if (!body) return;
    if (!items.length) { setError('Calcule a análise da DI antes de aprovar.'); return; }
    if (editingFeeId) { setFeeError('Salve ou cancele a edição da taxa adicional antes de aprovar.'); return; }
    setBusy('approve'); setError(''); setSuccess(''); setFeeError('');
    try {
      await api.patch(`/api/customs/orders/${orderId}/di/review`, { parameters: body, items, additional_fees: additionalFees, ...(note.trim() ? { note: note.trim() } : {}) });
      setSuccess('DI aprovada e nova revisão registrada com sucesso.'); setNote(''); await onUpdated();
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível aprovar a DI.')); }
    finally { setBusy(null); }
  };
  const updateItem = (index: number, key: string, value: string) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === 'ncm' ? value : key.endsWith('_rate') ? Number(value) / 100 : Number(value) } : item));
  const validateFee = (draft: FeeDraft): Omit<DiAdditionalFee, 'id'> | null => {
    const name = draft.name.trim();
    const amount = Number(draft.amount.replace(',', '.'));
    if (!name) { setFeeError('Informe o nome da taxa adicional.'); return null; }
    if (!Number.isFinite(amount) || amount < 0) { setFeeError('Informe um valor válido maior ou igual a zero para a taxa adicional.'); return null; }
    setFeeError('');
    return { name, amount_brl: amount, note: draft.note.trim() || null };
  };
  const addFee = (event: FormEvent) => {
    event.preventDefault();
    if (additionalFees.length >= MAX_ADDITIONAL_FEES) { setFeeError('É possível cadastrar no máximo 30 taxas adicionais.'); return; }
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
    ['CIF total', analysisValue(analysis, ['total_cif_brl', 'cif_brl'], items, ['cif_brl'])],
    ['Imposto de Importação (II)', analysisValue(analysis, ['total_ii_brl', 'ii_brl'], items, ['ii_brl'])],
    ['IPI', analysisValue(analysis, ['total_ipi_brl', 'ipi_brl'], items, ['ipi_brl'])],
    ['PIS', analysisValue(analysis, ['total_pis_brl', 'pis_brl'], items, ['pis_brl'])],
    ['COFINS', analysisValue(analysis, ['total_cofins_brl', 'cofins_brl'], items, ['cofins_brl'])],
    ['ICMS', analysisValue(analysis, ['total_icms_brl', 'icms_brl'], items, ['icms_brl'])],
    ['Tributos de importação', importTaxes],
    ['Taxas adicionais', additionalTotal],
    ['Total final da DI', importTaxes == null ? null : importTaxes + additionalTotal]
  ] as Array<[string, number | null]>;

  return <div className="di-workspace">
    <section className="di-parameters" aria-labelledby="parameters-title"><div className="subsection-heading"><div><h3 id="parameters-title">Parâmetros de cálculo</h3><p>Informe os dados utilizados na apuração dos tributos.</p></div><button className="btn btn-ghost" type="button" onClick={analyze} disabled={busy !== null}>{busy === 'analyze' ? <><span className="spinner" />Calculando…</> : <><Icon name="refresh" size={17} />{analysis ? 'Recalcular análise' : 'Calcular análise'}</>}</button></div><div className="parameter-grid"><div className="field"><label htmlFor="di-exchange">Câmbio RMB → BRL</label><input id="di-exchange" className="form-input" type="number" min="0.000001" step="0.000001" value={parameters.rmb_brl} onChange={(event) => setParameters({ ...parameters, rmb_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-insurance">Seguro internacional (R$)</label><input id="di-insurance" className="form-input" type="number" min="0" step="0.01" value={parameters.insurance_brl} onChange={(event) => setParameters({ ...parameters, insurance_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-freight">Frete internacional (R$)</label><input id="di-freight" className="form-input" type="number" min="0" step="0.01" value={parameters.freight_brl} onChange={(event) => setParameters({ ...parameters, freight_brl: event.target.value })} disabled={busy !== null} required /></div><div className="field"><label htmlFor="di-uf">UF de desembaraço</label><select id="di-uf" className="form-input" value={parameters.uf} onChange={(event) => setParameters({ ...parameters, uf: event.target.value })} disabled={busy !== null} required><option value="">Selecione</option>{UFS.map((uf) => <option key={uf}>{uf}</option>)}</select></div><div className="field"><label htmlFor="di-icms">Alíquota de ICMS (%)</label><input id="di-icms" className="form-input" type="number" min="0" max="100" step="0.0001" value={parameters.icms_rate} onChange={(event) => setParameters({ ...parameters, icms_rate: event.target.value })} disabled={busy !== null} required /></div></div></section>
    {error && <ErrorMessage message={error} />}{success && <SuccessMessage>{success}</SuccessMessage>}
    {!analysis ? <Empty title="Análise ainda não calculada" description="Preencha os parâmetros acima e calcule a análise para revisar NCM e tributos." /> : <>
      <div className="subsection-heading items-heading"><div><h3>NCM e tributos por item</h3><p>Edite o NCM e as alíquotas. Os valores calculados serão enviados na revisão.</p></div><span className="badge badge-info">{items.length} {items.length === 1 ? 'item' : 'itens'}</span></div>
      <div className="table-wrap"><table className="table di-table"><thead><tr><th>Linha</th><th>Produto</th><th>NCM</th><th className="amount">II (%)</th><th className="amount">IPI (%)</th><th className="amount">PIS (%)</th><th className="amount">COFINS (%)</th><th className="amount">CIF</th><th className="amount">II</th><th className="amount">IPI</th><th className="amount">PIS</th><th className="amount">COFINS</th><th className="amount">ICMS</th><th className="amount">Total</th></tr></thead><tbody>{items.map((item, index) => <tr key={String(item.id ?? item.row_no ?? index)}><td>{text(item, ['row_no', 'line_no'])}</td><td className="di-product">{text(item, ['product_name', 'product_en', 'description', 'goods_description'])}</td><td><input className="form-input table-input ncm-input" aria-label={`NCM da linha ${index + 1}`} value={String(item.ncm ?? item.ncm_code ?? '')} onChange={(event) => updateItem(index, 'ncm', event.target.value)} disabled={busy !== null} /></td>{(['ii_rate', 'ipi_rate', 'pis_rate', 'cofins_rate'] as const).map((key) => <td className="amount" key={key}><input className="form-input table-input rate-input" aria-label={`${key.replace('_rate', '').toUpperCase()} em porcentagem da linha ${index + 1}`} type="number" min="0" max="99.9999" step="0.0001" value={Number(item[key] ?? 0) * 100} onChange={(event) => updateItem(index, key, event.target.value)} disabled={busy !== null} /></td>)}<td className="amount">{brl(Number(item.cif_brl ?? 0))}</td><td className="amount">{brl(Number(item.ii_brl ?? 0))}</td><td className="amount">{brl(Number(item.ipi_brl ?? 0))}</td><td className="amount">{brl(Number(item.pis_brl ?? 0))}</td><td className="amount">{brl(Number(item.cofins_brl ?? 0))}</td><td className="amount">{brl(Number(item.icms_brl ?? 0))}</td><td className="amount strong">{brl(Number(item.di_brl ?? item.total_brl ?? item.di_total_brl ?? 0))}</td></tr>)}</tbody></table></div>

      <section className="di-additional-fees" aria-labelledby="additional-fees-title">
        <div className="subsection-heading"><div><h3 id="additional-fees-title">Taxas adicionais da DI</h3><p>Inclua despesas como Siscomex, AFRMM e armazenagem. Limite de 30 taxas.</p></div><span className="badge badge-neutral">{additionalFees.length}/30 taxas</span></div>
        <form className="di-fee-form" onSubmit={addFee}>
          <div className="field di-fee-name"><label htmlFor="di-fee-name">Nome da taxa</label><input id="di-fee-name" className="form-input" value={newFee.name} onChange={(event) => setNewFee({ ...newFee, name: event.target.value })} placeholder="Ex.: Siscomex, AFRMM ou armazenagem" disabled={busy !== null} required /></div>
          <div className="field di-fee-amount"><label htmlFor="di-fee-amount">Valor (R$)</label><input id="di-fee-amount" className="form-input" type="number" min="0" step="0.01" value={newFee.amount} onChange={(event) => setNewFee({ ...newFee, amount: event.target.value })} placeholder="0,00" disabled={busy !== null} required /></div>
          <div className="field di-fee-note"><label htmlFor="di-fee-note">Observação <span className="optional">(opcional)</span></label><input id="di-fee-note" className="form-input" value={newFee.note} onChange={(event) => setNewFee({ ...newFee, note: event.target.value })} placeholder="Ex.: taxa de armazenagem no terminal" disabled={busy !== null} /></div>
          <button className="btn btn-ghost di-fee-add" type="submit" disabled={busy !== null || additionalFees.length >= MAX_ADDITIONAL_FEES}>Adicionar taxa</button>
        </form>
        {feeError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{feeError}</div>}
        {additionalFees.length === 0 ? <p className="muted di-fee-empty">Nenhuma taxa adicional cadastrada.</p> : <div className="table-wrap"><table className="table di-fees-table"><caption className="sr-only">Taxas adicionais da DI</caption><thead><tr><th>Nome</th><th className="amount">Valor (R$)</th><th>Observação</th><th>Ações</th></tr></thead><tbody>{additionalFees.map((fee, index) => <tr key={fee.id}>{editingFeeId === fee.id ? <>
          <td data-label="Nome"><input className="form-input table-input" aria-label={`Nome da taxa adicional ${index + 1}`} value={editingFee.name} onChange={(event) => setEditingFee({ ...editingFee, name: event.target.value })} disabled={busy !== null} required /></td>
          <td data-label="Valor (R$)" className="amount"><input className="form-input table-input" aria-label={`Valor em reais da taxa adicional ${index + 1}`} type="number" min="0" step="0.01" value={editingFee.amount} onChange={(event) => setEditingFee({ ...editingFee, amount: event.target.value })} disabled={busy !== null} required /></td>
          <td data-label="Observação"><input className="form-input table-input" aria-label={`Observação da taxa adicional ${index + 1}`} value={editingFee.note} onChange={(event) => setEditingFee({ ...editingFee, note: event.target.value })} placeholder="Observação opcional" disabled={busy !== null} /></td>
          <td data-label="Ações"><div className="di-fee-actions"><button className="btn btn-sm" type="button" onClick={() => saveFee(fee.id)} disabled={busy !== null}>Salvar</button><button className="btn btn-sm btn-ghost" type="button" onClick={cancelEditing} disabled={busy !== null}>Cancelar</button></div></td>
        </> : <>
          <td data-label="Nome" className="di-fee-name-text">{fee.name}</td><td data-label="Valor (R$)" className="amount strong">{brl(fee.amount_brl)}</td><td data-label="Observação" className="di-fee-note-text">{fee.note || '—'}</td>
          <td data-label="Ações"><div className="di-fee-actions"><button className="btn btn-sm btn-ghost" type="button" onClick={() => startEditing(fee)} disabled={busy !== null} aria-label={`Editar taxa ${fee.name}`}><Icon name="edit" size={15} />Editar</button><button className="btn btn-sm btn-danger-ghost" type="button" onClick={() => removeFee(fee.id)} disabled={busy !== null} aria-label={`Excluir taxa ${fee.name}`}>Excluir</button></div></td>
        </>}</tr>)}</tbody></table></div>}
      </section>

      <section className="di-summary" aria-label="Resumo dos valores da DI">{summary.map(([label, value], index) => <div className={index === summary.length - 1 ? 'di-grand-total' : ''} key={label}><span>{label}</span><strong>{brl(value)}</strong></div>)}</section>
      <div className="approval-box"><div className="field"><label htmlFor="di-review-note">Nota da revisão <span className="optional">(opcional)</span></label><textarea id="di-review-note" className="form-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Registre uma observação para o histórico da DI" disabled={busy !== null} /></div><div className="approval-footer"><span><Icon name="check" size={18} />Ao aprovar, uma nova versão será salva no histórico.</span><button className="btn btn-success" type="button" onClick={approve} disabled={busy !== null || !items.length}>{busy === 'approve' ? 'Aprovando…' : 'Confirmar e aprovar DI'}</button></div></div>
    </>}
  </div>;
}
