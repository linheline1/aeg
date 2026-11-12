import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { showToast } from './Toast';

type Row = { row_no: number; data: Record<string, any>; source_totals?: Record<string, number | null> };
type RowError = { row: number; field_key: string; reason: string };
type NcmSuggestion = { row_no: number; ncm: string; confidence: number; rationale: string; used_image: boolean };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const isSheetFile = (f: File) => /\.xlsx$/i.test(f.name);
const isImageFile = (f: File) => /^image\//i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const numericFields = new Set(['cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price']);
const pasteFields = ['carton_no', 'product_cn', 'product_en', 'sku', 'hs_code', 'cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price', 'material', 'description'] as const;
const requiredFields = ['product_cn', 'product_en', 'sku', 'cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price', 'material'];
const MATERIAL_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '不带电', labelKey: 'upload.material.noBattery' },
  { value: '带电', labelKey: 'upload.material.battery' },
  { value: '含电池', labelKey: 'upload.material.batteryIncluded' },
  { value: '其他', labelKey: 'upload.material.other' }
];

function calculate(row: Row): Row {
  const d = { ...row.data };
  const number = (key: string) => Number.isFinite(Number(d[key])) && d[key] !== '' && d[key] != null ? Number(d[key]) : 0;
  d.total_pcs = number('cartons') * number('pcs_per_carton');
  d.total_gw = number('cartons') * number('gw_per_carton');
  d.unit_cbm = number('length_cm') * number('width_cm') * number('height_cm') / 1_000_000;
  d.total_cbm = d.unit_cbm * number('cartons');
  d.total_price = d.total_pcs * number('unit_price');
  if (!String(d.description || '').trim()) d.description = d.product_en || d.product_cn || '';
  return { ...row, data: d };
}

function validate(row: Row, t: TFunction): RowError[] {
  const d = row.data;
  const errors: RowError[] = [];
  for (const key of requiredFields) {
    if (d[key] == null || String(d[key]).trim() === '') {
      errors.push({ row: row.row_no, field_key: key, reason: t('upload.errors.required', { field: t(`upload.field.${key}`) }) });
    }
  }
  for (const key of numericFields) {
    if (d[key] == null || d[key] === '') continue;
    const value = Number(d[key]);
    if (!Number.isFinite(value)) errors.push({ row: row.row_no, field_key: key, reason: t('upload.errors.number') });
    else if (key !== 'unit_price' && value <= 0) errors.push({ row: row.row_no, field_key: key, reason: t('upload.errors.positive') });
    else if (key === 'unit_price' && value < 0) errors.push({ row: row.row_no, field_key: key, reason: t('upload.errors.nonNegative') });
  }
  if (Number(d.gw_per_carton) < Number(d.nw_per_carton)) errors.push({ row: row.row_no, field_key: 'gw_per_carton', reason: t('upload.errors.gwLtNw') });
  if (d.carton_no && !/^\d+(-\d+)?$/.test(String(d.carton_no))) errors.push({ row: row.row_no, field_key: 'carton_no', reason: t('upload.errors.cartonNoFormat') });
  if (d.hs_code && !/^\d{8}$/.test(String(d.hs_code))) errors.push({ row: row.row_no, field_key: 'hs_code', reason: t('upload.errors.ncm8') });
  const source = row.source_totals || {};
  if (source.total_pcs != null && Math.abs(Number(source.total_pcs) - d.total_pcs) > 0.000001) {
    errors.push({ row: row.row_no, field_key: 'total_pcs', reason: t('upload.errors.totalPcsMismatch', { source: source.total_pcs, computed: d.total_pcs }) });
  }
  if (source.total_price != null && Math.abs(Number(source.total_price) - d.total_price) > 0.02) {
    errors.push({ row: row.row_no, field_key: 'total_price', reason: t('upload.errors.totalPriceMismatch', { source: source.total_price, computed: d.total_price }) });
  }
  if (source.total_cbm != null && Math.abs(Number(source.total_cbm) - d.total_cbm) > Math.max(0.0001, Math.abs(Number(source.total_cbm)) * 0.001)) {
    errors.push({ row: row.row_no, field_key: 'total_cbm', reason: t('upload.errors.totalCbmMismatch', { source: source.total_cbm, computed: d.total_cbm }) });
  }
  return errors;
}

