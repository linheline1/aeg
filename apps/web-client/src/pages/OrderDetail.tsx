import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
const ShipmentRouteMap = lazy(() => import('../components/ShipmentRouteMap').then(module => ({ default: module.ShipmentRouteMap })));
import type { TFunction } from 'i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { downloadOrShareFile } from '../lib/file-actions';
import PriceReferenceNote from '../components/PriceReferenceNote';

interface FeeItem { code: string; name: string; amount: number; note?: string; }
interface PricingBreakdown {
  currency: string;
  fx_rate?: number;
  items: FeeItem[];
  total: number;
  /** 以下字段接口按需返回，客户端做兼容处理 */
  is_reference?: boolean;
  merchandise_brl?: number;
  sales_markup_rate?: number;
  sales_markup_brl?: number;
  tax_base_brl?: number;
  sales_tax_rate?: number;
  profit_brl?: number;
  di_brl?: number;
  di_total_brl?: number;
}
interface ClientOrderDetail {
  id: string; quote_no: string; status: string; template_version: string;
  input_file_name: string | null;
  total_rows?: number | null; valid_rows?: number | null;
  total_cbm?: number | null; total_gw_kg?: number | null;
  total_amount_brl?: number | null; total_amount_usd?: number | null;
  /** 金额是否为参考预估（接口未返回时按参考处理） */
  price_is_reference?: boolean;
  pricing_processing?: boolean;
  pricing_failed?: boolean;
  pricing_breakdown?: PricingBreakdown | null;
  di_analysis?: {
    status: string; stage?: string; progress?: number; auto?: boolean;
    started_at?: string; completed_at?: string; error_message?: string;
    parameters?: Record<string, any>;
    items?: any[];
    totals?: Record<string, number>;
  } | null;
  line_items?: any[] | null;
  deal_status?: 'open' | 'won' | 'lost' | null;
  /** M7：国际物流（运营维护，客户端只读） */
  shipment?: {
    vessel?: string | null; voyage?: string | null; bill_no?: string | null; container_no?: string | null;
    mmsi?: string | null;
    pol?: string | null; pod?: string | null; etd?: string | null; eta?: string | null; remark?: string | null;
    events?: { id: string; stage: string; note?: string | null; happened_at: string; lat?: number | null; lng?: number | null; position_source?: 'manual' | 'port' | 'estimated' | null }[];
  } | null;
  ais_position?: { latitude: number; longitude: number; observed_at: string; speed_knots?: number | null } | null;
  ais_track?: { latitude: number; longitude: number; observed_at: string }[];
  /** M7：当前节点位置（服务端解析） */
  node_position?: { latitude: number; longitude: number; stage: string; happened_at: string; source: 'manual' | 'port' } | null;
  /** M9：开票 CNPJ（客户在订单上选择的开票抬头快照） */
  invoice_cnpj?: { id: string; cnpj: string; company_name: string; ie?: string | null } | null;
  created_at: string; updated_at: string;
}

/** Excel 明细字段（是否有对应翻译 key） */
const FIELD_KEYS = new Set([
  'row_no', 'carton_no', 'sku', 'product_cn', 'product_en', 'hs_code', 'cartons', 'pcs_per_carton',
  'total_pcs', 'nw_per_carton', 'gw_per_carton', 'total_gw', 'length_cm', 'width_cm', 'height_cm',
  'unit_cbm', 'unit_price', 'material', 'destination', 'remark'
]);

const fmtBRL = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (n: number) =>
  'US$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');
const fmtNum = (v: any) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v));

