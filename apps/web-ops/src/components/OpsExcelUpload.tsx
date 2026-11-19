import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';

type Row = { row_no: number; data: Record<string, any>; source_totals?: Record<string, number | null> };
type Issue = { row: number; field_key?: string; reason: string };
type Client = { id: string; name: string; china_company_name: string | null };
type CellPoint = { row: number; col: number };
const fields = ['carton_no', 'product_cn', 'product_en', 'sku', 'hs_code', 'cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price', 'material', 'description'] as const;
const numbers = new Set(['cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price']);
const labels: Record<string, string> = { carton_no: '箱号', product_cn: '中文品名', product_en: '英文品名', sku: 'SKU', hs_code: 'NCM', cartons: '箱数', pcs_per_carton: '每箱件数', nw_per_carton: '每箱净重', gw_per_carton: '每箱毛重', length_cm: '长 cm', width_cm: '宽 cm', height_cm: '高 cm', unit_price: '单价', material: '材质', description: '描述' };
const ptLabels: Record<string, string> = { carton_no: 'Caixa', product_cn: 'Nome chinês', product_en: 'Nome inglês', sku: 'SKU', hs_code: 'NCM', cartons: 'Caixas', pcs_per_carton: 'Peças/caixa', nw_per_carton: 'Peso líquido/caixa', gw_per_carton: 'Peso bruto/caixa', length_cm: 'Compr. cm', width_cm: 'Larg. cm', height_cm: 'Alt. cm', unit_price: 'Preço unitário', material: 'Material', description: 'Descrição' };

