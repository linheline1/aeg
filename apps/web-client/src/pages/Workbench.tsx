import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { downloadOrShareFile } from '../lib/file-actions';
import ExcelUploadCard from '../components/ExcelUploadCard';
import PriceReferenceNote from '../components/PriceReferenceNote';
import { useTranslation } from 'react-i18next';

export default function Workbench() {
  const { t } = useTranslation();
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
    if (picks.length > 9) { setImgErr(t('workbench.maxImages')); return; }
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
        label: t('workbench.rowLabel', { row: it.row_no, carton: it.carton_no ? ` · ${t('workbench.carton')} ${it.carton_no}` : '', product: it.product_cn ? ` · ${it.product_cn}` : '' })
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
      setImgMsg(t('workbench.uploadSuccess', { count: r.data.count, relation: pickQuote ? t(pickRow ? 'workbench.relatedRow' : 'workbench.relatedOrder', { row: pickRow }) : '' }));
      setImgFiles([]);
      await loadImages();
      setTimeout(() => setImgMsg(null), 4000);
    } catch (e: any) {
      setImgErr(getApiErrorMessage(e, t('workbench.uploadError')));
    } finally { setImgLoading(false); }
  };

  const handleDownload = async () => {
    setDlLoading(true); setDlMsg(null);
    try {
      const r = await api.get('/api/client/template/2.0/download', { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data as any]), `${t('workbench.templateFile')}_v2.0.xlsx`);
      setDlMsg(t('workbench.downloadSuccess')); setTimeout(() => setDlMsg(null), 3000);
    } catch (e: any) {
      setDlMsg('❌ ' + getApiErrorMessage(e, t('workbench.downloadError')));
    } finally { setDlLoading(false); }
  };

  return (
    <>
      <div className="page-title">
        <h1>{t('workbench.title')}</h1>
        <span className="muted text-sm">{t('workbench.subtitle')}</span>
      </div>

      {/* 模板卡 */}
      <div className="card">
        <div className="card-title">
          <h3>📄 {t('workbench.currentTemplate')}</h3>
          {tpl && <span className="status-tag status-uploaded">v{tpl.version_no} · active</span>}
        </div>
        {tpl ? (
          <div className="col-gap">
            <div className="row gap-md">
              <strong>{t('workbench.version', { version: tpl.version_no })}</strong>
              <span className="muted text-sm">{t('workbench.updatedAt', { time: tpl.updated_at?.slice(0, 19).replace('T', ' ') })}</span>
            </div>
            <p className="muted text-sm" style={{ margin: 0 }}>{tpl.description}</p>
            <p className="muted text-sm" style={{ margin: 0 }}>
              {t('workbench.templateMeta', { row: tpl.data_start_row, fields: tpl.field_count, max: tpl.max_rows })}
            </p>
            <div className="row gap-md mt-8">
              <button className="btn" disabled={dlLoading} onClick={handleDownload}>
                {dlLoading ? t('workbench.downloading') : `📥 ${t('workbench.downloadTemplate')}`}
              </button>
              {dlMsg && <span className={dlMsg.startsWith('❌') ? 'err-msg' : 'ok-msg'}>{dlMsg}</span>}
            </div>
          </div>
        ) : <p className="muted">{t('common.loading')}</p>}
      </div>

      <ExcelUploadCard onConfirmed={loadImages} />

      {/* 明细截图补传卡（M6） */}
      <div className="card">
        <div className="card-title">
          <h3>🖼 {t('workbench.supplementTitle')}</h3>
          <span className="muted text-sm">{t('workbench.supplementHint')}</span>
        </div>
        <div className="row gap-md mt-8" style={{ flexWrap: 'wrap' }}>
          <select
            className="form-input"
            style={{ width: 220 }}
            value={pickQuote}
            onChange={e => onPickQuote(e.target.value)}
          >
            <option value="">{t('workbench.noQuote')}</option>
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
            title={t(pickQuote ? 'workbench.selectRowTitle' : 'workbench.selectQuoteFirst')}
          >
            <option value="">{t(pickQuote ? 'workbench.wholeOrder' : 'workbench.optionalRow')}</option>
            {rowOptions.map(o => (
              <option key={o.row_no} value={o.row_no}>{o.label}</option>
            ))}
          </select>
          <label className="file-pick-label">
            <input type="file" accept="image/*" multiple onChange={onImgPick} />
            {imgFiles.length > 0 ? t('workbench.selectedImages', { count: imgFiles.length }) : t('workbench.selectImages')}
          </label>
          <button className="btn" disabled={imgFiles.length === 0 || imgLoading} onClick={doImgUpload}>
            {imgLoading ? t('workbench.uploading') : `📤 ${t('workbench.uploadImages')}`}
          </button>
          {imgMsg && <span className="ok-msg text-sm">{imgMsg}</span>}
          {imgErr && <span className="err-msg text-sm">❌ {imgErr}</span>}
        </div>

        {imgList.length > 0 && (
          <div className="img-grid mt-12">
            {imgList.map((img) => (
              <div key={img.id} className="img-thumb" title={img.quote_no ? t('workbench.imageRelation', { quote: img.quote_no, row: img.row_no ? ` · ${t('workbench.row')} ${img.row_no}` : '' }) : img.file_name}>
                {thumbs[img.id]
                  ? <img src={thumbs[img.id]} alt={img.file_name} />
                  : <span className="muted text-sm">{t('common.loading')}</span>}
                <span className="img-name">{img.file_name}</span>
                <span className="img-meta">{img.quote_no ? t('workbench.imageRelation', { quote: img.quote_no, row: img.row_no ? ` · ${t('workbench.row')} ${img.row_no}` : '' }) : t('workbench.unlinked')}</span>
              </div>
            ))}
          </div>
        )}
        {imgList.length === 0 && (
          <p className="muted text-sm mt-12" style={{ margin: '12px 0 0' }}>{t('workbench.noImages')}</p>
        )}
      </div>

      {/* 流程说明 */}
      <div className="card">
        <div className="card-title">
          <h3>📖 {t('workbench.process')}</h3>
        </div>
        <div className="col-gap text-sm muted" style={{ lineHeight: 1.8 }}>
          <div>① <strong>{t('workbench.step1Title')}</strong> → {t('workbench.step1')}</div>
          <div>② <strong>{t('workbench.step2Title')}</strong> → {t('workbench.step2')}</div>
          <div>③ <strong>{t('workbench.step3Title')}</strong> → {t('workbench.step3')}</div>
          <div>④ <strong>{t('workbench.step4Title')}</strong> → {t('workbench.step4')}</div>
        </div>
        <PriceReferenceNote compact className="mt-12" />
      </div>
    </>
  );
}