/** 客户端展示的费用项统一加“参考”口径（后端返回值原样展示，不做任何重算） */
const FEE_REF_LABELS: Record<string, string> = {
  OCEAN_FREIGHT: 'ocean', PORT_FEE_ORIGIN: 'port', AI_DI: 'importTax', DI: 'importTax',
  BR_IMPORT_DI: 'importTax', SALES_TAX: 'salesTax', BR_SALES_TAX: 'salesTax',
  ICMS: 'salesTax', PROFIT: 'service', BR_PROFIT: 'service',
  PROFIT_REFERENCE: 'service', REFERENCE_PROFIT: 'service', BR_CLEARANCE: 'clearance',
  BR_LOCAL_TRUCKING: 'localTrucking'
};
/** 兼容后端新增/历史费用编码：先按编码，再按名称关键字识别 */
const feeRefLabel = (item: FeeItem, translate: TFunction, isPt: boolean) => {
  const label = FEE_REF_LABELS[(item.code || '').toUpperCase()];
  if (label) return translate(`orderDetail.fee.${label}`);
  const name = item.name || '';
  if (/海运费|海运|ocean freight/i.test(name)) return translate('orderDetail.fee.ocean');
  if (/港杂|起运港|port fee/i.test(name)) return translate('orderDetail.fee.port');
  if (/拖车|trucking|drayage/i.test(name)) return translate('orderDetail.fee.localTrucking');
  if (/利润|服务费|profit|service fee/i.test(name)) return translate('orderDetail.fee.service');
  if (/AI\s*DI|(^|[_\s(（])DI([_\s)）]|$)|进口税|import tax/i.test(name)) return translate('orderDetail.fee.importTax');
  if (/销售税|TAX|ICMS/i.test(name)) return translate('orderDetail.fee.salesTax');
  return isPt ? `${translate('orderDetail.fee.other')} (${item.code || name})` : `${name}${translate('orderDetail.referenceSuffix')}`;
};
/** 费用说明沿用后端文本，但不得出现承诺性措辞 */
const refFeeNote = (note: string | undefined, isPt: boolean, fallback: string, referencePrice: string) =>
  note ? (isPt && /[\u3400-\u9fff]/.test(note) ? fallback : note.replace(/一口价|锁价/g, referencePrice)) : null;


