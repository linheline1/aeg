import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrderDetailData } from '../types';
import { numeric, text } from '../utils/data';
import { api, errorMessage } from '../store/auth';
import { Empty } from './Feedback';
import OrderImages from './OrderImages';

const defaultWidths = [68, 280, 96, 120, 100, 120, 120, 115, 115];
const editableFields = ['product_en', 'hs_code', 'total_pcs', 'unit_price', 'total_price', 'total_cbm', 'total_gw'] as const;
const physicalFields = [null, 'product_en', null, 'hs_code', 'total_pcs', 'unit_price', 'total_price', 'total_cbm', 'total_gw'] as const;
type CellPoint = { row: number; col: number };

export default function ProductItems({ order, onUpdated }: { order: OrderDetailData; onUpdated: () => Promise<void> }) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [columnWidths, setColumnWidths] = useState(defaultWidths);
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [findText, setFindText] = useState('');
  const [findIndex, setFindIndex] = useState(-1);
  const tableRef = useRef<HTMLTableElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const stop = () => { dragging.current = false; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('blur', stop); };
  }, []);
  const [anchor, setAnchor] = useState<CellPoint | null>(null);
  const [edge, setEdge] = useState<CellPoint | null>(null);
  const selected = anchor && edge ? { top: Math.min(anchor.row, edge.row), bottom: Math.max(anchor.row, edge.row), left: Math.min(anchor.col, edge.col), right: Math.max(anchor.col, edge.col) } : null;
  const selectCell = (point: CellPoint, shift: boolean) => {
    if (shift && anchor) setEdge(point);
    else { setAnchor(point); setEdge(point); }
  };
  const startDrag = (event: ReactPointerEvent, point: CellPoint) => {
    if (event.button !== 0 || busy) return;
    dragging.current = true;
    selectCell(point, event.shiftKey);
  };
  const extendDrag = (event: ReactPointerEvent, point: CellPoint) => {
    if (dragging.current && event.buttons === 1) setEdge(point);
  };
  const cellValue = (rowIndex: number, col: number) => {
    const item = order.line_items[rowIndex];
    const field = physicalFields[col];
    if (col === 0) return String(item.row_no ?? '');
    if (!field) return '';
    const rowNo = Number(item.row_no);
    const original = field === 'hs_code' ? item.hs_code ?? order.di_analysis?.items?.find(di => Number(di.row_no) === rowNo)?.ncm : item[field];
    return edits[`${rowNo}:${field}`] ?? String(original ?? '');
  };
  const selectionText = () => selected ? Array.from({ length: selected.bottom - selected.top + 1 }, (_, row) =>
    Array.from({ length: selected.right - selected.left + 1 }, (_, col) => cellValue(selected.top + row, selected.left + col)).join('\t')).join('\n') : '';
  const copySelection = async () => {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selectionText()); setError(''); }
    catch { setError(t('products.copyFailed')); }
  };

  const findMatches = (query: string) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return order.line_items.flatMap((item, rowIndex) => editableFields.flatMap(field => {
      const rowNo = Number(item.row_no);
      const original = field === 'hs_code' ? item.hs_code ?? order.di_analysis?.items?.find(di => Number(di.row_no) === rowNo)?.ncm : item[field];
      const value = edits[`${rowNo}:${field}`] ?? String(original ?? '');
      return value.toLowerCase().includes(needle) ? [{ rowIndex, field }] : [];
    }));
  };
  const matches = findMatches(findText);
  const jumpToMatch = (index: number) => {
    if (!matches.length) return;
    const next = (index + matches.length) % matches.length;
    setFindIndex(next);
    const match = matches[next];
    const input = tableRef.current?.querySelector<HTMLInputElement>(`input[data-row-index="${match.rowIndex}"][data-field="${match.field}"]`);
    input?.focus(); input?.select(); input?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const pasteCells = (event: ReactClipboardEvent<HTMLInputElement>, startRow: number, startField: string) => {
    const raw = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(raw)) return;
    event.preventDefault();
    const rows = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    const startColumn = physicalFields.indexOf(startField as typeof physicalFields[number]);
    if (startColumn < 0 || startRow + rows.length > order.line_items.length || rows.some(row => startColumn + row.length > physicalFields.length)) {
      setError(t('products.pasteOverflow')); return;
    }
    const next: Record<string, string> = {};
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
      const field = physicalFields[startColumn + column];
      const value = rows[row][column].trim();
      if (!field) { if (value) { setError(t('products.pasteReadonly')); return; } continue; }
      if (!value) { setError(t('products.pasteEmpty')); return; }
      if (field !== 'product_en' && field !== 'hs_code' && !/^\d+(?:[.,]\d+)?$/.test(value)) { setError(t('products.pasteInvalid')); return; }
      next[`${Number(order.line_items[startRow + row].row_no)}:${field}`] = field === 'product_en' || field === 'hs_code' ? value : value.replace(',', '.');
    }
    setError('');
    setEdits(previous => ({ ...previous, ...next }));
  };

  const resize = (event: ReactPointerEvent, kind: 'column' | 'row', index: number, initial: number) => {
    event.preventDefault(); event.stopPropagation();
    const start = kind === 'column' ? event.clientX : event.clientY;
    const move = (next: PointerEvent) => {
      const delta = (kind === 'column' ? next.clientX : next.clientY) - start;
      const size = Math.max(kind === 'column' ? 68 : 48, Math.min(kind === 'column' ? 720 : 320, initial + delta));
      if (kind === 'column') setColumnWidths(previous => previous.map((width, column) => column === index ? size : width));
      else setRowHeights(previous => ({ ...previous, [index]: size }));
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const saveAmounts = async () => {
    const byRow = new Map<number, Record<string, string | number>>();
    for (const [key, value] of Object.entries(edits)) {
      const [row, field] = key.split(':');
      const rowNo = Number(row);
      if (!byRow.has(rowNo)) byRow.set(rowNo, { row_no: rowNo });
      byRow.get(rowNo)![field] = value;
    }
    const changes = [...byRow.values()];
    if (changes.some(change => Object.entries(change).some(([field, value]) => field !== 'row_no' && !String(value).trim()))) {
      setError(t('products.invalidAmount')); return;
    }
    setBusy(true); setError('');
    try {
      await api.patch(`/api/customs/orders/${order.id}/products/amounts`, { changes });
      await onUpdated(); setEdits({});
    } catch (reason) { setError(errorMessage(reason, t('products.saveError'))); }
    finally { setBusy(false); }
  };

  if (!order.line_items.length) return <Empty title={t('products.emptyTitle')} description={t('products.emptyDescription')} />;
  const cell = (rowNo: number, rowIndex: number, field: string, value: unknown, type = 'text') => <input
    className={`form-input product-sheet-input${selected && rowIndex >= selected.top && rowIndex <= selected.bottom && physicalFields.indexOf(field as typeof physicalFields[number]) >= selected.left && physicalFields.indexOf(field as typeof physicalFields[number]) <= selected.right ? ' is-selected' : ''}`} type={type} min={type === 'number' ? '0' : undefined}
    data-row-index={rowIndex} data-field={field}
    value={edits[`${rowNo}:${field}`] ?? String(value ?? '')} disabled={busy}
    aria-label={`${field} ${rowNo}`}
    onPaste={event => pasteCells(event, rowIndex, field)}
    onCopy={event => { if (selected && (selected.top !== selected.bottom || selected.left !== selected.right)) { event.preventDefault(); event.clipboardData.setData('text/plain', selectionText()); } }}
    onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.key !== 'Enter' && (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd)) return;
      const nextRow = rowIndex + (event.key === 'ArrowUp' ? -1 : 1);
      if (nextRow < 0 || nextRow >= order.line_items.length) return;
      event.preventDefault();
      const input = tableRef.current?.querySelector<HTMLInputElement>(`input[data-row-index="${nextRow}"][data-field="${field}"]`);
      input?.focus(); input?.select();
    }}
    onChange={event => setEdits(previous => ({ ...previous, [`${rowNo}:${field}`]: event.target.value }))} />;
  return <>
    <div className="product-sheet-actions"><button type="button" className="btn" disabled={busy || Object.keys(edits).length === 0} onClick={() => void saveAmounts()}>{busy ? t('products.saving') : t('common.saveChanges')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setEdits({}); setError(''); }}>{t('common.cancel')}</button><button type="button" className="btn btn-ghost" disabled={!selected} onClick={() => void copySelection()}>{t('products.copySelection')}</button><label className="product-sheet-find">{t('products.find')}<input className="form-input" type="search" value={findText} onChange={event => { setFindText(event.target.value); setFindIndex(-1); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); jumpToMatch(findIndex + 1); } }} /></label><button type="button" className="btn btn-ghost" disabled={!matches.length} onClick={() => jumpToMatch(findIndex + 1)}>{t('products.findNext')} {matches.length ? `${Math.max(0, findIndex + 1)}/${matches.length}` : ''}</button></div>
    <p className="section-note">{t('products.validRows', { valid: order.valid_rows, total: order.total_rows })} · {t('products.amountNote')}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-wrap product-table-wrap"><table ref={tableRef} className="table product-table" style={{ width: columnWidths.reduce((sum, width) => sum + width, 0) }}>
      <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>{[t('products.row'), t('products.description'), t('products.image'), 'NCM', t('products.quantity'), t('products.unitPrice'), t('products.total'), t('products.volume'), t('products.weight')].map((label, index) => <th key={index} scope="col" className={index >= 4 ? 'amount' : undefined}><button type="button" className="product-select-column" onClick={() => { setAnchor({ row: 0, col: index }); setEdge({ row: order.line_items.length - 1, col: index }); }} title={t('products.selectColumn')}>{label}</button><span className="product-column-resizer" role="separator" aria-label={`${label} ${t('products.resizeColumn')}`} aria-orientation="vertical" onPointerDown={event => resize(event, 'column', index, columnWidths[index])} /></th>)}</tr></thead>
      <tbody>{order.line_items.map((item, index) => {
        const rowNo = Number(text(item, ['row_no', 'line_no', 'row']));
        const rowImages = order.images.filter(image => Number(image.row_no) === rowNo);
        const currentAmount = numeric(item, ['total_price', 'total_amount_rmb', 'total_rmb', 'amount_rmb', 'total_price_rmb', 'total_value_rmb']);
        return <tr key={String(item.id ?? item.row_no ?? index)} style={{ height: rowHeights[rowNo] ?? 56, ['--product-row-height' as string]: `${rowHeights[rowNo] ?? 56}px` }}>
          <td className="product-row-number"><button type="button" className="product-select-row" onClick={() => { setAnchor({ row: index, col: 1 }); setEdge({ row: index, col: 8 }); }} title={t('products.selectRow')}>{text(item, ['row_no', 'line_no', 'row'])}</button><span className="product-row-resizer" role="separator" aria-label={`${t('products.row')} ${rowNo} ${t('products.resizeRow')}`} aria-orientation="horizontal" onPointerDown={event => resize(event, 'row', rowNo, rowHeights[rowNo] ?? 56)} /></td>
          <td className="product-name" onPointerDown={event => startDrag(event, { row: index, col: 1 })} onPointerEnter={event => extendDrag(event, { row: index, col: 1 })}>{cell(rowNo, index, 'product_en', item.product_en ?? item.product_cn)}</td>
          <td className="product-image-cell" onPointerEnter={event => extendDrag(event, { row: index, col: 2 })}>{rowImages.length > 0 ? <OrderImages images={rowImages} compact /> : <span className="muted">—</span>}</td>
          <td onPointerDown={event => startDrag(event, { row: index, col: 3 })} onPointerEnter={event => extendDrag(event, { row: index, col: 3 })}>{cell(rowNo, index, 'hs_code', item.hs_code ?? order.di_analysis?.items?.find(di => Number(di.row_no) === rowNo)?.ncm)}</td>
          <td className="amount" onPointerDown={event => startDrag(event, { row: index, col: 4 })} onPointerEnter={event => extendDrag(event, { row: index, col: 4 })}>{cell(rowNo, index, 'total_pcs', item.total_pcs, 'number')}</td>
          <td className="amount" onPointerDown={event => startDrag(event, { row: index, col: 5 })} onPointerEnter={event => extendDrag(event, { row: index, col: 5 })}>{cell(rowNo, index, 'unit_price', item.unit_price, 'number')}</td>
          <td className="amount" onPointerDown={event => startDrag(event, { row: index, col: 6 })} onPointerEnter={event => extendDrag(event, { row: index, col: 6 })}>{cell(rowNo, index, 'total_price', currentAmount, 'number')}</td>
          <td className="amount" onPointerDown={event => startDrag(event, { row: index, col: 7 })} onPointerEnter={event => extendDrag(event, { row: index, col: 7 })}>{cell(rowNo, index, 'total_cbm', item.total_cbm, 'number')}</td>
          <td className="amount" onPointerDown={event => startDrag(event, { row: index, col: 8 })} onPointerEnter={event => extendDrag(event, { row: index, col: 8 })}>{cell(rowNo, index, 'total_gw', item.total_gw, 'number')}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </>;
}
