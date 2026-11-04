import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
    pol?: string | null; pod?: string | null; etd?: string | null; eta?: string | null; remark?: string | null;
    events?: { id: string; stage: string; note?: string | null; happened_at: string }[];
  } | null;
  /** M9：开票 CNPJ（客户在订单上选择的开票抬头快照） */
  invoice_cnpj?: { id: string; cnpj: string; company_name: string; ie?: string | null } | null;
  created_at: string; updated_at: string;
}

const STATUS_CN: Record<string, string> = {
  done: '参考价已生成', computing: '计算中', pending_fee: '待核算',
  uploaded: '已上传', failed: '失败'
};

/** M7 物流节点阶段（清关环节细化为三节点） */
const SHIP_STAGE_CN: Record<string, string> = {
  booked: '已订舱', loaded: '已装柜', customs_cn: '中国报关', departed: '已开船',
  on_water: '海运途中', arrived: '已到港', customs_br: '巴西清关中',
  duty_paid: '关税已缴', cleared: '清关放行', delivered: '已签收'
};

/** Excel 明细字段中文表头 */
const FIELD_LABELS: Record<string, string> = {
  row_no: '行号', carton_no: '箱号', sku: 'SKU', product_cn: '品名 CN',
  product_en: '品名 EN', hs_code: 'HS Code', cartons: '箱数', pcs_per_carton: '件数/箱',
  total_pcs: '总件数', nw_per_carton: '净重/箱', gw_per_carton: '毛重/箱', total_gw: '总毛重',
  length_cm: '长 cm', width_cm: '宽 cm', height_cm: '高 cm', unit_cbm: '体积 CBM',
  unit_price: '单价 RMB', material: '材质', destination: '目的地', remark: '备注'
};

const fmtBRL = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (n: number) =>
  'US$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');
const fmtNum = (v: any) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v));

/** 客户端展示的费用项统一加“参考”口径（后端返回值原样展示，不做任何重算） */
const FEE_REF_LABELS: Record<string, string> = {
  OCEAN_FREIGHT: '参考海运费',
  PORT_FEE_ORIGIN: '参考港杂费（起运港）',
  AI_DI: '巴西进口税费预估（参考）',
  DI: '巴西进口税费预估（参考）',
  BR_IMPORT_DI: '巴西进口税费预估（参考）',
  SALES_TAX: '销售税务（参考）',
  BR_SALES_TAX: '销售税务（参考）',
  ICMS: '销售税务（参考）',
  PROFIT: '运营服务费用（参考）',
  BR_PROFIT: '运营服务费用（参考）',
  PROFIT_REFERENCE: '运营服务费用（参考）',
  REFERENCE_PROFIT: '运营服务费用（参考）',
  BR_CLEARANCE: '参考巴西清关与税费合计'
};
/** 兼容后端新增/历史费用编码：先按编码，再按名称关键字识别 */
const feeRefLabel = (item: FeeItem) => {
  const label = FEE_REF_LABELS[(item.code || '').toUpperCase()];
  if (label) return label;
  const name = item.name || '';
  if (name.startsWith('参考')) return name;
  if (/海运费|海运/.test(name)) return '参考海运费';
  if (/港杂|起运港/.test(name)) return '参考港杂费（起运港）';
  if (/利润/.test(name)) return '运营服务费用（参考）';
  if (/AI\s*DI|(^|[_\s(（])DI([_\s)）]|$)/i.test(name)) return '巴西进口税费预估（参考）';
  if (/税|TAX|ICMS/i.test(name)) return '销售税务（参考）';
  return `${name}（参考）`;
};
/** 费用说明沿用后端文本，但不得出现承诺性措辞 */
const refFeeNote = (note?: string) =>
  note ? note.replace(/一口价|锁价/g, '参考价') : null;


