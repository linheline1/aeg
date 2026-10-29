import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../store/auth';

type Row = { row_no: number; data: Record<string, any>; source_totals?: Record<string, number | null> };
type RowError = { row: number; field_key: string; reason: string };

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

  const preview = async () => {
    if (!file) return;
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
      setErr(e?.response?.data?.message || e?.message || '文件识别失败');
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
      onConfirmed?.();
      setTimeout(() => nav(`/orders/${response.data.quote_id}`), 800);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || '确认提交失败');
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
          <div className="row gap-md mt-8" style={{ flexWrap: 'wrap' }}>
            <label className="file-pick-label">
              <input type="file" accept=".xlsx" onChange={event => { setFile(event.target.files?.[0] || null); reset(); }} />
              {file ? file.name : '选择 .xlsx 文件'}
            </label>
            <label className="file-pick-label">
              <input type="file" accept="image/*" multiple onChange={event => {
                const picked = Array.from(event.target.files || []).slice(0, 9);
                setShots(picked); setShotRows(picked.map(() => ''));
              }} />
              {shots.length ? `已选 ${shots.length} 张截图` : '明细截图（可选）'}
            </label>
            <button className="btn btn-lg" disabled={!file || busy} onClick={preview}>{busy ? 'AI 识别与校验中…' : '识别清单'}</button>
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

      {err && <div className="alert alert-err mt-12">{err}</div>}
      {message && <div className="alert alert-ok mt-12">{message}</div>}
      {draftId && (
        <div className="mt-12">
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
