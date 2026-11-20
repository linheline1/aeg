import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, PointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../store/auth';
import { getApiErrorMessage } from '@aeg/web-shared/errors';

const fields = ['sku', 'product_cn', 'product_en', 'material', 'description', 'hs_code', 'total_pcs', 'unit_price', 'total_price', 'total_cbm', 'total_gw'] as const;
type Field = typeof fields[number];
type ProductRow = { row_no: number; [key: string]: unknown };
type Order = { id: string; quote_no: string; line_items: ProductRow[] };
type Cell = { row: number; col: number };
type Currency = 'RMB' | 'USD' | 'BRL';
type MarketFx = { date: string; rates: Record<string, number>; stale: boolean };
const numericFields = new Set<Field>(['total_pcs', 'unit_price', 'total_price', 'total_cbm', 'total_gw']);
const priceFields = new Set<Field>(['unit_price', 'total_price']);
const initialWidths = [140, 200, 220, 140, 240, 118, 105, 118, 125, 105, 105];
const formatPrice = (value: number) => Number(value.toFixed(6)).toString();

export default function OrderProductSheet() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState<Currency>('RMB');
  const [rates, setRates] = useState<Record<Currency, string>>({ RMB: '1', USD: '', BRL: '' });
  const [market, setMarket] = useState<MarketFx | null>(null);
  const [marketError, setMarketError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [edge, setEdge] = useState<Cell | null>(null);
  const [widths, setWidths] = useState(initialWidths);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [find, setFind] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const table = useRef<HTMLTableElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<Order>(`/api/ops/orders/${id}`)
      .then(({ data }) => { if (active) setOrder(data); })
      .catch(reason => { if (active) setError(getApiErrorMessage(reason, t('orderDetail.sheet.loadFailed'))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, t]);
  useEffect(() => {
    let active = true;
    api.get<MarketFx>('/api/fx/rates', { params: { base: 'CNY', symbols: 'USD,BRL' } })
      .then(({ data }) => {
        if (!active) return;
        setMarket(data);
        setRates(current => ({
          ...current,
          USD: current.USD || (Number(data.rates?.USD) > 0 ? formatPrice(data.rates.USD) : ''),
          BRL: current.BRL || (Number(data.rates?.BRL) > 0 ? formatPrice(data.rates.BRL) : '')
        }));
      })
      .catch(() => { if (active) setMarketError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const stop = () => { dragging.current = false; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('blur', stop); };
  }, []);
  useEffect(() => {
    if (!Object.keys(edits).length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [edits]);

  const selected = anchor && edge ? {
    top: Math.min(anchor.row, edge.row), bottom: Math.max(anchor.row, edge.row),
    left: Math.min(anchor.col, edge.col), right: Math.max(anchor.col, edge.col)
  } : null;
  const rate = currency === 'RMB' ? 1 : Number(rates[currency]);
  const validRate = Number.isFinite(rate) && rate > 0;
  const changeCurrency = (next: Currency) => {
    if (next === currency) return;
    const oldRate = currency === 'RMB' ? 1 : Number(rates[currency]);
    const nextRate = next === 'RMB' ? 1 : Number(rates[next]);
    const hasPriceEdits = Object.keys(edits).some(key => priceFields.has(key.split(':')[1] as Field));
    if (Object.entries(edits).some(([key, value]) => priceFields.has(key.split(':')[1] as Field) && (!value.trim() || !Number.isFinite(Number(value))))) {
      setError(t('orderDetail.sheet.invalidNumber')); return;
    }
    if (hasPriceEdits && (!(oldRate > 0) || !(nextRate > 0))) {
      setError(t('orderDetail.sheet.rateRequired')); return;
    }
    if (hasPriceEdits) setEdits(current => Object.fromEntries(Object.entries(current).map(([key, value]) =>
      priceFields.has(key.split(':')[1] as Field) ? [key, formatPrice(Number(value) / oldRate * nextRate)] : [key, value]
    )));
    setCurrency(next);
    setError('');
  };
  const cellValue = (row: number, col: number) => {
    const item = order?.line_items[row];
    if (!item) return '';
    const field = fields[col];
    const edited = edits[`${item.row_no}:${field}`];
    if (edited !== undefined) return edited;
    const original = item[field];
    if (original == null) return '';
    return priceFields.has(field)
      ? validRate ? formatPrice(Number(original) * rate) : ''
      : String(original);
  };
  const selectionText = () => selected ? Array.from({ length: selected.bottom - selected.top + 1 }, (_, row) =>
    Array.from({ length: selected.right - selected.left + 1 }, (_, col) => cellValue(selected.top + row, selected.left + col)).join('\t')).join('\n') : '';
  const copySelection = async () => {
    try { await navigator.clipboard.writeText(selectionText()); setError(''); }
    catch { setError(t('orderDetail.sheet.copyFailed')); }
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    if (!order) return;
    const raw = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(raw)) return;
    event.preventDefault();
    const rows = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    if (startRow + rows.length > order.line_items.length || rows.some(row => startCol + row.length > fields.length)) {
      setError(t('orderDetail.sheet.pasteOverflow')); return;
    }
    const next: Record<string, string> = {};
    for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
      const field = fields[startCol + col];
      const value = rows[row][col].trim();
      if (!value) { setError(t('orderDetail.sheet.emptyCell')); return; }
      if (field === 'hs_code' && !/^(?:\d{8}|\d{10})$/.test(value.trim())) { setError(t('orderDetail.sheet.invalidNcm')); return; }
      if (numericFields.has(field) && !/^\d+(?:[.,]\d+)?$/.test(value)) { setError(t('orderDetail.sheet.invalidNumber')); return; }
      next[`${order.line_items[startRow + row].row_no}:${field}`] = numericFields.has(field) ? value.replace(',', '.') : value;
    }
    setError('');
    setEdits(current => ({ ...current, ...next }));
  };
  const resize = (event: PointerEvent, kind: 'column' | 'row', index: number, initial: number) => {
    event.preventDefault(); event.stopPropagation();
    const start = kind === 'column' ? event.clientX : event.clientY;
    const move = (next: globalThis.PointerEvent) => {
      const delta = (kind === 'column' ? next.clientX : next.clientY) - start;
      const size = Math.max(kind === 'column' ? 85 : 46, Math.min(kind === 'column' ? 700 : 280, initial + delta));
      if (kind === 'column') setWidths(current => current.map((width, col) => col === index ? size : width));
      else setHeights(current => ({ ...current, [index]: size }));
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };
  const matches = order && find.trim() ? order.line_items.flatMap((_, row) => fields.flatMap((__, col) =>
    cellValue(row, col).toLowerCase().includes(find.trim().toLowerCase()) ? [{ row, col }] : [])) : [];
  const jumpToMatch = (index: number) => {
    if (!matches.length) return;
    const next = index % matches.length;
    setMatchIndex(next);
    const match = matches[next];
    const input = table.current?.querySelector<HTMLInputElement>(`input[data-row="${match.row}"][data-col="${match.col}"]`);
    input?.focus(); input?.select(); input?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const save = async () => {
    if (!order) return;
    if (!validRate && Object.keys(edits).some(key => priceFields.has(key.split(':')[1] as Field))) {
      setError(t('orderDetail.sheet.rateRequired')); return;
    }
    const changes = new Map<number, Record<string, string | number>>();
    for (const [key, value] of Object.entries(edits)) {
      const [rowText, field] = key.split(':');
      const rowNo = Number(rowText);
      if (!value.trim()) { setError(t('orderDetail.sheet.emptyCell')); return; }
      if (field === 'hs_code' && !/^(?:\d{8}|\d{10})$/.test(value.trim())) { setError(t('orderDetail.sheet.invalidNcm')); return; }
      if (numericFields.has(field as Field) && (!Number.isFinite(Number(value)) || Number(value) < 0 || (field === 'total_pcs' && !Number.isInteger(Number(value))))) {
        setError(t('orderDetail.sheet.invalidNumber')); return;
      }
      if (!changes.has(rowNo)) changes.set(rowNo, { row_no: rowNo });
      changes.get(rowNo)![field] = priceFields.has(field as Field)
        ? Number(formatPrice(Number(value) / rate))
        : numericFields.has(field as Field) ? Number(value) : value.trim();
    }
    setBusy(true); setError('');
    try {
      const { data } = await api.patch<{ needs_di_analysis: boolean }>(`/api/ops/orders/${id}/line-items`, { changes: [...changes.values()] }, { timeout: 290_000 });
      navigate(`/orders/${id}#order-${data.needs_di_analysis ? 'di' : 'lines'}`);
    } catch (reason) { setError(getApiErrorMessage(reason, t('orderDetail.sheet.saveFailed'))); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="card">{t('common.loading')}</div>;
  if (!order) return <div className="card"><p className="err-msg">{error}</p><Link to="/orders">{t('orderDetail.backToList')}</Link></div>;
  return <>
    <div className="page-title"><h1><Link to={`/orders/${id}#order-lines`} className="btn-link">← {t('common.back')}</Link> &nbsp; {t('orderDetail.sheet.title')} <code>{order.quote_no}</code></h1></div>
    <div className="card">
      <div className="product-sheet-actions">
        <button className="btn" type="button" disabled={busy || !Object.keys(edits).length} onClick={() => void save()}>{busy ? t('common.saving') : t('common.save')}</button>
        <button className="btn btn-ghost" type="button" disabled={busy || !Object.keys(edits).length} onClick={() => { setEdits({}); setError(''); }}>{t('common.cancel')}</button>
        <button className="btn btn-ghost" type="button" disabled={!selected} onClick={() => void copySelection()}>{t('orderDetail.sheet.copy')}</button>
        <label className="product-sheet-find">{t('orderDetail.sheet.find')} <input className="form-input" type="search" value={find} onChange={event => { setFind(event.target.value); setMatchIndex(-1); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); jumpToMatch(matchIndex + 1); } }} /></label>
        <button className="btn btn-ghost" type="button" disabled={!matches.length} onClick={() => jumpToMatch(matchIndex + 1)}>{t('orderDetail.sheet.findNext')} {matches.length ? `${Math.max(0, matchIndex + 1)}/${matches.length}` : ''}</button>
      </div>
      <div className="product-sheet-currency">
        <label>{t('orderDetail.sheet.priceCurrency')} <select className="form-input" value={currency} disabled={busy} onChange={event => changeCurrency(event.target.value as Currency)}><option value="RMB">RMB</option><option value="USD">USD</option><option value="BRL">BRL</option></select></label>
        {currency !== 'RMB' && <label>{t('orderDetail.sheet.exchangeRate', { currency })} <input className="form-input" type="number" min="0.000001" step="0.000001" value={rates[currency]} disabled={busy} onChange={event => setRates(current => ({ ...current, [currency]: event.target.value }))} /></label>}
        {currency !== 'RMB' && market && Number(market.rates?.[currency]) > 0 && <span className="muted text-sm">{t('orderDetail.sheet.marketRate', { rate: formatPrice(market.rates[currency]), currency, date: market.date })}{market.stale ? ` · ${t('orderDetail.di.marketRateStale')}` : ''} <button className="btn btn-sm btn-ghost" type="button" onClick={() => setRates(current => ({ ...current, [currency]: formatPrice(market.rates[currency]) }))}>{t('orderDetail.di.useMarketRate')}</button></span>}
        {currency !== 'RMB' && marketError && <span className="muted text-sm">{t('orderDetail.di.marketRateFailed')}</span>}
        {currency !== 'RMB' && validRate && <span className="muted text-sm">{t('orderDetail.sheet.reverseRate', { currency, rate: formatPrice(1 / rate) })}</span>}
      </div>
      <p className="muted text-sm">{t('orderDetail.sheet.hint')}</p>
      <p className="muted text-sm">{t('orderDetail.sheet.currencyNote')}</p>
      {error && <p className="err-msg" role="alert">{error}</p>}
      {!order.line_items?.length ? <p className="muted">{t('orderDetail.lines.noRows')}</p> : <div className="table-wrap product-sheet-wrap"><table ref={table} className="table product-sheet-table" style={{ width: 68 + widths.reduce((sum, width) => sum + width, 0) }}>
        <colgroup><col style={{ width: 68 }} />{widths.map((width, col) => <col key={col} style={{ width }} />)}</colgroup>
        <thead><tr><th>{t('orderDetail.field.rowNo')}</th>{fields.map((field, col) => <th key={field}><button className="product-sheet-heading" type="button" onClick={() => { setAnchor({ row: 0, col }); setEdge({ row: order.line_items.length - 1, col }); }} title={t('orderDetail.sheet.selectColumn')}>{t(field === 'unit_price' ? 'orderDetail.sheet.unitPrice' : `orderDetail.field.${field === 'hs_code' ? 'hsCode' : field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`)}{priceFields.has(field) ? ` (${currency})` : ''}</button><span className="product-sheet-col-resize" onPointerDown={event => resize(event, 'column', col, widths[col])} /></th>)}</tr></thead>
        <tbody>{order.line_items.map((item, row) => <tr key={item.row_no} style={{ height: heights[row] || 52 }}><td className="product-sheet-row"><button type="button" onClick={() => { setAnchor({ row, col: 0 }); setEdge({ row, col: fields.length - 1 }); }} title={t('orderDetail.sheet.selectRow')}>{item.row_no}</button><span className="product-sheet-row-resize" onPointerDown={event => resize(event, 'row', row, heights[row] || 52)} /></td>{fields.map((field, col) => <td key={field} onPointerDown={event => { if (event.button !== 0 || busy) return; dragging.current = true; if (event.shiftKey && anchor) setEdge({ row, col }); else { setAnchor({ row, col }); setEdge({ row, col }); } }} onPointerEnter={event => { if (dragging.current && event.buttons === 1) setEdge({ row, col }); }}><input className={`form-input product-sheet-cell${selected && row >= selected.top && row <= selected.bottom && col >= selected.left && col <= selected.right ? ' is-selected' : ''}`} data-row={row} data-col={col} value={cellValue(row, col)} disabled={busy} inputMode={numericFields.has(field) ? 'decimal' : undefined} aria-label={`${t(`orderDetail.field.${field === 'hs_code' ? 'hsCode' : field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`)} ${item.row_no}`} onChange={event => setEdits(current => ({ ...current, [`${item.row_no}:${field}`]: event.target.value }))} onPaste={event => paste(event, row, col)} onCopy={event => { if (selected && (selected.top !== selected.bottom || selected.left !== selected.right)) { event.preventDefault(); event.clipboardData.setData('text/plain', selectionText()); } }} onKeyDown={event => { if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; const nextRow = row + (event.key === 'ArrowUp' ? -1 : 1); if (nextRow < 0 || nextRow >= order.line_items.length) return; event.preventDefault(); const next = table.current?.querySelector<HTMLInputElement>(`input[data-row="${nextRow}"][data-col="${col}"]`); next?.focus(); next?.select(); }} /></td>)}</tr>)}</tbody>
      </table></div>}
    </div>
  </>;
}