export default function OrderDetail() {
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await api.get(`/api/client/orders/${id}`);
        if (cancelled) return;
        setD(response.data);
        const processing = ['analyzing', 'calculating'].includes(response.data.di_analysis?.status);
        timer = setTimeout(load, processing ? 2000 : 5000);
      } catch (e: any) {
        if (!cancelled) setErr(getApiErrorMessage(e, '加载失败'));
      }
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id]);

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
      alert(getApiErrorMessage(e, '保存失败'));
    } finally { setCnpjBusy(false); }
  };

  // M8：下载交付文件（发票 PDF 等）
  const doFileDownload = async (f: any) => {
    try {
      const r = await api.get(`/api/client/files/${f.id}/file`, { responseType: 'blob' });
      await downloadOrShareFile(r.data, f.file_name);
    } catch { alert('下载失败，请稍后重试'); }
  };

  if (err) {
    return (
      <>
        <div className="page-head"><h1>报价详情</h1></div>
        <div className="alert alert-err">❌ {err}</div>
        <Link className="btn btn-ghost" to="/orders">← 返回我的报价</Link>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <div className="page-head"><h1>报价详情</h1></div>
        <div className="card"><p className="muted">加载中…</p></div>
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
        <h1>报价详情 · {d.quote_no}</h1>
        <p className="sub">
          <Link to="/orders" style={{ color: 'var(--primary)' }}>← 返回我的报价</Link>
          {'　'}清单文件：{d.input_file_name || '—'} · 更新于 {fmtTime(d.updated_at || d.created_at)}
        </p>
      </div>

      <div className="quote-note">
        <b>费用说明：</b>
        <span>
          US$ 为<b>参考海运费</b>（中国起运港 + 海运段，美元计价）；
          R$ 为 <b>参考DDP 巴西全程总价</b>，包含国际海运费、其他成本、进口税费、销售环节税费及综合运营费用。
          国际海运费单独列示；内部运营成本不拆分展示，所有金额均为参考预估。
        </span>
      </div>

      <PriceReferenceNote className="price-ref-note-mb" />


      {/* 金额汇总 */}
      <div className="card">
        <div className="card-title">
          <h3>💰 参考报价金额</h3>
          <span className={`status-tag ${d.pricing_processing ? 'status-pending_fee' : `status-${d.status}`}`}>
            {d.pricing_processing ? '核算中' : (STATUS_CN[d.status] || d.status)}
          </span>
        </div>
        {d.pricing_processing ? (
          <div className="calc-loading" role="status" aria-live="polite">
            <span className="calc-spinner" aria-hidden="true" />
            <div>
              <strong>正在核算参考 DDP…</strong>
              <span className="text-sm muted">系统正在计算税费、默认海运费和参考总价，本页会自动更新。</span>
            </div>
          </div>
        ) : d.pricing_failed ? (
          <div className="alert alert-err">参考报价自动核算未完成，请联系运营人员处理。</div>
        ) : (
          <>
            <div className="quote-amt-block">
              <div className="quote-amt-label">参考DDP 巴西全程总价</div>
              <div className="quote-amt">
                {d.total_amount_brl != null ? fmtBRL(d.total_amount_brl) : '—'}
                {d.total_amount_brl != null && <span className="ref-tag">参考预估</span>}
              </div>
            </div>
            <div className="quote-usd-row">
              <span className="quote-usd-label">参考海运费（USD）</span>
              <span className="quote-usd">{d.total_amount_usd != null ? fmtUSD(d.total_amount_usd) : '—'}</span>
            </div>
          </>
        )}
        <div className="muted text-sm" style={{ marginTop: 8 }}>
          {d.valid_rows ?? d.total_rows ?? 0} 行明细
          {d.total_cbm != null ? ` · 总体积 ${Number(d.total_cbm).toLocaleString('pt-BR')} CBM` : ''}
          {d.total_gw_kg != null ? ` · 总毛重 ${Number(d.total_gw_kg).toLocaleString('pt-BR')} kg` : ''}
          {' · '}模板 v{d.template_version}
        </div>
      </div>

      {/* M7 国际物流：成交后展示运营维护的动态时间线，历史物流订单保持可见 */}
      {(d.shipment || d.deal_status === 'won') && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🚢 国际物流</h3>
            {curStage ? (
              <span className="ship-stage-chip">当前：{SHIP_STAGE_CN[curStage] || curStage}</span>
            ) : <span className="muted text-sm">等待运营安排</span>}
          </div>

          {d.shipment ? (
            <>
              <div className="ship-grid">
                <div><span className="ship-k">船名</span><span className="ship-v">{d.shipment.vessel || '—'}</span></div>
                <div><span className="ship-k">航次</span><span className="ship-v">{d.shipment.voyage || '—'}</span></div>
                <div><span className="ship-k">提单号</span><span className="ship-v">{d.shipment.bill_no || '—'}</span></div>
                <div><span className="ship-k">柜号</span><span className="ship-v">{d.shipment.container_no || '—'}</span></div>
                <div><span className="ship-k">航线</span><span className="ship-v">
                  {[d.shipment.pol, d.shipment.pod].filter(Boolean).join(' → ') || '—'}
                </span></div>
                <div><span className="ship-k">船期</span><span className="ship-v">
                  {d.shipment.etd || d.shipment.eta
                    ? `${d.shipment.etd ? `开船 ${d.shipment.etd.slice(0, 10)}` : ''}${d.shipment.etd && d.shipment.eta ? ' · ' : ''}${d.shipment.eta ? `到港 ${d.shipment.eta.slice(0, 10)}` : ''}`
                    : '—'}
                </span></div>
              </div>

              {d.shipment.remark && (
                <p className="muted text-sm" style={{ margin: '10px 0 0' }}>📝 {d.shipment.remark}</p>
              )}
            </>
          ) : (
            <div className="alert alert-warn">报价已接手，我司正在安排物流。运营录入船期与节点后，会实时显示在这里。</div>
          )}

          {d.shipment && shipEvents.length === 0 && (
            <p className="muted text-sm" style={{ marginTop: 12 }}>物流基本信息已录入，后续节点更新将显示在这里。</p>
          )}
          {shipEvents.length > 0 && (
            <div className="ship-timeline">
              {shipEvents.map((ev, i) => (
                <div className={`ship-tl-item${i === shipEvents.length - 1 ? ' cur' : ''}`} key={ev.id}>
                  <span className="ship-tl-dot" />
                  <div className="ship-tl-body">
                    <div className="ship-tl-head">
                      <strong>{SHIP_STAGE_CN[ev.stage] || ev.stage}</strong>
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
            <h3>🏢 开票信息</h3>
            <span className="muted text-sm">我司运营端将按所选巴西公司的 CNPJ、IE 开具 NF</span>
          </div>
          <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
            <select className="form-input" style={{ minWidth: 320 }} value={d.invoice_cnpj?.id || ''}
              disabled={cnpjBusy || cnpjs.length === 0} onChange={e => bindCnpj(e.target.value)}>
              <option value="">{cnpjs.length === 0 ? '暂无维护的 CNPJ（请到工作台添加）' : '暂不指定'}</option>
              {cnpjs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.company_name} · CNPJ: {c.cnpj} · IE: {c.ie || '未登记'}{c.is_default ? '（默认）' : ''}
                </option>
              ))}
            </select>
            {d.invoice_cnpj && (
              <span className="muted text-sm" style={{ alignSelf: 'center' }}>
                当前：{d.invoice_cnpj.company_name} · CNPJ: <strong>{d.invoice_cnpj.cnpj}</strong> · IE: <strong>{d.invoice_cnpj.ie || '未登记'}</strong>
              </span>
            )}
          </div>
          {cnpjs.length === 0 && (
            <p className="muted text-sm" style={{ margin: '10px 0 0' }}>
              还没有维护开票信息。请到「工作台 → 巴西公司开票信息」添加 CNPJ 和 IE，供我司向该巴西公司开具 NF。
            </p>
          )}
        </div>
      )}

      {/* M8 交付文件：放行截图 / 发票 PDF（运营上传，客户查看/下载） */}
      {orderFiles.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>📎 交付文件</h3>
            <span className="muted text-sm">清关放行证明与发票等文件，由我司运营上传</span>
          </div>

          {/* 放行截图（图片缩略图，点击放大） */}
          {orderFiles.filter(f => f.kind === 'clearance_shot').length > 0 && (
            <>
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>🖼 清关放行截图</p>
              <div className="img-grid">
                {orderFiles.filter(f => f.kind === 'clearance_shot').map(f => (
                  <div className="img-thumb" key={f.id} title={f.file_name}
                    onClick={() => fileUrls[f.id] && setPreview({ url: fileUrls[f.id], name: f.file_name })}>
                    {fileUrls[f.id]
                      ? <img src={fileUrls[f.id]} alt={f.file_name} />
                      : <span className="muted text-sm">加载中…</span>}
                    <span className="img-name">{f.file_name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 发票 PDF / 其他文件（下载行） */}
          {orderFiles.filter(f => f.kind !== 'clearance_shot').length > 0 && (
            <>
              <p className="muted text-sm" style={{ margin: '14px 0 8px' }}>🧾 发票与文件</p>
              <div className="order-file-list">
                {orderFiles.filter(f => f.kind !== 'clearance_shot').map(f => (
                  <div className="order-file-row" key={f.id}>
                    <span className="deal-tag deal-open">{f.kind === 'invoice' ? '发票' : '文件'}</span>
                    <span className="text-sm" title={f.file_name}
                      style={{ minWidth: 0, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.mime_type === 'application/pdf' ? '📕' : '📄'} {f.file_name}
                    </span>
                    <span className="muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                      {(f.size_bytes / 1024).toFixed(0)} KB · {f.created_at?.slice(0, 10)}
                    </span>
                    {f.note && <span className="muted text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note}</span>}
                    <button className="btn btn-sm" onClick={() => doFileDownload(f)}>⬇ 下载</button>
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
            <h3>🧮 参考 DDP 费用分项</h3>
            <span className="muted text-sm">
              {d.pricing_breakdown.fx_rate ? `参考汇率 USD→BRL ${d.pricing_breakdown.fx_rate}` : ''}
            </span>
          </div>
          <p className="muted text-sm" style={{ margin: '0 0 10px' }}>
            分项由海运费、港杂费、进口税费与销售税务构成，内部运营成本已计入 DDP 总价但不拆分展示；金额均为参考预估。
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>费用项目</th><th className="amt">金额（R$）</th><th>说明</th></tr>
              </thead>
              <tbody>
                {d.pricing_breakdown.items.map(it => (
                  <tr key={it.code}>
                    <td><strong>{feeRefLabel(it)}</strong></td>
                    <td className="amt">{fmtBRL(it.amount)}</td>
                    <td className="muted">{refFeeNote(it.note) || '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>参考合计</strong></td>
                  <td className="amt"><strong>{fmtBRL(d.pricing_breakdown.total)}</strong></td>
                  <td className="muted">参考预估，不构成最终报价</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 我上传的 Excel 明细 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>📋 我的装箱清单明细</h3>
          <span className="muted text-sm">{d.line_items?.length || 0} 行 · {liKeys.length} 列</span>
        </div>
        {d.line_items && d.line_items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>行号</th>
                  {liKeys.map(k => <th key={k}>{FIELD_LABELS[k] || k}</th>)}
                  <th>🖼 图片</th>
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
          <p className="muted">该报价单暂无明细行数据</p>
        )}

        {/* 未关联到具体行的截图 */}
        {unlinked.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted text-sm" style={{ marginBottom: 8 }}>
              📎 整单截图（未关联到具体明细行）· {unlinked.length} 张
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
          <div className="shot-preview-name">{preview.name}（点击任意处关闭）</div>
        </div>
      )}
    </>
  );
}
