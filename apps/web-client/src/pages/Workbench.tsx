import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { downloadOrShareFile } from '../lib/file-actions';
import ExcelUploadCard from '../components/ExcelUploadCard';
import PriceReferenceNote from '../components/PriceReferenceNote';

export default function Workbench() {
  const [tpl, setTpl] = useState<any>(null);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  // 图片资料（M5/M6）
  const [imgList, setImgList] = useState<any[]>([]);
  const [imgFiles, setImgFiles] = useState<File[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgMsg, setImgMsg] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // M6：补传关联的报价单（done 订单下拉）
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [pickQuote, setPickQuote] = useState('');
  // 行级关联：补传截图选择的明细行 + 随清单上传时每张截图的行号
  const [pickRow, setPickRow] = useState('');
  const [rowOptions, setRowOptions] = useState<{ row_no: number; label: string }[]>([]);
  useEffect(() => {
    api.get('/api/client/template/current').then(r => setTpl(r.data)).catch(() => {});
    loadImages();
    // done 报价单下拉（补传截图时关联）
    api.get('/api/client/orders').then(r => setMyOrders(r.data || [])).catch(() => {});
  }, []);

  const loadImages = async () => {
    try {
      const r = await api.get('/api/client/images');
      const list: any[] = r.data || [];
      setImgList(list);
      // 逐张鉴权拉取缩略图（<img src> 无法带 Bearer token）
      const map: Record<string, string> = {};
      await Promise.all(list.map(async (img) => {
        try {
          const res = await api.get(`/api/client/images/${img.id}/file`, { responseType: 'blob' });
          map[img.id] = URL.createObjectURL(new Blob([res.data as any], { type: img.mime_type }));
        } catch { /* 单张失败不影响整体 */ }
      }));
      setThumbs(map);
    } catch { /* 未登录等场景静默 */ }
  };

  const onImgPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picks = Array.from(e.target.files || []);
    if (picks.length > 9) { setImgErr('一次最多选择 9 张图片'); return; }
    setImgErr(null); setImgMsg(null);
    setImgFiles(picks);
  };

  /** 补传：切换关联报价单时拉取其明细行，供选择截图对应的行 */
  const onPickQuote = async (v: string) => {
    setPickQuote(v); setPickRow(''); setRowOptions([]);
    if (!v) return;
    try {
      const r = await api.get(`/api/client/orders/${v}/rows`);
      setRowOptions((r.data || []).map((it: any) => ({
        row_no: it.row_no,
        label: `行 ${it.row_no}${it.carton_no ? ` · 箱号 ${it.carton_no}` : ''}${it.product_cn ? ` · ${it.product_cn}` : ''}`
      })));
    } catch { /* 拉取失败则不提供行选择 */ }
  };

  const doImgUpload = async () => {
    if (imgFiles.length === 0) return;
    setImgLoading(true); setImgErr(null); setImgMsg(null);
    try {
      const fd = new FormData();
      imgFiles.forEach(f => fd.append('files', f));
      if (pickQuote) fd.append('quote_id', pickQuote);
      if (pickQuote && pickRow) fd.append('row_no', pickRow);
      const r = await api.post('/api/client/images', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000
      });
      setImgMsg(`✅ 已上传 ${r.data.count} 张截图${pickQuote ? `，已关联 ${pickRow ? `行 ${pickRow}` : '整单'}，运营端订单详情已可见` : ''}`);
      setImgFiles([]);
      await loadImages();
      setTimeout(() => setImgMsg(null), 4000);
    } catch (e: any) {
      setImgErr(getApiErrorMessage(e, '上传失败'));
    } finally { setImgLoading(false); }
  };

  const handleDownload = async () => {
    setDlLoading(true); setDlMsg(null);
    try {
      const r = await api.get('/api/client/template/2.0/download', { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data as any]), '巴西整柜装箱清单_模板_v2.0.xlsx');
      setDlMsg('✅ 下载完成'); setTimeout(() => setDlMsg(null), 3000);
    } catch (e: any) {
      setDlMsg('❌ ' + getApiErrorMessage(e, '下载失败'));
    } finally { setDlLoading(false); }
  };

  return (
    <>
      <div className="page-title">
        <h1>工作台</h1>
        <span className="muted text-sm">下载模板或上传现有清单 → 识别核对 → 创建报价</span>
      </div>

      {/* 模板卡 */}
      <div className="card">
        <div className="card-title">
          <h3>📄 当前模板</h3>
          {tpl && <span className="status-tag status-uploaded">v{tpl.version_no} · active</span>}
        </div>
        {tpl ? (
          <div className="col-gap">
            <div className="row gap-md">
              <strong>版本 v{tpl.version_no}</strong>
              <span className="muted text-sm">更新于 {tpl.updated_at?.slice(0, 19).replace('T', ' ')}</span>
            </div>
            <p className="muted text-sm" style={{ margin: 0 }}>{tpl.description}</p>
            <p className="muted text-sm" style={{ margin: 0 }}>
              数据起始行 Row{tpl.data_start_row} · 共 {tpl.field_count} 列 · 最多 {tpl.max_rows} 行
            </p>
            <div className="row gap-md mt-8">
              <button className="btn" disabled={dlLoading} onClick={handleDownload}>
                {dlLoading ? '下载中…' : '📥 下载模板'}
              </button>
              {dlMsg && <span className={dlMsg.startsWith('❌') ? 'err-msg' : 'ok-msg'}>{dlMsg}</span>}
            </div>
          </div>
        ) : <p className="muted">加载中…</p>}
      </div>

      <ExcelUploadCard onConfirmed={loadImages} />

      {/* 明细截图补传卡（M6） */}
      <div className="card">
        <div className="card-title">
          <h3>🖼 明细截图 · 补传</h3>
          <span className="muted text-sm">为已生成参考价的报价单补传 Excel 明细截图 · 单张 ≤10MB · 一次最多 9 张</span>
        </div>
        <div className="row gap-md mt-8" style={{ flexWrap: 'wrap' }}>
          <select
            className="form-input"
            style={{ width: 220 }}
            value={pickQuote}
            onChange={e => onPickQuote(e.target.value)}
          >
            <option value="">不关联报价单</option>
            {myOrders.map(o => (
              <option key={o.id} value={o.id}>{o.quote_no}</option>
            ))}
          </select>
          <select
            className="form-input"
            style={{ width: 260 }}
            value={pickRow}
            onChange={e => setPickRow(e.target.value)}
            disabled={!pickQuote}
            title={pickQuote ? '选择截图对应的明细行' : '先选择报价单才能选择明细行'}
          >
            <option value="">{pickQuote ? '整单截图（不对应具体行）' : '对应明细行（可选）'}</option>
            {rowOptions.map(o => (
              <option key={o.row_no} value={o.row_no}>{o.label}</option>
            ))}
          </select>
          <label className="file-pick-label">
            <input type="file" accept="image/*" multiple onChange={onImgPick} />
            {imgFiles.length > 0 ? `✓ 已选 ${imgFiles.length} 张截图` : '选择截图（可多选）'}
          </label>
          <button className="btn" disabled={imgFiles.length === 0 || imgLoading} onClick={doImgUpload}>
            {imgLoading ? '上传中…' : '📤 上传截图'}
          </button>
          {imgMsg && <span className="ok-msg text-sm">{imgMsg}</span>}
          {imgErr && <span className="err-msg text-sm">❌ {imgErr}</span>}
        </div>

        {imgList.length > 0 && (
          <div className="img-grid mt-12">
            {imgList.map((img) => (
              <div key={img.id} className="img-thumb" title={img.quote_no ? `关联 ${img.quote_no}${img.row_no ? ` · 行 ${img.row_no}` : ''}` : img.file_name}>
                {thumbs[img.id]
                  ? <img src={thumbs[img.id]} alt={img.file_name} />
                  : <span className="muted text-sm">加载中…</span>}
                <span className="img-name">{img.file_name}</span>
                <span className="img-meta">{img.quote_no ? `关联 ${img.quote_no}${img.row_no ? ` · 行 ${img.row_no}` : ''}` : '未关联报价单'}</span>
              </div>
            ))}
          </div>
        )}
        {imgList.length === 0 && (
          <p className="muted text-sm mt-12" style={{ margin: '12px 0 0' }}>暂无截图，上传后将展示在这里。</p>
        )}
      </div>

      {/* 流程说明 */}
      <div className="card">
        <div className="card-title">
          <h3>📖 流程</h3>
        </div>
        <div className="col-gap text-sm muted" style={{ lineHeight: 1.8 }}>
          <div>① <strong>下载模板</strong> → 按列名填写装箱清单</div>
          <div>② <strong>上传并核对 Excel</strong> → 确认总件数、金额和 CBM 后创建报价，进入核算队列</div>
          <div>③ <strong>按费率表核算</strong> → 国际海运费单独列示，DDP 总价包含税费及综合运营费用</div>
          <div>④ <strong>参考DDP预估</strong> → 在「我的报价」查看 BRL 参考预估，逐项可核对，不构成最终报价</div>
        </div>
        <PriceReferenceNote compact className="mt-12" />
      </div>
    </>
  );
}