export default function OpsExcelUpload({ clients, onConfirmed }: { clients: Client[]; onConfirmed: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const pt = i18n.resolvedLanguage?.startsWith('pt');
  const label = (field: string) => (pt ? ptLabels : labels)[field];
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [currency, setCurrency] = useState('RMB');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const aiInFlight = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; quote: string } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const pointerDown = useRef(false);
  const [anchor, setAnchor] = useState<CellPoint | null>(null);
  const [edge, setEdge] = useState<CellPoint | null>(null);
  const computed = useMemo(() => rows.map(row => {
    const data = { ...row.data };
    const value = (key: string) => Number(data[key]) || 0;
    data.total_pcs = value('cartons') * value('pcs_per_carton');
    data.total_gw = value('cartons') * value('gw_per_carton');
    data.unit_cbm = value('length_cm') * value('width_cm') * value('height_cm') / 1_000_000;
    data.total_cbm = data.unit_cbm * value('cartons');
    data.total_price = data.total_pcs * value('unit_price');
    return { ...row, data };
  }), [rows]);
  const sixDigitNcmCount = computed.filter(row => /^\d{6}$/.test(String(row.data.hs_code || '').trim())).length;
  const selected = anchor && edge ? {
    top: Math.min(anchor.row, edge.row), bottom: Math.max(anchor.row, edge.row),
    left: Math.min(anchor.col, edge.col), right: Math.max(anchor.col, edge.col),
  } : null;
  const clearSelection = () => { setAnchor(null); setEdge(null); };
  useEffect(() => {
    const stop = () => { pointerDown.current = false; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('blur', stop); };
  }, []);
  const selectCell = (point: CellPoint, shift: boolean) => {
    if (shift && anchor) setEdge(point);
    else { setAnchor(point); setEdge(point); }
  };
  const startDrag = (event: ReactPointerEvent, point: CellPoint) => {
    if (event.button !== 0 || busy) return;
    pointerDown.current = true;
    selectCell(point, event.shiftKey);
  };
  const extendDrag = (event: ReactPointerEvent) => {
    if (!pointerDown.current || event.buttons !== 1) return;
    const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>('td[data-col]');
    if (!cell) return;
    setEdge({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
  };
  const cellValue = (rowIndex: number, col: number) => {
    const value = computed[rowIndex]?.data[fields[col]];
    return value === null || value === undefined ? '' : String(value);
  };
  const selectionText = () => selected ? Array.from({ length: selected.bottom - selected.top + 1 }, (_, row) =>
    Array.from({ length: selected.right - selected.left + 1 }, (_, col) => cellValue(selected.top + row, selected.left + col)).join('\t')).join('\n') : '';
  const copySelection = async () => {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selectionText()); setError(''); }
    catch { setError(t('orders.copyFailed')); }
  };
  const choose = (next: File | null) => { if (next && !/\.xlsx$/i.test(next.name)) { setError(t('orders.invalidExcel')); return; } setFile(next); setError(''); };
  const update = (index: number, key: string, value: string) => {
    setRows(current => current.map((row, i) => i === index ? { ...row, data: { ...row.data, [key]: numbers.has(key) ? (value === '' ? null : Number(value.replace(',', '.'))) : value } } : row));
    setIssues([]);
  };
  const paste = (event: ReactClipboardEvent<HTMLInputElement>, index: number, field: string) => {
    const raw = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(raw)) return;
    event.preventDefault();
    const cells = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    const column = fields.indexOf(field as typeof fields[number]);
    if (index + cells.length > rows.length || cells.some(line => column + line.length > fields.length)) { setError(t('orders.pasteOverflow')); return; }
    if (cells.some(line => line.some((value, offset) => numbers.has(fields[column + offset]) && value.trim() && !/^\d+(?:[.,]\d+)?$/.test(value.trim())))) { setError(t('orders.pasteInvalid')); return; }
    const nextRows = rows.map((row, rowIndex) => {
      if (rowIndex < index || rowIndex >= index + cells.length) return row;
      const data = { ...row.data };
      cells[rowIndex - index].forEach((value, offset) => { const key = fields[column + offset]; data[key] = numbers.has(key) ? (value.trim() ? Number(value.trim().replace(',', '.')) : null) : value.trim(); });
      return { ...row, data };
    });
    setRows(nextRows);
    setIssues([]); setError('');
    if (cells.some(line => line.some((value, offset) => fields[column + offset] === 'hs_code' && /^\d{6}$/.test(value.trim())))) void runAiCheck(draftId, nextRows);
  };
  const runAiCheck = async (id: string, candidateRows: Row[]) => {
    if (!id || aiInFlight.current) return;
    aiInFlight.current = true;
    setBusy(true); setAiChecking(true); setError('');
    try {
      const response = await api.post('/api/ops/orders/upload/ai-check', { draft_id: id, rows: candidateRows }, { timeout: 290_000 });
      setRows(response.data.rows || candidateRows);
      setIssues(response.data.issues || []);
      if (!response.data.ok) setError(t('orders.reviewIssues'));
    } catch (reason) { setError(getApiErrorMessage(reason, t('orders.uploadFailed'))); }
    finally { aiInFlight.current = false; setAiChecking(false); setBusy(false); }
  };
  const preview = async () => {
    if (!clientId || !file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const data = new FormData(); data.append('client_id', clientId); data.append('file', file);
      const response = await api.post('/api/ops/orders/upload/preview', data, { timeout: 180_000 });
      if (!response.data.ok) { setError(response.data.error_summary || t('orders.uploadFailed')); return; }
      const previewRows: Row[] = response.data.rows || [];
      setDraftId(response.data.draft_id); setRows(previewRows); setCurrency(response.data.declared_currency || 'RMB'); setIssues(response.data.errors || []); clearSelection();
      if (previewRows.some(row => /^\d{6}$/.test(String(row.data.hs_code || '').trim()))) await runAiCheck(response.data.draft_id, previewRows);
    } catch (reason) { setError(getApiErrorMessage(reason, t('orders.uploadFailed'))); }
    finally { setBusy(false); }
  };
  const aiCheck = async () => {
    await runAiCheck(draftId, computed);
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.post('/api/ops/orders/upload/confirm', { draft_id: draftId, rows: computed, declared_currency: currency }, { timeout: 120_000 });
      if (!response.data.ok) { setIssues(response.data.errors || []); setError(response.data.error_summary || t('orders.reviewIssues')); return; }
      setResult({ id: response.data.quote_id, quote: response.data.quote_no }); setDraftId(''); setRows([]); setFile(null); clearSelection(); onConfirmed();
    } catch (reason) { setError(getApiErrorMessage(reason, t('orders.uploadFailed'))); }
    finally { setBusy(false); }
  };
  const cancel = async () => { if (draftId) try { await api.delete(`/api/ops/orders/upload/${draftId}`); } catch { /* draft expires automatically */ } setDraftId(''); setRows([]); setIssues([]); setError(''); clearSelection(); };
  return <div className="card ops-excel-upload">
    <div className="card-title"><h3>{t('orders.uploadTitle')}</h3></div>
    {result && <div className="alert alert-ok">{t('orders.uploadSuccess', { quote: result.quote })}{user?.role !== 'sales' && <> · <Link to={`/orders/${result.id}`}>{result.quote}</Link></>}</div>}
    {error && <div className="alert alert-err" role="alert">{error}</div>}
    {!draftId ? <><div className="row gap-md order-upload-controls"><select className="form-input" value={clientId} disabled={busy} onChange={event => setClientId(event.target.value)}><option value="">{t('rates.selectClient')}</option>{clients.map(client => <option key={client.id} value={client.id}>{client.china_company_name || client.name}</option>)}</select><input type="file" accept=".xlsx" disabled={busy} onChange={event => choose(event.target.files?.[0] || null)} /><button className="btn" disabled={!clientId || !file || busy} onClick={() => void preview()}>{busy ? t('orders.uploading') : t('orders.previewExcel')}</button></div><div className={`order-upload-dropzone${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0] || null); }}>{file?.name || t('orders.dropExcel')}</div></> : <>
      <div className="row gap-md ops-excel-actions"><strong>{t('orders.reviewRows', { count: rows.length })}</strong><select className="form-input" value={currency} onChange={event => setCurrency(event.target.value)}><option value="RMB">RMB</option><option value="USD">USD</option></select><button className="btn btn-ghost" disabled={busy || !selected} onClick={() => void copySelection()}>{t('orders.copySelection')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => void aiCheck()}>{t('orders.aiCheckExcel')}</button><button className="btn" disabled={busy || !rows.length || issues.length > 0 || !computed.every(row => /^\d{8}$/.test(String(row.data.hs_code || '')))} onClick={() => void confirm()}>{busy ? t('orders.uploading') : t('orders.confirmExcel')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => void cancel()}>{t('common.cancel')}</button></div>
      {aiChecking && <div className="alert alert-warn" role="status">{t('orders.autoCompletingNcm')}</div>}
      {sixDigitNcmCount > 0 && !aiChecking && <div className="alert alert-warn">{t('orders.sixDigitNcmHint', { count: sixDigitNcmCount })}</div>}
      {issues.length > 0 && <div className="alert alert-err">{issues.slice(0, 12).map((issue, index) => <div key={index}>{issue.row} · {issue.field_key ? label(issue.field_key) : ''}: {issue.reason}</div>)}</div>}
      <div className="table-wrap ops-excel-grid" onPointerMove={extendDrag}><table ref={tableRef} className="table"><thead><tr><th>#</th>{fields.map((field, col) => <th key={field}><button type="button" className="ops-excel-select" title={t('orders.selectColumn')} onClick={() => { setAnchor({ row: 0, col }); setEdge({ row: rows.length - 1, col }); }}>{label(field)}</button></th>)}<th>{t('orders.actions')}</th></tr></thead><tbody>{computed.map((row, index) => <tr key={row.row_no}><td><button type="button" className="ops-excel-select" title={t('orders.selectRow')} onClick={() => { setAnchor({ row: index, col: 0 }); setEdge({ row: index, col: fields.length - 1 }); }}>{row.row_no}</button></td>{fields.map((field, col) => {
        const active = !!selected && index >= selected.top && index <= selected.bottom && col >= selected.left && col <= selected.right;
        const fieldIndex = col;
        return <td key={field} data-row={index} data-col={fieldIndex} className={active ? 'ops-cell-selected' : undefined} onPointerDown={event => startDrag(event, { row: index, col: fieldIndex })}>
          <input className={`form-input form-input-sm${active ? ' is-selected' : ''}`} type={numbers.has(field) ? 'number' : 'text'} step={numbers.has(field) ? 'any' : undefined} value={row.data[field] ?? ''} disabled={busy} onChange={event => update(index, field, event.target.value)} onPaste={event => paste(event, index, field)} onBlur={event => { if (field === 'hs_code' && /^\d{6}$/.test(event.currentTarget.value.trim())) void runAiCheck(draftId, rows); }} data-row-index={index} data-field={field} aria-label={`${label(field)} ${row.row_no}`}
            onCopy={event => { if (selected && (selected.top !== selected.bottom || selected.left !== selected.right)) { event.preventDefault(); event.clipboardData.setData('text/plain', selectionText()); } }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              if (event.key !== 'Enter' && (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd)) return;
              const nextRow = index + (event.key === 'ArrowUp' ? -1 : 1);
              if (nextRow < 0 || nextRow >= computed.length) return;
              event.preventDefault();
              const input = tableRef.current?.querySelector<HTMLInputElement>(`input[data-row-index="${nextRow}"][data-field="${field}"]`);
              input?.focus(); input?.select();
            }} />
        </td>;
      })}<td><button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setRows(current => current.filter(item => item.row_no !== row.row_no)); setIssues([]); clearSelection(); }}>{t('orders.deleteRow')}</button></td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