export default function ExcelUploadCard({ onConfirmed }: { onConfirmed?: () => void }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [shots, setShots] = useState<File[]>([]);
  const [shotRows, setShotRows] = useState<string[]>([]);
  const [draftId, setDraftId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [currency, setCurrency] = useState<'RMB' | 'USD'>('RMB');
  const [convertedByAi, setConvertedByAi] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [message, setMessage] = useState('');
  const [aiChecked, setAiChecked] = useState(false);
  const [aiCheckNote, setAiCheckNote] = useState('');
  const [pricePaste, setPricePaste] = useState('');
  const [showPricePaste, setShowPricePaste] = useState(false);
  const [ncmPaste, setNcmPaste] = useState('');
  const [showNcmPaste, setShowNcmPaste] = useState(false);
  const [rowPasteTarget, setRowPasteTarget] = useState<number | null>(null);
  const [rowPaste, setRowPaste] = useState('');
  const [ncmSuggestions, setNcmSuggestions] = useState<NcmSuggestion[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ncmPasteRef = useRef<HTMLDivElement | null>(null);
  const openNcmPaste = () => {
    setShowNcmPaste(value => !value);
    if (!showNcmPaste) window.setTimeout(() => ncmPasteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };
  const dragDepth = useRef(0);

  const fieldLabel = (key: string) => t(`upload.field.${key}`, { defaultValue: key });
  const computedRows = useMemo(() => rows.map(calculate), [rows]);
  const localErrors = useMemo(() => computedRows.flatMap(row => validate(row, t)), [computedRows, t]);
  const remainingServerErrors = serverErrors.filter(error => !localErrors.some(item => item.row === error.row && item.field_key === error.field_key));
  const errors = [...localErrors, ...remainingServerErrors];
  const summary = useMemo(() => computedRows.reduce((total, row) => ({
    pcs: total.pcs + Number(row.data.total_pcs || 0),
    amount: total.amount + Number(row.data.total_price || 0),
    gw: total.gw + Number(row.data.total_gw || 0),
    cbm: total.cbm + Number(row.data.total_cbm || 0)
  }), { pcs: 0, amount: 0, gw: 0, cbm: 0 }), [computedRows]);

  const reset = () => {
    setDraftId(''); setRows([]); setServerErrors([]); setErr(''); setMessage(''); setConvertedByAi(false); setAiNotes('');
    setAiChecked(false); setAiCheckNote(''); setPricePaste(''); setShowPricePaste(false); setNcmPaste(''); setShowNcmPaste(false); setRowPasteTarget(null); setRowPaste(''); setNcmSuggestions([]);
  };

  /**
   * 按文件头识别工作簿类型，返回需要提示用户的问题；null = 可以直接上传。
   * xlsx 是 zip（PK 头），旧版 .xls / 加密工作簿是 OLE2（D0CF11E0），服务端只读 xlsx。
   */
  const sheetProblem = async (f: File): Promise<string | null> => {
    let head: Uint8Array;
    try {
      head = new Uint8Array(await f.slice(0, 64).arrayBuffer());
    } catch {
      return t('upload.problem.unreadable', { name: f.name });
    }
    if (head.length === 0) return t('upload.problem.empty', { name: f.name });

    const isZip = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b
      && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07);
    if (isZip) return null;

    const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (head.length >= 8 && ole2.every((byte, index) => head[index] === byte)) {
      return t('upload.problem.legacyXls', { name: f.name });
    }

    const text = new TextDecoder('utf-8').decode(head).trimStart().toLowerCase();
    if (text.startsWith('<?xml') || text.startsWith('<workbook')) {
      return t('upload.problem.xml', { name: f.name });
    }
    if (text.startsWith('%pdf') || text.startsWith('<!doctype') || text.startsWith('<html')) {
      return t('upload.problem.notExcel', { name: f.name });
    }
    return t('upload.problem.unknown', { name: f.name });
  };

  /** 拖拽/选择统一入口：一个 Excel 清单 + 最多 9 张明细截图 */
  const acceptFiles = async (incoming: FileList | File[] | null) => {
    const picked = Array.from(incoming || []);
    if (picked.length === 0) return;
    setErr(''); setMessage('');

    const sheets = picked.filter(isSheetFile);
    const images = picked.filter(isImageFile).slice(0, 9);
    const unknown = picked.filter(f => !isSheetFile(f) && !isImageFile(f));

    if (unknown.length > 0) {
      setErr(t('upload.err.notXlsx', { name: unknown[0].name }));
    }
    const sheet = sheets[0];
    if (sheet && sheet.size > MAX_FILE_BYTES) {
      setErr(t('upload.err.tooLarge', { name: sheet.name }));
      return;
    }
    if (sheet) {
      const problem = await sheetProblem(sheet);
      setFile(sheet);
      reset();
      if (problem) {
        setErr(problem);
        return;
      }
      if (sheets.length > 1) setMessage(t('upload.msg.singleFile', { name: sheet.name }));
    }
    if (images.length > 0) {
      setShots(current => [...current, ...images].slice(0, 9));
      setShotRows(current => [...current, ...images.map(() => '')].slice(0, 9));
      if (!sheet) setMessage(t('upload.msg.imagesAdded', { count: images.length }));
    }
  };

  const clearFile = () => {
    setFile(null);
    reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** 出错后一键换文件：清空当前选择并立即打开文件框 */
  const reselect = () => {
    clearFile();
    fileInputRef.current?.click();
  };

  const onDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    acceptFiles(event.dataTransfer?.files || null);
  };

  const preview = async () => {
    if (!file) return;
    const problem = await sheetProblem(file);
    if (problem) {
      setErr(problem);
      setBusy(false);
      return;
    }
    setBusy(true); setErr(''); setMessage(''); reset();
    try {
      const data = new FormData();
      data.append('file', file);
      shots.forEach(shot => data.append('files', shot));
      const rowMap: Record<string, number> = {};
      shots.forEach((shot, index) => {
        const rowNo = Number(shotRows[index]);
        if (Number.isInteger(rowNo) && rowNo > 0) rowMap[shot.name] = rowNo;
      });
      data.append('row_map', JSON.stringify(rowMap));
      const response = await api.post('/api/client/orders/upload/preview', data, { timeout: 180_000 });
      if (!response.data.ok) {
        setErr(response.data.error_summary || t('upload.err.recognizeFailed'));
        return;
      }
      setDraftId(response.data.draft_id);
      setRows(response.data.rows || []);
      setCurrency(response.data.declared_currency || 'RMB');
      setConvertedByAi(!!response.data.converted_by_ai);
      setAiNotes(response.data.ai_notes || '');
      setServerErrors(response.data.errors || []);
    } catch (e: any) {
      const serverMessage = e?.response?.data?.message || e?.response?.data?.error_summary;
      if (serverMessage) setErr(serverMessage);
      else if (!e?.response) {
        setErr(t('upload.err.uploadInterrupted'));
      } else {
        setErr(e?.message || t('upload.err.recognizeFailed'));
      }
    } finally { setBusy(false); }
  };

  const update = (index: number, key: string, value: string) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      data: { ...row.data, [key]: numericFields.has(key) ? (value === '' ? null : Number(value)) : value }
    } : row));
    const rowNo = rows[index]?.row_no;
    setServerErrors(current => current.filter(error => error.row !== rowNo || error.field_key !== key));
    setAiChecked(false);
    setAiCheckNote(t('upload.note.dataChanged'));
  };

  const applyPriceColumn = () => {
    const values = pricePaste.split(/\r?\n|\t/).map(value => value.trim()).filter(Boolean);
    if (!values.length) { setErr(t('upload.err.priceEmpty')); return; }
    if (values.length > rows.length) { setErr(t('upload.err.priceTooMany', { pasted: values.length, rows: rows.length })); return; }
    const invalid = values.find(value => !Number.isFinite(Number(value)) || Number(value) < 0);
    if (invalid !== undefined) { setErr(t('upload.err.priceInvalid', { value: invalid })); return; }
    setRows(current => current.map((row, index) => index < values.length
      ? { ...row, data: { ...row.data, unit_price: Number(values[index]) } }
      : row));
    setServerErrors(current => current.filter(error => error.field_key !== 'unit_price' && error.field_key !== 'total_price'));
    setAiChecked(false); setAiCheckNote(t('upload.note.priceUpdated')); setErr('');
    setShowPricePaste(false); setPricePaste('');
    showToast(t('upload.toast.priceUpdated', { count: values.length }));
  };

  const removeRow = (rowNo: number) => {
    setRows(current => current.filter(row => row.row_no !== rowNo));
    setServerErrors(current => current.filter(error => error.row !== rowNo));
    setAiChecked(false);
    setNcmSuggestions(current => current.filter(item => item.row_no !== rowNo));
    setAiCheckNote(t('upload.note.rowDeleted'));
  };

  const applyNcmColumn = () => {
    const values = ncmPaste.trim().split(/\r?\n|\t/).map(value => value.trim());
    if (!values.length || !values.some(Boolean)) { setErr(t('upload.err.ncmEmpty')); return; }
    if (values.length > rows.length) { setErr(t('upload.err.ncmTooMany', { pasted: values.length, rows: rows.length })); return; }
    const invalid = values.find(value => value && !/^\d{8}$/.test(value));
    if (invalid) { setErr(t('upload.err.ncmInvalid', { value: invalid })); return; }
    setRows(current => current.map((row, index) => index < values.length
      ? { ...row, data: { ...row.data, hs_code: values[index] } } : row));
    setServerErrors(current => current.filter(error => error.field_key !== 'hs_code'));
    setAiChecked(false); setAiCheckNote(t('upload.note.ncmUpdated')); setErr('');
    setShowNcmPaste(false); setNcmPaste('');
    showToast(t('upload.toast.ncmUpdated', { count: values.length }));
  };

  const applyRowPaste = () => {
    const targetIndex = rows.findIndex(row => row.row_no === rowPasteTarget);
    if (targetIndex < 0) { setErr(t('upload.err.rowGone')); return; }
    const lines = rowPaste.replace(/(?:\r?\n)+$/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) { setErr(t('upload.err.rowPasteEmpty')); return; }
    if (targetIndex + lines.length > rows.length) { setErr(t('upload.err.rowPasteOverflow', { row: rowPasteTarget, remaining: rows.length - targetIndex })); return; }
    const values = lines.map(line => line.split('\t'));
    const wrong = values.findIndex(cells => cells.length !== pasteFields.length);
    if (wrong >= 0) { setErr(t('upload.err.rowPasteColumns', { line: wrong + 1, actual: values[wrong].length, expected: pasteFields.length })); return; }
    for (const cells of values) {
      for (let index = 0; index < pasteFields.length; index++) {
        const key = pasteFields[index];
        const value = cells[index].trim();
        if (numericFields.has(key) && value && !Number.isFinite(Number(value))) { setErr(t('upload.err.fieldNotNumber', { field: fieldLabel(key), value })); return; }
        if (key === 'hs_code' && value && !/^\d{8}$/.test(value)) { setErr(t('upload.err.ncm8Short', { value })); return; }
      }
    }
    const affected = new Set(rows.slice(targetIndex, targetIndex + values.length).map(row => row.row_no));
    setRows(current => current.map((row, index) => {
      if (index < targetIndex || index >= targetIndex + values.length) return row;
      const data = { ...row.data };
      pasteFields.forEach((key, fieldIndex) => {
        const value = values[index - targetIndex][fieldIndex].trim();
        data[key] = numericFields.has(key) ? (value === '' ? null : Number(value)) : value;
      });
      return { ...row, data };
    }));
    setServerErrors(current => current.filter(error => !affected.has(error.row)));
    setNcmSuggestions(current => current.filter(item => !affected.has(item.row_no)));
    setAiChecked(false); setAiCheckNote(t('upload.note.dataChanged')); setErr('');
    setRowPasteTarget(null); setRowPaste('');
    showToast(t('upload.toast.rowPasted', { count: values.length }));
  };

  const aiCheck = async () => {
    if (!draftId || !rows.length || errors.length > 0) return;
    setBusy(true); setErr(''); setMessage(''); setAiCheckNote('');
    try {
      const response = await api.post('/api/client/orders/upload/ai-check', {
        draft_id: draftId, rows: computedRows
      }, { timeout: 180_000 });
      setRows(response.data.rows || computedRows);
      setNcmSuggestions(response.data.suggestions || []);
      setServerErrors(response.data.issues || []);
      if (!response.data.ok) {
        setAiChecked(false);
        setErr(t('upload.err.aiIssues', { count: response.data.issues?.length || 0 }));
        return;
      }
      setAiChecked(true);
      const low = Number(response.data.low_confidence_count || 0);
      setAiCheckNote(low
        ? t('upload.note.aiDoneLow', { count: response.data.ncm_count || 0, low })
        : t('upload.note.aiDone', { count: response.data.ncm_count || 0 }));
      showToast(t('upload.toast.aiPassed'));
    } catch (e: any) {
      setAiChecked(false);
      setErr(getApiErrorMessage(e, t('upload.err.aiFailed')));
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (draftId) {
      try { await api.delete(`/api/client/orders/upload/${draftId}`); } catch { /* ignore */ }
    }
    setFile(null); setShots([]); setShotRows([]); reset();
  };

  const confirm = async () => {
    if (!draftId || !rows.length || errors.length > 0 || (!aiChecked && !computedRows.every(row => /^\d{8}$/.test(String(row.data.hs_code || '').trim())))) return;
    setBusy(true); setErr(''); setMessage('');
    try {
      const response = await api.post('/api/client/orders/upload/confirm', {
        draft_id: draftId,
        rows: computedRows,
        declared_currency: currency
      }, { timeout: 120_000 });
      if (!response.data.ok) {
        setServerErrors(response.data.errors || []);
        setErr(response.data.error_summary || t('upload.err.validationFailed'));
        return;
      }
      setMessage(t('upload.msg.quoteCreated', { quote: response.data.quote_no }));
      showToast(t('upload.msg.quoteCreated', { quote: response.data.quote_no }));
      onConfirmed?.();
      setTimeout(() => nav(`/orders/${response.data.quote_id}`), 800);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('upload.err.confirmFailed')));
    } finally { setBusy(false); }
  };

  const input = (row: Row, index: number, key: string, type = 'text') => (
    <input
      className={`form-input form-input-sm${errors.some(error => error.row === row.row_no && error.field_key === key) ? ' upload-field-error' : ''}`}
      style={{ minWidth: type === 'number' ? 82 : 120, width: '100%' }}
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={row.data[key] ?? ''}
      title={errors.filter(error => error.row === row.row_no && error.field_key === key).map(error => error.reason).join(t('upload.fieldSeparator'))}
      onChange={event => update(index, key, event.target.value)}
    />
  );

  return (
    <div className="card">
      <div className="card-title">
        <h3>{t('upload.title')}</h3>
        <span className="muted text-sm">{t('upload.subtitle')}</span>
      </div>
      {!draftId && (
        <>
          <label
            className={`dropzone${dragActive ? ' dropzone-active' : ''}${file ? ' dropzone-has-file' : ''}`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={event => {
              if ((event.target as HTMLElement).closest('button')) event.preventDefault();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              aria-label={t('upload.chooseFileAria')}
              onChange={event => { acceptFiles(event.target.files); event.target.value = ''; }}
            />
            {file ? (
              <div className="dropzone-file">
                <span className="dropzone-file-icon" aria-hidden="true">📄</span>
                <div className="dropzone-file-main">
                  <strong title={file.name}>{file.name}</strong>
                  <span className="muted text-sm">{formatSize(file.size)} · {t('upload.fileReady')}</span>
                </div>
                <div className="dropzone-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>{t('upload.replace')}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearFile}>{t('upload.remove')}</button>
                </div>
              </div>
            ) : (
              <div className="dropzone-empty">
                <span className="dropzone-icon" aria-hidden="true">📥</span>
                <strong className="dropzone-title">{dragActive ? t('upload.dropActiveTitle') : t('upload.dropTitle')}</strong>
                <span className="muted text-sm">
                  {t('upload.or')}<span className="dropzone-link">{t('upload.clickToChoose')}</span>
                  {t('upload.dropHint')}
                </span>
              </div>
            )}
            {dragActive && <span className="dropzone-badge">{t('upload.dropBadge')}</span>}
          </label>

          <div className="row gap-md mt-12" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="file-pick-label">
              <input type="file" accept="image/*" multiple onChange={event => {
                const picked = Array.from(event.target.files || []).slice(0, 9);
                setShots(picked); setShotRows(picked.map(() => ''));
              }} />
              {shots.length ? t('upload.shotsSelected', { count: shots.length }) : t('upload.shotsOptional')}
            </label>
            <button className="btn btn-lg" disabled={!file || busy} onClick={preview}>{busy ? t('upload.recognizing') : t('upload.recognize')}</button>
            {!file && <span className="muted text-sm">{t('upload.recognizeHint')}</span>}
          </div>
          {shots.map((shot, index) => (
            <div className="row gap-md mt-8" key={`${shot.name}-${index}`}>
              <span className="text-sm" style={{ flex: 1 }}>{shot.name}</span>
              <input className="form-input form-input-sm" style={{ width: 160 }} type="number" min={1} placeholder={t('upload.rowNoPlaceholder')}
                value={shotRows[index] || ''} onChange={event => setShotRows(current => current.map((value, i) => i === index ? event.target.value : value))} />
            </div>
          ))}
        </>
      )}

      {err && (
        <div className="alert alert-err mt-12">
          {err}
          {file && !draftId && (
            <div className="mt-8">
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reselect}>
                {t('upload.reselectFile')}
              </button>
            </div>
          )}
        </div>
      )}
      {message && <div className="alert alert-ok mt-12">{message}</div>}
      {draftId && (
        <div className="mt-12">
          {file && (
            <p className="muted text-sm" style={{ margin: '0 0 8px' }}>
              {t('upload.recognizedFile')}<strong>{file.name}</strong>
              <button type="button" className="btn-link" style={{ marginLeft: 8 }} onClick={cancel} disabled={busy}>{t('upload.reupload')}</button>
            </p>
          )}
          <div className="alert alert-warn">
            {t('upload.reviewNote')}
            {convertedByAi && <div className="mt-8">{aiNotes ? t('upload.aiConvertedNotes', { notes: aiNotes }) : t('upload.aiConverted')}</div>}
          </div>
          <div className="row gap-md" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-row" style={{ margin: 0 }}>
              <label>{t('upload.currencyLabel')}</label>
              <select className="form-input" value={currency} onChange={event => setCurrency(event.target.value as 'RMB' | 'USD')}>
                <option value="RMB">{t('upload.currencyRmb')}</option>
                <option value="USD">{t('upload.currencyUsd')}</option>
              </select>
            </div>
            <span>{t('upload.rowCountLabel')}<strong>{rows.length}</strong></span>
            <span>{t('upload.totalPcsLabel')}<strong>{summary.pcs.toLocaleString()}</strong></span>
            <span>{t('upload.totalGwLabel')}<strong>{summary.gw.toFixed(2)} kg</strong></span>
            <span>{t('upload.totalCbmLabel')}<strong>{summary.cbm.toFixed(4)}</strong></span>
            <span>{t('upload.totalAmountLabel')}<strong>{summary.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}</strong></span>
          </div>

          {errors.length > 0 && (
            <div className="alert alert-err mt-12">
              <strong>{t('upload.errorsCount', { count: errors.length })}</strong>
              {errors.slice(0, 12).map((error, index) => <div key={`${error.row}-${error.field_key}-${index}`}>{t('upload.errorLine', { row: error.row, field: fieldLabel(error.field_key), reason: error.reason })}</div>)}
              {errors.length > 12 && <div>{t('upload.errorsMore', { count: errors.length })}</div>}
            </div>
          )}

          <div className="row gap-md mt-12" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={openNcmPaste}>{t('upload.pasteNcmColumn')}</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setShowPricePaste(value => !value)}>{t('upload.pastePriceColumn')}</button>
          </div>
          <div className="table-wrap mt-12">
            <table className="table" style={{ minWidth: 1800 }}>
              <thead><tr>
                <th>{t('upload.th.row')}</th><th>{t('upload.field.carton_no')}</th><th>{t('upload.field.product_cn')}</th><th>{t('upload.field.product_en')}</th><th>{t('upload.field.sku')}</th><th>{t('upload.field.hs_code')}<button type="button" className="btn-link price-paste-trigger" onClick={openNcmPaste}>{t('upload.pasteColumn')}</button></th>
                <th>{t('upload.field.cartons')}</th><th>{t('upload.field.pcs_per_carton')}</th><th>{t('upload.field.total_pcs')}</th><th>{t('upload.field.nw_per_carton')}</th><th>{t('upload.field.gw_per_carton')}</th>
                <th>{t('upload.field.length_cm')}</th><th>{t('upload.field.width_cm')}</th><th>{t('upload.field.height_cm')}</th><th>{t('upload.field.total_cbm')}</th><th>{t('upload.th.unitPrice', { currency })}<button type="button" className="btn-link price-paste-trigger" onClick={() => setShowPricePaste(value => !value)}>{t('upload.pasteColumn')}</button></th><th>{t('upload.th.totalPrice', { currency })}</th><th>{t('upload.field.material')}</th><th>{t('upload.field.description')}</th><th>{t('upload.th.issue')}</th><th>{t('upload.th.actions')}</th>
              </tr></thead>
              <tbody>
                {computedRows.map((row, index) => {
                  const rowHasError = errors.some(error => error.row === row.row_no);
                  return (
                    <tr key={row.row_no} style={rowHasError ? { background: '#fff5f5' } : undefined}>
                      <td>{row.row_no}</td>
                      <td>{input(row, index, 'carton_no')}</td>
                      <td>{input(row, index, 'product_cn')}</td>
                      <td>{input(row, index, 'product_en')}</td>
                      <td>{input(row, index, 'sku')}</td>
                      <td>{input(row, index, 'hs_code')}{ncmSuggestions.filter(item => item.row_no === row.row_no).map(item => <div className="upload-ncm-suggestion" key={item.row_no}>{t('upload.aiSuggestion', { confidence: Math.round(item.confidence * 100) })}{item.used_image ? t('upload.aiUsedImage') : ''}<span>{item.rationale}</span></div>)}</td>
                      <td>{input(row, index, 'cartons', 'number')}</td>
                      <td>{input(row, index, 'pcs_per_carton', 'number')}</td>
                      <td>{Number(row.data.total_pcs).toLocaleString()}</td>
                      <td>{input(row, index, 'nw_per_carton', 'number')}</td>
                      <td>{input(row, index, 'gw_per_carton', 'number')}</td>
                      <td>{input(row, index, 'length_cm', 'number')}</td>
                      <td>{input(row, index, 'width_cm', 'number')}</td>
                      <td>{input(row, index, 'height_cm', 'number')}</td>
                      <td>{Number(row.data.total_cbm).toFixed(4)}</td>
                      <td>{input(row, index, 'unit_price', 'number')}</td>
                      <td>{Number(row.data.total_price).toFixed(2)}</td>
                      <td>
                        <select className="form-input form-input-sm" value={row.data.material || '其他'} onChange={event => update(index, 'material', event.target.value)}>
                          {MATERIAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                        </select>
                      </td>
                      <td>{input(row, index, 'description')}</td>
                      <td className="upload-row-errors">{errors.filter(error => error.row === row.row_no).map((error, issueIndex) => <div key={`${error.field_key}-${issueIndex}`}><strong>{fieldLabel(error.field_key)}:</strong> {error.reason}</div>)}</td>
                      <td><button type="button" className="btn-link" disabled={busy} onClick={() => { setRowPasteTarget(row.row_no); setRowPaste(''); }} aria-label={t('upload.pasteRowAria', { row: row.row_no })}>{t('upload.pasteRow')}</button> <button type="button" className="btn-link" disabled={busy} onClick={() => removeRow(row.row_no)} aria-label={t('upload.deleteRowAria', { row: row.row_no })}>{t('common.delete')}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rowPasteTarget !== null && <div className="price-column-paste mt-12">
            <div><strong>{t('upload.pasteRowTitle', { row: rowPasteTarget })}</strong><p className="muted text-sm">{t('upload.pasteRowHint', { count: pasteFields.length, fields: pasteFields.map(key => fieldLabel(key)).join(t('upload.fieldSeparator')) })}</p></div>
            <textarea className="form-input" rows={5} autoFocus aria-label={t('upload.pasteRowInputAria')} placeholder={t('upload.pasteRowPlaceholder')} value={rowPaste} onChange={event => setRowPaste(event.target.value)} />
            <div className="row gap-md"><button type="button" className="btn" disabled={busy} onClick={applyRowPaste}>{t('upload.applyRow')}</button><button type="button" className="btn btn-ghost" onClick={() => { setRowPasteTarget(null); setRowPaste(''); }}>{t('common.cancel')}</button></div>
          </div>}
          {showPricePaste && (
            <div className="price-column-paste mt-12">
              <div>
                <strong>{t('upload.priceTitle')}</strong>
                <p className="muted text-sm">{t('upload.priceHint')}</p>
              </div>
              <textarea className="form-input" rows={5} autoFocus placeholder={t('upload.pricePlaceholder')} value={pricePaste} onChange={event => setPricePaste(event.target.value)} />
              <div className="row gap-md">
                <button type="button" className="btn" onClick={applyPriceColumn}>{t('upload.applyPrice')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPricePaste(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
          {showNcmPaste && <div ref={ncmPasteRef} className="price-column-paste mt-12">
            <div><strong>{t('upload.ncmTitle')}</strong><p className="muted text-sm">{t('upload.ncmHint')}</p></div>
            <textarea className="form-input" rows={5} placeholder={t('upload.ncmPlaceholder')} value={ncmPaste} onChange={event => setNcmPaste(event.target.value)} />
            <div className="row gap-md"><button type="button" className="btn" onClick={applyNcmColumn}>{t('upload.applyNcm')}</button><button type="button" className="btn btn-ghost" onClick={() => setShowNcmPaste(false)}>{t('common.cancel')}</button></div>
          </div>}
          {aiCheckNote && <div className={`alert ${aiChecked ? 'alert-ok' : 'alert-warn'} mt-12`}>{aiCheckNote}</div>}
          <div className="row gap-md mt-12">
            {!computedRows.every(row => /^\d{8}$/.test(String(row.data.hs_code || '').trim())) && <button className="btn btn-lg" disabled={busy || !rows.length || errors.length > 0} onClick={aiCheck}>{busy ? t('upload.aiChecking') : t('upload.aiCheck')}</button>}
            <button className="btn btn-lg btn-success" disabled={busy || !rows.length || errors.length > 0 || (!aiChecked && !computedRows.every(row => /^\d{8}$/.test(String(row.data.hs_code || '').trim())))} onClick={confirm}>{busy ? t('upload.creating') : t('upload.submit')}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={cancel}>{t('upload.cancelAndReselect')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
