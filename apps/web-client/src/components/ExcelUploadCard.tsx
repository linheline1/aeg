import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { showToast } from './Toast';

type Row = { row_no: number; data: Record<string, any>; source_totals?: Record<string, number | null> };
type RowError = { row: number; field_key: string; reason: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const isSheetFile = (f: File) => /\.xlsx$/i.test(f.name);
const isImageFile = (f: File) => /^image\//i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const numericFields = new Set(['cartons', 'pcs_per_carton', 'nw_per_carton', 'gw_per_carton', 'length_cm', 'width_cm', 'height_cm', 'unit_price']);
const requiredFields: [string, string][] = [
  ['product_cn', '中文品名'], ['product_en', '英文品名'], ['sku', 'SKU'],
  ['cartons', '箱数'], ['pcs_per_carton', '每箱件数'], ['nw_per_carton', '单箱净重'], ['gw_per_carton', '单箱毛重'],
  ['length_cm', '长'], ['width_cm', '宽'], ['height_cm', '高'], ['unit_price', '单价'], ['material', '材质']
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

function validate(row: Row): RowError[] {
  const d = row.data;
  const errors: RowError[] = [];
  for (const [key, label] of requiredFields) {
    if (d[key] == null || String(d[key]).trim() === '') errors.push({ row: row.row_no, field_key: key, reason: `${label}必填` });
  }
  for (const key of numericFields) {
    if (d[key] == null || d[key] === '') continue;
    const value = Number(d[key]);
    if (!Number.isFinite(value)) errors.push({ row: row.row_no, field_key: key, reason: '必须是数字' });
    else if (key !== 'unit_price' && value <= 0) errors.push({ row: row.row_no, field_key: key, reason: '必须大于 0' });
    else if (key === 'unit_price' && value < 0) errors.push({ row: row.row_no, field_key: key, reason: '不能小于 0' });
  }
  if (Number(d.gw_per_carton) < Number(d.nw_per_carton)) errors.push({ row: row.row_no, field_key: 'gw_per_carton', reason: '毛重不能小于净重' });
  if (d.carton_no && !/^\d+(-\d+)?$/.test(String(d.carton_no))) errors.push({ row: row.row_no, field_key: 'carton_no', reason: '箱号格式如 1 或 1-20' });
  if (d.hs_code && !/^\d{8}$/.test(String(d.hs_code))) errors.push({ row: row.row_no, field_key: 'hs_code', reason: 'HS/NCM 应为 8 位数字' });
  const source = row.source_totals || {};
  if (source.total_pcs != null && Math.abs(Number(source.total_pcs) - d.total_pcs) > 0.000001) {
    errors.push({ row: row.row_no, field_key: 'total_pcs', reason: `原表 ${source.total_pcs}，重算 ${d.total_pcs}` });
  }
  if (source.total_price != null && Math.abs(Number(source.total_price) - d.total_price) > 0.02) {
    errors.push({ row: row.row_no, field_key: 'total_price', reason: `原表金额 ${source.total_price}，重算 ${d.total_price}` });
  }
  if (source.total_cbm != null && Math.abs(Number(source.total_cbm) - d.total_cbm) > Math.max(0.0001, Math.abs(Number(source.total_cbm)) * 0.001)) {
    errors.push({ row: row.row_no, field_key: 'total_cbm', reason: `原表 CBM ${source.total_cbm}，重算 ${d.total_cbm}` });
  }
  return errors;
}

export default function ExcelUploadCard({ onConfirmed }: { onConfirmed?: () => void }) {
  const nav = useNavigate();
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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const computedRows = useMemo(() => rows.map(calculate), [rows]);
  const localErrors = useMemo(() => computedRows.flatMap(validate), [computedRows]);
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
      return `浏览器无法读取「${f.name}」：文件可能已被移动、删除，或来自邮件/微信的临时缓存。请先另存到本地（桌面）后重新拖入。`;
    }
    if (head.length === 0) return `「${f.name}」是空文件（0 KB），请在 Excel 中重新导出后再上传。`;

    const isZip = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b
      && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07);
    if (isZip) return null;

    const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (head.length >= 8 && ole2.every((byte, index) => head[index] === byte)) {
      return `「${f.name}」是旧版 .xls 或带密码保护的 Excel 工作簿。请在 Excel / WPS 中打开（如有密码请先取消保护），然后「另存为 → Excel 工作簿 (*.xlsx)」再上传。`;
    }

    const text = new TextDecoder('utf-8').decode(head).trimStart().toLowerCase();
    if (text.startsWith('<?xml') || text.startsWith('<workbook')) {
      return `「${f.name}」是 Excel 2003 XML 表格，请用 Excel 打开后「另存为 .xlsx」再上传。`;
    }
    if (text.startsWith('%pdf') || text.startsWith('<!doctype') || text.startsWith('<html')) {
      return `「${f.name}」不是 Excel 工作簿（看起来是 PDF 或网页文件）。请上传装箱清单的 .xlsx 原文件。`;
    }
    return `「${f.name}」无法识别为 Excel 工作簿。当前支持 .xlsx；若是 .xls / .csv / 加密文件，请先在 Excel 中「另存为 .xlsx」再上传。`;
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
      setErr(`「${unknown[0].name}」不是 .xlsx 清单文件，请先在 Excel 中另存为 .xlsx 后重试`);
    }
    const sheet = sheets[0];
    if (sheet && sheet.size > MAX_FILE_BYTES) {
      setErr(`「${sheet.name}」超过 20 MB，请拆分或压缩后重试`);
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
      if (sheets.length > 1) setMessage(`一次只识别一个清单，已使用「${sheet.name}」`);
    }
    if (images.length > 0) {
      setShots(current => [...current, ...images].slice(0, 9));
      setShotRows(current => [...current, ...images.map(() => '')].slice(0, 9));
      if (!sheet) setMessage(`已加入 ${images.length} 张明细截图，再拖入 Excel 清单即可识别`);
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
        setErr(response.data.error_summary || '文件识别失败');
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
        setErr('上传中断：文件没有送达服务器。请确认文件仍在本机（未被移动或删除）、网络正常后重试；若来自邮件或微信，请先另存到桌面。');
      } else {
        setErr(e?.message || '文件识别失败');
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
  };

  const cancel = async () => {
    if (draftId) {
      try { await api.delete(`/api/client/orders/upload/${draftId}`); } catch { /* ignore */ }
    }
    setFile(null); setShots([]); setShotRows([]); reset();
  };

  const confirm = async () => {
    if (!draftId || errors.length > 0) return;
    setBusy(true); setErr(''); setMessage('');
    try {
      const response = await api.post('/api/client/orders/upload/confirm', {
        draft_id: draftId,
        rows: computedRows,
        declared_currency: currency
      }, { timeout: 120_000 });
      if (!response.data.ok) {
        setServerErrors(response.data.errors || []);
        setErr(response.data.error_summary || '校验未通过，请继续修改');
        return;
      }
      setMessage(`报价 ${response.data.quote_no} 已创建，AI 正在计算 DI 并生成参考 DDP…`);
      showToast(`报价 ${response.data.quote_no} 已创建，AI 正在计算 DI 并生成参考 DDP…`);
      onConfirmed?.();
      setTimeout(() => nav(`/orders/${response.data.quote_id}`), 800);
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '确认提交失败'));
    } finally { setBusy(false); }
  };

  const input = (row: Row, index: number, key: string, type = 'text') => (
    <input
      className="form-input form-input-sm"
      style={{ minWidth: type === 'number' ? 82 : 120, width: '100%' }}
      type={type}
      step={type === 'number' ? 'any' : undefined}
      value={row.data[key] ?? ''}
      onChange={event => update(index, key, event.target.value)}
    />
  );

  return (
    <div className="card">
      <div className="card-title">
        <h3>上传清单 · 获取报价</h3>
        <span className="muted text-sm">先识别核对，再创建报价</span>
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
              aria-label="选择 Excel 清单文件"
              onChange={event => { acceptFiles(event.target.files); event.target.value = ''; }}
            />
            {file ? (
              <div className="dropzone-file">
                <span className="dropzone-file-icon" aria-hidden="true">📄</span>
                <div className="dropzone-file-main">
                  <strong title={file.name}>{file.name}</strong>
                  <span className="muted text-sm">{formatSize(file.size)} · 已就绪，可直接拖入新文件替换</span>
                </div>
                <div className="dropzone-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>更换</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearFile}>移除</button>
                </div>
              </div>
            ) : (
              <div className="dropzone-empty">
                <span className="dropzone-icon" aria-hidden="true">📥</span>
                <strong className="dropzone-title">{dragActive ? '松开鼠标，开始识别清单' : '把 Excel 清单拖到这里'}</strong>
                <span className="muted text-sm">
                  也可以<span className="dropzone-link">点击选择文件</span>
                  · 支持 .xlsx（客户任意模板，AI 自动识别列）· 单文件 ≤ 20 MB
                </span>
              </div>
            )}
            {dragActive && <span className="dropzone-badge">松开即可导入 · 也可同时拖入明细截图</span>}
          </label>

          <div className="row gap-md mt-12" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="file-pick-label">
              <input type="file" accept="image/*" multiple onChange={event => {
                const picked = Array.from(event.target.files || []).slice(0, 9);
                setShots(picked); setShotRows(picked.map(() => ''));
              }} />
              {shots.length ? `已选 ${shots.length} 张截图` : '明细截图（可选）'}
            </label>
            <button className="btn btn-lg" disabled={!file || busy} onClick={preview}>{busy ? 'AI 识别与校验中…' : '识别清单'}</button>
            {!file && <span className="muted text-sm">拖入或选择 .xlsx 后即可识别</span>}
          </div>
          {shots.map((shot, index) => (
            <div className="row gap-md mt-8" key={`${shot.name}-${index}`}>
              <span className="text-sm" style={{ flex: 1 }}>{shot.name}</span>
              <input className="form-input form-input-sm" style={{ width: 160 }} type="number" min={1} placeholder="对应 Excel 行号（可选）"
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
                重新选择文件
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
              已识别清单：<strong>{file.name}</strong>
              <button type="button" className="btn-link" style={{ marginLeft: 8 }} onClick={cancel} disabled={busy}>重新上传</button>
            </p>
          )}
          <div className="alert alert-warn">
            请核对识别结果。总件数、金额和 CBM 由系统重算；原表合计不一致的行必须修正后才能创建报价。
            {convertedByAi && <div className="mt-8">AI 已转换非标准模板{aiNotes ? `：${aiNotes}` : ''}</div>}
          </div>
          <div className="row gap-md" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-row" style={{ margin: 0 }}>
              <label>清单申报币种</label>
              <select className="form-input" value={currency} onChange={event => setCurrency(event.target.value as 'RMB' | 'USD')}>
                <option value="RMB">RMB 人民币</option>
                <option value="USD">USD 美元（确认时折算 RMB）</option>
              </select>
            </div>
            <span>产品行：<strong>{rows.length}</strong></span>
            <span>总件数：<strong>{summary.pcs.toLocaleString()}</strong></span>
            <span>总毛重：<strong>{summary.gw.toFixed(2)} kg</strong></span>
            <span>总 CBM：<strong>{summary.cbm.toFixed(4)}</strong></span>
            <span>总金额：<strong>{summary.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}</strong></span>
          </div>

          {errors.length > 0 && (
            <div className="alert alert-err mt-12">
              <strong>还有 {errors.length} 项需要核对</strong>
              {errors.slice(0, 12).map((error, index) => <div key={`${error.row}-${error.field_key}-${index}`}>Excel Row{error.row} · {error.field_key}：{error.reason}</div>)}
              {errors.length > 12 && <div>…共 {errors.length} 条</div>}
            </div>
          )}

          <div className="table-wrap mt-12">
            <table className="table" style={{ minWidth: 1800 }}>
              <thead><tr>
                <th>Excel 行</th><th>箱号</th><th>中文品名</th><th>英文品名</th><th>SKU</th><th>HS/NCM</th>
                <th>箱数</th><th>每箱件数</th><th>总件数</th><th>净重/箱</th><th>毛重/箱</th>
                <th>长 cm</th><th>宽 cm</th><th>高 cm</th><th>总 CBM</th><th>单价 {currency}</th><th>总金额 {currency}</th><th>材质</th><th>产品描述</th>
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
                      <td>{input(row, index, 'hs_code')}</td>
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
                          {['不带电', '带电', '含电池', '其他'].map(value => <option key={value}>{value}</option>)}
                        </select>
                      </td>
                      <td>{input(row, index, 'description')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row gap-md mt-12">
            <button className="btn btn-lg" disabled={busy || errors.length > 0} onClick={confirm}>{busy ? '正在创建…' : `核对无误，创建${convertedByAi ? ' AI ' : ''}报价单`}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={cancel}>取消并重新选择</button>
          </div>
        </div>
      )}
    </div>
  );
}