export default function OrderDetail() {
  const { t, i18n } = useTranslation();
  const isPt = i18n.resolvedLanguage?.startsWith('pt') ?? false;
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<ClientOrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 该报价单的明细截图（行级对应，与运营端一致）
  const [shots, setShots] = useState<any[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  // M8：交付文件（运营上传的放行截图 / 发票 PDF）
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  // M9：开票 CNPJ（我的抬头列表 + 订单绑定）
  const [cnpjs, setCnpjs] = useState<any[]>([]);
  const [cnpjBusy, setCnpjBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let loading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await api.get(`/api/client/orders/${id}`);
        if (cancelled) return;
        setD(response.data);
        setErr(null);
        const processing = ['analyzing', 'calculating'].includes(response.data.di_analysis?.status);
        timer = setTimeout(() => { if (document.visibilityState === 'visible') load(); }, processing ? 3000 : 30000);
      } catch (e: any) {
        if (!cancelled) {
          setErr(getApiErrorMessage(e, t('orderDetail.loadError')));
          timer = setTimeout(() => { if (document.visibilityState === 'visible') load(); }, 30000);
        }
      } finally { loading = false; }
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') { if (timer) clearTimeout(timer); load(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [id, t]);

  // 拉取该报价单的截图（鉴权 blob → objectURL）
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const r = await api.get('/api/client/images');
        const rows: any[] = (r.data || []).filter((i: any) => i.quote_id === id);
        if (cancelled) return;
        setShots(rows);
        const map: Record<string, string> = {};
        await Promise.all(rows.map(async img => {
          try {
            const f = await api.get(`/api/client/images/${img.id}/file`, { responseType: 'blob' });
            const u = URL.createObjectURL(f.data);
            urls.push(u);
            map[img.id] = u;
          } catch { /* 单张失败忽略 */ }
        }));
        if (!cancelled) setThumbUrls(map);
      } catch { /* 无截图权限或接口异常时静默 */ }
    })();
    return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [id]);

  // M8：拉取交付文件（放行截图 / 发票 PDF），图片预生成 objectURL
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const r = await api.get(`/api/client/orders/${id}/files`);
        const rows: any[] = r.data || [];
        if (cancelled) return;
        setOrderFiles(rows);
        const map: Record<string, string> = {};
        await Promise.all(rows.filter(f => /^image\//.test(f.mime_type)).map(async f => {
          try {
            const res = await api.get(`/api/client/files/${f.id}/file`, { responseType: 'blob' });
            const u = URL.createObjectURL(res.data);
            urls.push(u);
            map[f.id] = u;
          } catch { /* 单个失败忽略 */ }
        }));
        if (!cancelled) setFileUrls(map);
      } catch { /* 接口异常时静默（无交付文件） */ }
    })();
    return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [id]);

  // M9：拉取我的开票 CNPJ 列表
  useEffect(() => {
    api.get('/api/client/cnpjs').then(r => setCnpjs(r.data || [])).catch(() => {});
  }, []);

  // M9：为订单选择/更换开票 CNPJ（空值 = 暂不指定）
  const bindCnpj = async (cnpjId: string) => {
    setCnpjBusy(true);
    try {
      const r = await api.patch(`/api/client/orders/${id}/invoice-cnpj`, { cnpj_id: cnpjId || null });
      setD(prev => prev ? { ...prev, invoice_cnpj: r.data.invoice_cnpj } : prev);
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('orderDetail.saveError')));
    } finally { setCnpjBusy(false); }
  };

  // M8：下载交付文件（发票 PDF 等）
  const doFileDownload = async (f: any) => {
    try {
      const r = await api.get(`/api/client/files/${f.id}/file`, { responseType: 'blob' });
      await downloadOrShareFile(r.data, f.file_name);
    } catch { alert(t('orderDetail.downloadError')); }
  };

  if (err) {
    return (
      <>
        <div className="page-head"><h1>{t('orderDetail.title')}</h1></div>
        <div className="alert alert-err">❌ {err}</div>
        <Link className="btn btn-ghost" to="/orders">← {t('orderDetail.back')}</Link>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <div className="page-head"><h1>{t('orderDetail.title')}</h1></div>
        <div className="card"><p className="muted">{t('orderDetail.loading')}</p></div>
      </>
    );
  }

  const liKeys: string[] = (d.line_items?.[0] && typeof d.line_items[0] === 'object')
    ? Object.keys(d.line_items[0]).filter(k => k !== 'row_no')
    : [];

  // M7：物流节点（正序）与当前阶段
  const shipEvents = [...(d.shipment?.events || [])].sort((a: any, b: any) =>
    String(a.happened_at).localeCompare(String(b.happened_at)));
  const curStage = shipEvents.length ? shipEvents[shipEvents.length - 1].stage : null;

  // 行级图片映射与未关联截图
  const rowImages = (rowNo: any) => shots.filter(s => s.row_no != null && Number(s.row_no) === Number(rowNo));
  const unlinked = shots.filter(s => s.row_no == null);

  return (
    <>
      <div className="page-head">
        <h1>{t('orderDetail.title')} · {d.quote_no}</h1>
        <p className="sub">
          <Link to="/orders" style={{ color: 'var(--primary)' }}>← {t('orderDetail.back')}</Link>
          {'　'}{t('orderDetail.file')}: {d.input_file_name || '—'} · {t('orderDetail.updatedAt')} {fmtTime(d.updated_at || d.created_at)}
        </p>
      </div>

      <div className="quote-note">
        <b>{t('orderDetail.costNoteTitle')}</b>
        <span>{t('orderDetail.costNote')}</span>
      </div>

      <PriceReferenceNote className="price-ref-note-mb" />


      {/* 金额汇总 */}
      <div className="card">
        <div className="card-title">
          <h3>💰 {t('orderDetail.amountTitle')}</h3>
          <span className={`status-tag ${d.pricing_processing ? 'status-pending_fee' : `status-${d.status}`}`}>
            {d.pricing_processing ? t('orderDetail.status.computing') : t(`orderDetail.status.${d.status}`, { defaultValue: d.status })}
          </span>
        </div>
        {d.pricing_processing ? (
          <div className="calc-loading" role="status" aria-live="polite">
            <span className="calc-spinner" aria-hidden="true" />
            <div>
              <strong>{t('orderDetail.calculating')}</strong>
              <span className="text-sm muted">{t('orderDetail.calculatingHint')}</span>
            </div>
          </div>
        ) : d.pricing_failed ? (
          <div className="alert alert-err">{t('orderDetail.calculationFailed')}</div>
        ) : (
          <>
            <div className="quote-amt-block">
              <div className="quote-amt-label">{t('orderDetail.ddpTotal')}</div>
              <div className="quote-amt">
                {d.total_amount_brl != null ? fmtBRL(d.total_amount_brl) : '—'}
                {d.total_amount_brl != null && <span className="ref-tag">{t('orderDetail.reference')}</span>}
              </div>
            </div>
            <div className="quote-usd-row">
              <span className="quote-usd-label">{t('orderDetail.oceanFreight')}</span>
              <span className="quote-usd">{d.total_amount_usd != null ? fmtUSD(d.total_amount_usd) : '—'}</span>
            </div>
          </>
        )}
        <div className="muted text-sm" style={{ marginTop: 8 }}>
          {t('orderDetail.rows', { count: d.valid_rows ?? d.total_rows ?? 0 })}
          {d.total_cbm != null ? ` · ${t('orderDetail.volume')} ${Number(d.total_cbm).toLocaleString('pt-BR')} CBM` : ''}
          {d.total_gw_kg != null ? ` · ${t('orderDetail.weight')} ${Number(d.total_gw_kg).toLocaleString('pt-BR')} kg` : ''}
          {' · '}{t('orderDetail.template')} v{d.template_version}
        </div>
      </div>

      {/* M7 国际物流：成交后展示运营维护的动态时间线，历史物流订单保持可见 */}
      {(d.shipment || d.deal_status === 'won') && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🚢 {t('orderDetail.shipping')}</h3>
            {curStage ? (
              <span className="ship-stage-chip">{t('orderDetail.current')}: {t(`orderDetail.shipStage.${curStage}`, { defaultValue: curStage })}</span>
            ) : <span className="muted text-sm">{t('orderDetail.awaitingOps')}</span>}
          </div>

          {d.shipment ? (
            <>
              <Suspense fallback={<div className="shipment-route-map-empty">{i18n.resolvedLanguage?.startsWith('pt') ? 'Carregando mapa…' : '地图加载中…'}</div>}>
                <ShipmentRouteMap pol={d.shipment.pol} pod={d.shipment.pod} position={d.ais_position} track={d.ais_track} language={i18n.resolvedLanguage || 'zh'}
                  nodes={shipEvents.filter(ev => ev.lat != null && ev.lng != null)
                    .map(ev => ({ id: ev.id, label: t(`orderDetail.shipStage.${ev.stage}`, { defaultValue: ev.stage }), happened_at: ev.happened_at, latitude: ev.lat!, longitude: ev.lng!, estimated: ev.position_source === 'estimated' }))} />
              </Suspense>
              <div className="ship-grid">
                <div><span className="ship-k">{t('orderDetail.vessel')}</span><span className="ship-v">{d.shipment.vessel || '—'}</span></div>
                <div><span className="ship-k">{t('orderDetail.voyage')}</span><span className="ship-v">{d.shipment.voyage || '—'}</span></div>
                <div><span className="ship-k">{t('orderDetail.billNo')}</span><span className="ship-v">{d.shipment.bill_no || '—'}</span></div>
                <div><span className="ship-k">{t('orderDetail.containerNo')}</span><span className="ship-v">{d.shipment.container_no || '—'}</span></div>
                <div><span className="ship-k">{t('orderDetail.route')}</span><span className="ship-v">
                  {[d.shipment.pol, d.shipment.pod].filter(Boolean).join(' → ') || '—'}
                </span></div>
                <div><span className="ship-k">{t('orderDetail.schedule')}</span><span className="ship-v">
                  {d.shipment.etd || d.shipment.eta
                    ? `${d.shipment.etd ? `${t('orderDetail.departure')} ${d.shipment.etd.slice(0, 10)}` : ''}${d.shipment.etd && d.shipment.eta ? ' · ' : ''}${d.shipment.eta ? `${t('orderDetail.arrival')} ${d.shipment.eta.slice(0, 10)}` : ''}`
                    : '—'}
                </span></div>
              </div>

              {d.shipment.remark && (
                <p className="muted text-sm" style={{ margin: '10px 0 0' }}>📝 {d.shipment.remark}</p>
              )}
            </>
          ) : (
            <div className="alert alert-warn">{t('orderDetail.shippingPending')}</div>
          )}

          {d.shipment && shipEvents.length === 0 && (
            <p className="muted text-sm" style={{ marginTop: 12 }}>{t('orderDetail.shippingInfoReady')}</p>
          )}
          {shipEvents.length > 0 && (
            <div className="ship-timeline">
              {shipEvents.map((ev, i) => (
                <div className={`ship-tl-item${i === shipEvents.length - 1 ? ' cur' : ''}`} key={ev.id}>
                  <span className="ship-tl-dot" />
                  <div className="ship-tl-body">
                    <div className="ship-tl-head">
                      <strong>{t(`orderDetail.shipStage.${ev.stage}`, { defaultValue: ev.stage })}</strong>
                      <span className="muted text-sm">{ev.happened_at.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    {ev.note && <div className="muted text-sm" style={{ marginTop: 2 }}>{ev.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* M9 开票信息：选择本订单的巴西发票（NF）抬头 */}
      {d.status === 'done' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🏢 {t('orderDetail.invoiceTitle')}</h3>
            <span className="muted text-sm">{t('orderDetail.invoiceHint')}</span>
          </div>
          <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
            <select className="form-input" style={{ minWidth: 0, maxWidth: '100%', width: 320 }} value={d.invoice_cnpj?.id || ''}
              disabled={cnpjBusy || cnpjs.length === 0} onChange={e => bindCnpj(e.target.value)}>
              <option value="">{cnpjs.length === 0 ? t('orderDetail.noCnpj') : t('orderDetail.noSelection')}</option>
              {cnpjs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name} · CNPJ: {c.cnpj} · IE: {c.ie || t('cnpj.notRegistered')}{c.is_default ? ` (${t('cnpj.default')})` : ''}
                </option>
              ))}
            </select>
            {d.invoice_cnpj && (
              <span className="muted text-sm" style={{ alignSelf: 'center' }}>
                {t('orderDetail.current')}: {d.invoice_cnpj.company_name} · CNPJ: <strong>{d.invoice_cnpj.cnpj}</strong> · IE: <strong>{d.invoice_cnpj.ie || t('cnpj.notRegistered')}</strong>
              </span>
            )}
          </div>
          {cnpjs.length === 0 && (
            <p className="muted text-sm" style={{ margin: '10px 0 0' }}>
              {t('orderDetail.noInvoiceHint')}
            </p>
          )}
        </div>
      )}

      {/* M8 交付文件：放行截图 / 发票 PDF（运营上传，客户查看/下载） */}
      {orderFiles.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>📎 {t('orderDetail.deliveryFiles')}</h3>
            <span className="muted text-sm">{t('orderDetail.deliveryHint')}</span>
          </div>

          {/* 放行截图（图片缩略图，点击放大） */}
          {orderFiles.filter(f => f.kind === 'clearance_shot').length > 0 && (
            <>
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>🖼 {t('orderDetail.clearanceImage')}</p>
              <div className="img-grid">
                {orderFiles.filter(f => f.kind === 'clearance_shot').map(f => (
                  <div className="img-thumb" key={f.id} title={f.file_name}
                    onClick={() => fileUrls[f.id] && setPreview({ url: fileUrls[f.id], name: f.file_name })}>
                    {fileUrls[f.id]
                      ? <img src={fileUrls[f.id]} alt={f.file_name} />
                      : <span className="muted text-sm">{t('orderDetail.loading')}</span>}
                    <span className="img-name">{f.file_name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 发票 PDF / 其他文件（下载行） */}
          {orderFiles.filter(f => f.kind !== 'clearance_shot').length > 0 && (
            <>
              <p className="muted text-sm" style={{ margin: '14px 0 8px' }}>🧾 {t('orderDetail.invoicesAndFiles')}</p>
              <div className="order-file-list">
                {orderFiles.filter(f => f.kind !== 'clearance_shot').map(f => (
                  <div className="order-file-row" key={f.id}>
                    <span className="deal-tag deal-open">{f.kind === 'invoice' ? t('orderDetail.invoice') : t('orderDetail.fileKind')}</span>
                    <span className="text-sm" title={f.file_name}
                      style={{ minWidth: 0, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.mime_type === 'application/pdf' ? '📕' : '📄'} {f.file_name}
                    </span>
                    <span className="muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                      {(f.size_bytes / 1024).toFixed(0)} KB · {f.created_at?.slice(0, 10)}
                    </span>
                    {f.note && <span className="muted text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note}</span>}
                    <button className="btn btn-sm" onClick={() => doFileDownload(f)}>⬇ {t('orderDetail.download')}</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 参考 DDP 费用分项 */}
      {d.pricing_breakdown && d.pricing_breakdown.items?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🧮 {t('orderDetail.breakdown')}</h3>
            <span className="muted text-sm">
              {d.pricing_breakdown.fx_rate ? `${t('orderDetail.fxRate')} USD→BRL ${d.pricing_breakdown.fx_rate}` : ''}
            </span>
          </div>
          <p className="muted text-sm" style={{ margin: '0 0 10px' }}>
            {t('orderDetail.breakdownHint')}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('orderDetail.feeItem')}</th><th className="amt">{t('orderDetail.amountBrl')}</th><th>{t('orderDetail.note')}</th></tr>
              </thead>
              <tbody>
                {d.pricing_breakdown.items.map(it => (
                  <tr key={it.code}>
                    <td><strong>{feeRefLabel(it, t, isPt)}</strong></td>
                    <td className="amt">{fmtBRL(it.amount)}</td>
                    <td className="muted">{refFeeNote(it.note, isPt, t('orderDetail.serverNote'), t('orderDetail.referencePrice')) || '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>{t('orderDetail.referenceTotal')}</strong></td>
                  <td className="amt"><strong>{fmtBRL(d.pricing_breakdown.total)}</strong></td>
                  <td className="muted">{t('orderDetail.referenceDisclaimer')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 我上传的 Excel 明细 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>📋 {t('orderDetail.packingList')}</h3>
          <span className="muted text-sm">{t('orderDetail.tableSize', { rows: d.line_items?.length || 0, columns: liKeys.length })}</span>
        </div>
        {d.line_items && d.line_items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orderDetail.field.row_no')}</th>
                  {liKeys.map(k => <th key={k}>{FIELD_KEYS.has(k) ? t(`orderDetail.field.${k}`) : k}</th>)}
                  <th>🖼 {t('orderDetail.images')}</th>
                </tr>
              </thead>
              <tbody>
                {d.line_items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="muted">{it.row_no}</td>
                    {liKeys.map(k => <td key={k}>{fmtNum(it[k])}</td>)}
                    <td>
                      <div className="shot-strip">
                        {rowImages(it.row_no).map(img => (
                          <img
                            key={img.id}
                            className="shot-thumb"
                            src={thumbUrls[img.id]}
                            alt={img.file_name}
                            title={img.file_name}
                            onClick={() => thumbUrls[img.id] && setPreview({ url: thumbUrls[img.id], name: img.file_name })}
                          />
                        ))}
                        {rowImages(it.row_no).length === 0 && <span className="muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('orderDetail.noLines')}</p>
        )}

        {/* 未关联到具体行的截图 */}
        {unlinked.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted text-sm" style={{ marginBottom: 8 }}>
              📎 {t('orderDetail.unlinkedImages', { count: unlinked.length })}
            </div>
            <div className="shot-strip">
              {unlinked.map(img => (
                <img
                  key={img.id}
                  className="shot-thumb"
                  src={thumbUrls[img.id]}
                  alt={img.file_name}
                  title={img.file_name}
                  onClick={() => thumbUrls[img.id] && setPreview({ url: thumbUrls[img.id], name: img.file_name })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 图片放大预览 */}
      {preview && (
        <div className="shot-preview" onClick={() => setPreview(null)}>
          <img src={preview.url} alt={preview.name} />
          <div className="shot-preview-name">{preview.name} ({t('orderDetail.closePreview')})</div>
        </div>
      )}
    </>
  );
}
