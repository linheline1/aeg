import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../store/auth';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';

interface FeeItem { code: string; name: string; amount: number; note?: string; }

/** API 返回的定价元信息：DI 复核版本、税率、利润与计算版本 */
interface BreakdownMeta {
  is_reference?: boolean;
  merchandise_brl?: number | null;
  di_brl?: number | null;
  di_review_version?: number | null;
  sales_markup_rate?: number | null;
  sales_markup_brl?: number | null;
  tax_base_brl?: number | null;
  sales_tax_rate?: number | null;
  sales_tax_brl?: number | null;
  profit_brl?: number | null;
  calculation_version?: string | null;
}

interface PricingBreakdown extends BreakdownMeta {
  currency: string;
  fx_rate?: number;
  items: FeeItem[];
  total: number;
  /** 新接口把元信息平铺在 breakdown 上；保留 meta 兼容。 */
  meta?: BreakdownMeta | null;
}

interface CustomsReview {
  status: 'pending' | 'approved' | 'changes_requested';
  di_review_version: number | null;
  total_di_brl: number | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface OrderDetail {
  id: string; quote_no: string; client_id: string; template_version: string; status: string;
  input_file_name: string | null; has_file?: boolean; total_rows?: number; valid_rows?: number;
  total_cbm?: number; total_gw_kg?: number; total_amount_rmb?: number | null;
  total_amount_brl?: number | null; total_amount_usd?: number | null;
  client_name?: string;
  salesperson_id?: string | null; salesperson_name?: string | null;
  deal_status?: 'open' | 'won' | 'lost' | null;
  deal_note?: string | null; deal_closed_at?: string | null;
  /** M9：客户选择的开票 CNPJ 快照（巴西 NF 抬头） */
  invoice_cnpj?: { id: string; cnpj: string; company_name: string; ie?: string | null } | null;
  created_at: string; updated_at: string; error_message: string | null;
  pricing_breakdown?: PricingBreakdown | null;
  line_items?: any[] | null;
  declared_currency?: 'RMB' | 'USD';
  di_analysis?: any;
  customs_review: CustomsReview | null;
  /** M7：国际物流（成交走柜后运营维护） */
  shipment?: {
    vessel?: string | null; voyage?: string | null; bill_no?: string | null; container_no?: string | null;
    pol?: string | null; pod?: string | null; etd?: string | null; eta?: string | null; remark?: string | null;
    events?: { id: string; stage: string; note?: string | null; happened_at: string; created_by?: string }[];
  } | null;
}

interface EditableFees {
  ocean_freight_usd: number;   // USD 整柜海运费（一口价）
  port_fee_usd: number;
  fx_rate: number;
  sales_markup_rate: number;   // 税基利润加成，存小数（0.20 = 20%）
  sales_tax_rate: number;      // 销售税率，存小数（0.065 = 6.5%）
  profit_brl: number;          // 每票利润（BRL）
}

/** 加成、税率和利润的默认值：全局费率未配置或接口未返回时使用 */
const DEFAULT_MARKUP_RATE = 0.20;
const DEFAULT_TAX_RATE = 0.065;
const DEFAULT_PROFIT_BRL = 30000;

const FIELD_LABEL_KEYS: Record<string, string> = {
  row_no: 'orderDetail.field.rowNo', carton_no: 'orderDetail.field.cartonNo', sku: 'SKU', product_cn: 'orderDetail.field.productCn',
  product_en: 'orderDetail.field.productEn', hs_code: 'HS Code', cartons: 'orderDetail.field.cartons', pcs_per_carton: 'orderDetail.field.pcsPerCarton',
  total_pcs: 'orderDetail.field.totalPcs', nw_per_carton: 'orderDetail.field.nwPerCarton', gw_per_carton: 'orderDetail.field.gwPerCarton', total_gw: 'orderDetail.field.totalGw',
  length_cm: 'orderDetail.field.lengthCm', width_cm: 'orderDetail.field.widthCm', height_cm: 'orderDetail.field.heightCm', unit_cbm: 'orderDetail.field.unitCbm',
  unit_price: 'orderDetail.field.unitPrice', base_unit_price: 'orderDetail.field.baseUnitPrice',
  material: 'orderDetail.field.material', destination: 'orderDetail.field.destination', remark: 'orderDetail.field.remark'
};

const STATUS_KEYS: Record<string, string> = {
  uploaded: 'orderDetail.status.uploaded', validating: 'orderDetail.status.validating', pending_fee: 'orderDetail.status.pendingFee',
  computing: 'orderDetail.status.computing', done: 'orderDetail.status.done', failed: 'orderDetail.status.failed'
};
/** M4 成交状态 */
const DEAL_KEYS: Record<string, string> = { open: 'orderDetail.dealStatus.open', won: 'orderDetail.dealStatus.won', lost: 'orderDetail.dealStatus.lost' };
/** M7 物流节点阶段（清关环节细化为三节点） */
const SHIP_STAGE_KEYS: Record<string, string> = {
  booked: 'orderDetail.stage.booked', loaded: 'orderDetail.stage.loaded', customs_cn: 'orderDetail.stage.customsCn', departed: 'orderDetail.stage.departed',
  on_water: 'orderDetail.stage.onWater', arrived: 'orderDetail.stage.arrived', customs_br: 'orderDetail.stage.customsBr',
  duty_paid: 'orderDetail.stage.dutyPaid', cleared: 'orderDetail.stage.cleared', delivered: 'orderDetail.stage.delivered'
};
/** M7 物流流程顺序（进度条 / 一键推进 / 智能默认） */
const SHIP_FLOW = ['booked', 'loaded', 'customs_cn', 'departed', 'on_water', 'arrived', 'customs_br', 'duty_paid', 'cleared', 'delivered'];
/** 进度条上的阶段短名 */
const FLOW_SHORT_KEYS: Record<string, string> = {
  booked: 'orderDetail.stageShort.booked', loaded: 'orderDetail.stageShort.loaded', customs_cn: 'orderDetail.stageShort.customsCn', departed: 'orderDetail.stageShort.departed',
  on_water: 'orderDetail.stageShort.onWater', arrived: 'orderDetail.stageShort.arrived', customs_br: 'orderDetail.stageShort.customsBr', duty_paid: 'orderDetail.stageShort.dutyPaid',
  cleared: 'orderDetail.stageShort.cleared', delivered: 'orderDetail.stageShort.delivered'
};
/** 可触发核算的状态（M3 状态机，computing 视为重启残留可重试） */
const COMPUTABLE = new Set(['uploaded', 'pending_fee', 'failed', 'computing']);
/** M8 交付文件类型 */
const FILE_KIND_KEYS: Record<string, string> = { clearance_shot: 'orderDetail.fileKind.clearanceShot', invoice: 'orderDetail.fileKind.invoice', other: 'orderDetail.fileKind.other' };

export default function OrderDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fees, setFees] = useState<EditableFees>({
    ocean_freight_usd: 1200, port_fee_usd: 130, fx_rate: 5.0,
    sales_markup_rate: DEFAULT_MARKUP_RATE,
    sales_tax_rate: DEFAULT_TAX_RATE, profit_brl: DEFAULT_PROFIT_BRL
  });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [salespeople, setSalespeople] = useState<{ id: string; username: string; status: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; china_company_name: string | null }[]>([]);
  // M6：订单明细截图（客户上传的 Excel 截图）
  const [shots, setShots] = useState<any[]>([]);
  const [shotThumbs, setShotThumbs] = useState<Record<string, string>>({});
  const [shotPreview, setShotPreview] = useState<{ url: string; name: string } | null>(null);
  const [adjPct, setAdjPct] = useState<Record<number, string>>({});
  const [priceBusyRow, setPriceBusyRow] = useState<number | null>(null);
  // M7：国际物流（基本信息表单 + 节点添加表单）
  const [shipForm, setShipForm] = useState({
    vessel: '', voyage: '', bill_no: '', container_no: '',
    pol: '', pod: '', etd: '', eta: '', remark: ''
  });
  const [shipSaving, setShipSaving] = useState(false);
  const [shipBusy, setShipBusy] = useState(false);
  const [evForm, setEvForm] = useState({ stage: 'booked', at: '', note: '' });
  // M8：交付文件（操作员上传给客户：放行截图 / 发票 PDF）
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [fileKind, setFileKind] = useState<'clearance_shot' | 'invoice' | 'other'>('clearance_shot');
  const [fileNote, setFileNote] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [pickFiles, setPickFiles] = useState<File[]>([]);
  const [di, setDi] = useState<any>(null);
  const [diParams, setDiParams] = useState({ rmb_brl: '', insurance_brl: 0, uf: 'SP', icms_rate: 0.18 });
  const [diBusy, setDiBusy] = useState(false);
  const [diVersions, setDiVersions] = useState<any[]>([]);
  const [diHistory, setDiHistory] = useState<any>(null);

  // 拉取该订单的明细截图（鉴权 blob → objectURL）
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.get(`/api/ops/images?quote_id=${id}&pageSize=100`);
        const rows: any[] = r.data.items || [];
        setShots(rows);
        const map: Record<string, string> = {};
        await Promise.all(rows.map(async (img) => {
          try {
            const res = await api.get(`/api/ops/images/${img.id}/file`, { responseType: 'blob' });
            map[img.id] = URL.createObjectURL(new Blob([res.data as any], { type: img.mime_type }));
          } catch { /* 单张失败不影响整体 */ }
        }));
        setShotThumbs(map);
      } catch { /* 接口异常保持空列表 */ }
    })();
  }, [id]);

  const loadDiVersions = () => {
    if (!id) return;
    api.get(`/api/ops/orders/${id}/di/versions`)
      .then(r => setDiVersions(r.data || []))
      .catch(() => setDiVersions([]));
  };

  const load = () => {
    api.get(`/api/ops/orders/${id}`).then(r => {
      const od = r.data as OrderDetail;
      setD(od);
      setDi(od.di_analysis || null);
      if (od.di_analysis?.parameters) {
        const p = od.di_analysis.parameters;
        setDiParams({ rmb_brl: String(p.rmb_brl), insurance_brl: p.insurance_brl || 0, uf: p.uf || 'SP', icms_rate: p.icms_rate });
      }
      // M7：回填物流表单
      const sh = od.shipment;
      if (sh) setShipForm({
        vessel: sh.vessel || '', voyage: sh.voyage || '', bill_no: sh.bill_no || '',
        container_no: sh.container_no || '', pol: sh.pol || '', pod: sh.pod || '',
        etd: sh.etd?.slice(0, 10) || '', eta: sh.eta?.slice(0, 10) || '', remark: sh.remark || ''
      });
      // M7 优化：节点表单默认选中「下一阶段」（按流程顺序）
      const idxs = (sh?.events || []).map((ev: any) => SHIP_FLOW.indexOf(ev.stage)).filter((i: number) => i >= 0);
      const maxIdx = idxs.length ? Math.max(...idxs) : -1;
      const nextStage = maxIdx < 0 ? 'booked' : maxIdx < SHIP_FLOW.length - 1 ? SHIP_FLOW[maxIdx + 1] : null;
      if (nextStage) setEvForm(f => ({ ...f, stage: nextStage }));
      const br = od.pricing_breakdown;
      const meta: BreakdownMeta | null = br ? (br.meta || br) : null;
      if (br?.items?.length) {
        // 优先用订单已保存的分项与 meta 初始化（税率/利润默认 0.065 / 30000）
        const amountOf = (code: string) => br.items.find(i => i.code === code)?.amount;
        const ocean = amountOf('OCEAN_FREIGHT');
        const port = amountOf('PORT_FEE_ORIGIN');
        const fx = br.fx_rate ?? 5.0;
        setFees({
          ocean_freight_usd: ocean != null ? Math.round((ocean / fx) * 100) / 100 : 1200,
          port_fee_usd: port != null ? Math.round((port / fx) * 100) / 100 : 130,
          fx_rate: fx,
          sales_markup_rate: meta?.sales_markup_rate ?? DEFAULT_MARKUP_RATE,
          sales_tax_rate: meta?.sales_tax_rate ?? DEFAULT_TAX_RATE,
          profit_brl: meta?.profit_brl ?? DEFAULT_PROFIT_BRL
        });
        // 旧报价单没有 pricing meta：税率/利润回落到费率表解析结果
        if (!meta && od.client_id) {
          api.get(`/api/ops/rates/resolve/${od.client_id}`).then((r2: any) => {
            const rt = r2.data?.rates;
            if (!rt) return;
            setFees(prev => ({
              ...prev,
              sales_markup_rate: rt.sales_markup_rate ?? prev.sales_markup_rate,
              sales_tax_rate: rt.sales_tax_rate ?? prev.sales_tax_rate,
              profit_brl: rt.profit_brl ?? prev.profit_brl
            }));
          }).catch(() => {});
        }
      } else if (od.client_id) {
        // M2：无报价时，用费率表解析结果（客户覆盖 > 全局默认）预填
        api.get(`/api/ops/rates/resolve/${od.client_id}`).then((r2: any) => {
          const rt = r2.data?.rates;
          if (rt) setFees({
            ocean_freight_usd: rt.ocean_freight_usd ?? 0,
            port_fee_usd: rt.port_fee_usd ?? 0,
            fx_rate: rt.fx_rate ?? 5,
            sales_markup_rate: rt.sales_markup_rate ?? DEFAULT_MARKUP_RATE,
            sales_tax_rate: rt.sales_tax_rate ?? DEFAULT_TAX_RATE,
            profit_brl: rt.profit_brl ?? DEFAULT_PROFIT_BRL
          });
        }).catch(() => {});
      }
    }).catch(e => setErr(getApiErrorMessage(e)));
  };

  useEffect(() => {
    setDiHistory(null);
    load();
    loadDiVersions();
  }, [id]);
  useEffect(() => {
    api.get('/api/ops/salespeople').then(r => setSalespeople(r.data)).catch(() => {});
    api.get('/api/ops/orders/clients/options').then(r => setClients(r.data || [])).catch(() => {});
  }, []);

  const flashMsg = (text: string) => { setFlash(text); setTimeout(() => setFlash(null), 3500); };

  /** 订单当前 DI 金额：优先 di_analysis.totals.di_brl，其次已保存的 pricing meta */
  const diAmountOf = (order: OrderDetail | null): number | null => {
    const v = order?.di_analysis?.totals?.di_brl
      ?? order?.pricing_breakdown?.meta?.di_brl
      ?? order?.pricing_breakdown?.di_brl;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const currentCustomsApproved = d?.customs_review?.status === 'approved'
    && d.customs_review.di_review_version != null
    && d.customs_review.di_review_version === d.di_analysis?.review_version;
  const customsApprovalHint = t('orderDetail.customs.approvalRequired');
  const checkCurrentCustomsApproval = (action: string) => {
    if (currentCustomsApproved) return true;
    setErr(t('orderDetail.customs.notApproved', { action }));
    return false;
  };

  /** M3：按费率表核算并发布（uploaded/pending_fee/failed → computing → done） */
  const handleCompute = async () => {
    if (diAmountOf(d) == null) { setErr(t('orderDetail.di.requiredForCompute')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/compute`, {});
      flashMsg(t('orderDetail.computed', { quote: r.data.quote_no, amount: r.data.total_amount_brl?.toFixed(2) }));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const handleAdjustPrice = async (rowNo: number) => {
    const raw = (adjPct[rowNo] || '').trim();
    const pct = Number(raw);
    if (!raw || !Number.isFinite(pct) || pct <= 0 || pct > 10000) {
      flashMsg(t('orderDetail.invalidPercent'));
      return;
    }
    setPriceBusyRow(rowNo); setErr(null);
    try {
      const r = await api.patch(`/api/ops/orders/${id}/line-items/${rowNo}/price`, { percent: pct });
      const parts = [t('orderDetail.price.rowSummary', {
        row: rowNo, base: r.data.base_unit_price, pct, price: r.data.unit_price
      })];
      parts.push(t('orderDetail.price.totalSummary', { total: r.data.total_price, amount: r.data.total_amount_rmb }));
      if (r.data.total_amount_brl != null) {
        parts.push(t('orderDetail.price.ddpPending', { amount: Number(r.data.total_amount_brl).toFixed(2) }));
      } else {
        parts.push(t('orderDetail.price.resetToUploaded'));
      }
      flashMsg(parts.join(' · '));
      setAdjPct(prev => ({ ...prev, [rowNo]: '' }));
      await load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setPriceBusyRow(null); }
  };

  /** M3：手动流转（标记失败 / 失败重开） */
  const handleStatus = async (next: 'failed' | 'pending_fee') => {
    if (next === 'failed' && !window.confirm(t('orderDetail.confirmMarkFailed'))) return;
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/status`, { status: next });
      flashMsg(next === 'failed' ? t('orderDetail.markedFailed') : t('orderDetail.reopened'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const handleRecompute = async () => {
    if (diAmountOf(d) == null) { setErr(t('orderDetail.di.requiredForRecompute')); return; }
    setSaving(true); setErr(null);
    try {
      const r = await api.patch(`/api/ops/orders/${id}/fees`, {
        ocean_freight_usd: fees.ocean_freight_usd,
        port_fee_usd: fees.port_fee_usd,
        fx_rate: fees.fx_rate,
        sales_markup_rate: fees.sales_markup_rate,
        sales_tax_rate: fees.sales_tax_rate,
        profit_brl: fees.profit_brl,
        // 兼容旧接口：巴西清关合并价已由 DI + 税率 + 利润取代
        br_clearance_brl: 0
      });
      setFlash(t('orderDetail.savedDdp', {
        quote: r.data.quote_no,
        brl: r.data.total_amount_brl.toFixed(2),
        usd: r.data.total_amount_usd.toFixed(2)
      }));
      setTimeout(() => setFlash(null), 2500);
      setD(prev => prev ? {
        ...prev,
        total_amount_brl: r.data.total_amount_brl,
        total_amount_usd: r.data.total_amount_usd,
        pricing_breakdown: r.data.pricing_breakdown,
        updated_at: new Date().toISOString()
      } : prev);
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setSaving(false); }
  };

  const handleDownload = async () => {
    if (!d) return;
    try {
      const r = await api.get(`/api/ops/orders/${id}/file`, { responseType: 'blob' });
      await downloadOrShareFile(r.data, d.input_file_name || `${d.quote_no}.xlsx`);
    } catch (e: any) {
      alert(t('orderDetail.downloadFailed', { message: e?.response?.data?.message || e?.message }));
    }
  };

  const diPayload = () => ({
    rmb_brl: Number(diParams.rmb_brl),
    insurance_brl: Number(diParams.insurance_brl),
    uf: diParams.uf,
    icms_rate: Number(diParams.icms_rate)
  });

  const handleDiAnalyze = async () => {
    if (!diParams.rmb_brl) { setErr(t('orderDetail.di.rmbRateRequired')); return; }
    setDiBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/di/analyze`, diPayload());
      setDi(r.data);
      setD(prev => prev ? { ...prev, di_analysis: r.data } : prev);
      flashMsg(t('orderDetail.di.analyzed'));
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || t('orderDetail.di.analyzeFailed')); }
    finally { setDiBusy(false); }
  };

  const updateDiItem = (rowNo: number, key: string, value: any) => {
    setDi((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any) => item.row_no === rowNo ? { ...item, [key]: value } : item)
    }));
  };

  const handleDiReview = async () => {
    setDiBusy(true); setErr(null);
    try {
      const r = await api.patch(`/api/ops/orders/${id}/di/review`, {
        parameters: diPayload(),
        items: di?.items || []
      });
      setDi(r.data);
      setD(prev => prev ? {
        ...prev,
        di_analysis: r.data,
        customs_review: {
          status: 'pending',
          di_review_version: r.data.review_version,
          total_di_brl: r.data.totals?.di_brl ?? null,
          note: null,
          reviewed_by: null,
          reviewed_at: null
        }
      } : prev);
      loadDiVersions();
      flashMsg(t('orderDetail.di.saved', { version: r.data.review_version }));
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || t('orderDetail.di.saveFailed')); }
    finally { setDiBusy(false); }
  };

  const handleDiVersion = async (value: string) => {
    setErr(null);
    setDiHistory(null);
    if (!value) return;
    try {
      const r = await api.get(`/api/ops/orders/${id}/di/versions/${value}`);
      setDiHistory(r.data);
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || t('orderDetail.di.historyLoadFailed')); }
  };

  const handleDiDdp = async () => {
    setDiBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/di/ddp`);
      flashMsg(t('orderDetail.di.ddpGenerated', { version: di?.review_version, amount: r.data.total_amount_brl?.toFixed(2) }));
      load();
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || t('orderDetail.di.ddpFailed')); }
    finally { setDiBusy(false); }
  };

  /** M4：成交标记（won/lost/open） */
  const handleDeal = async (next: 'won' | 'lost' | 'open') => {
    if (next === 'won' && !checkCurrentCustomsApproval(t('orderDetail.deal.actionMarkWon'))) return;
    let note: string | undefined;
    if (next === 'lost') {
      note = window.prompt(t('orderDetail.lostReasonPrompt')) ?? undefined;
    }
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/deal`, {
        deal_status: next,
        ...(note !== undefined ? { note } : {})
      });
      flashMsg(next === 'won' ? t('orderDetail.deal.markedWon') : next === 'lost' ? t('orderDetail.deal.markedLost') : t('orderDetail.deal.reopenedOpen'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setBusy(false); }
  };

  /** M4：改派业务员（清空 = 回到客户默认归属） */
  const handleAssign = async (salespersonId: string) => {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/assign`, { salesperson_id: salespersonId || null });
      flashMsg(t('orderDetail.salesUpdated'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
      load();
    } finally { setBusy(false); }
  };

  /** 转客户：把报价号转给另一个客户（归属业务员回到新客户默认，开票抬头快照清空） */
  const handleChangeClient = async (clientId: string) => {
    if (!d || !clientId || clientId === d.client_id) return;
    const target = clients.find(c => c.id === clientId);
    if (!window.confirm(t('orderDetail.clientChangeConfirm', {
      quote: d.quote_no,
      client: target?.name || clientId
    }))) return;
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/client`, { client_id: clientId });
      flashMsg(t('orderDetail.clientChanged'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
      load();
    } finally { setBusy(false); }
  };

  /** M7：保存国际物流基本信息 */
  const handleShipSave = async () => {
    setShipSaving(true); setErr(null);
    try {
      await api.put(`/api/ops/orders/${id}/shipment`, shipForm);
      flashMsg(t('orderDetail.ship.saved'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setShipSaving(false); }
  };

  /** M7：添加物流节点（datetime-local → ISO） */
  const handleEvAdd = async () => {
    if (!evForm.stage) return;
    setShipBusy(true); setErr(null);
    try {
      const happened_at = evForm.at ? new Date(evForm.at).toISOString() : undefined;
      await api.post(`/api/ops/orders/${id}/shipment/events`, {
        stage: evForm.stage,
        note: evForm.note || undefined,
        happened_at
      });
      flashMsg(t('orderDetail.ship.eventAdded'));
      setEvForm({ stage: evForm.stage, at: '', note: '' });
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setShipBusy(false); }
  };

  /** M7 优化：一键推进到下一阶段（时间记为现在，备注可选） */
  const handleEvAdvance = async () => {
    if (!evNextStage) return;
    setShipBusy(true); setErr(null);
    try {
      await api.post(`/api/ops/orders/${id}/shipment/events`, {
        stage: evNextStage,
        note: evForm.note || undefined
      });
      flashMsg(t('orderDetail.ship.advancedTo', { stage: t(SHIP_STAGE_KEYS[evNextStage]) }));
      setEvForm({ stage: evNextStage, at: '', note: '' });
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setShipBusy(false); }
  };

  /** M7：删除误录的物流节点 */
  const handleEvDel = async (eventId: string) => {
    if (!window.confirm(t('orderDetail.ship.confirmDeleteEvent'))) return;
    setShipBusy(true); setErr(null);
    try {
      await api.delete(`/api/ops/orders/${id}/shipment/events/${eventId}`);
      flashMsg(t('orderDetail.ship.eventDeleted'));
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setShipBusy(false); }
  };

  // M8：交付文件（放行截图 / 发票 PDF）
  const loadFiles = () => {
    if (!id) return;
    api.get(`/api/ops/orders/${id}/files`).then(r => setOrderFiles(r.data || [])).catch(() => {});
  };
  useEffect(() => { loadFiles(); }, [id]);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPickFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const doFileUpload = async () => {
    if (pickFiles.length === 0) return;
    setFileBusy(true); setErr(null);
    try {
      const fd = new FormData();
      pickFiles.forEach(f => fd.append('files', f));
      fd.append('kind', fileKind);
      if (fileNote.trim()) fd.append('note', fileNote.trim());
      const r = await api.post(`/api/ops/orders/${id}/files`, fd);
      flashMsg(t('orderDetail.files.uploaded', { count: r.data.count }));
      setPickFiles([]); setFileNote('');
      loadFiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setFileBusy(false); }
  };

  const doFileDelete = async (fid: string) => {
    if (!window.confirm(t('orderDetail.files.confirmDelete'))) return;
    setFileBusy(true); setErr(null);
    try {
      await api.delete(`/api/ops/files/${fid}`);
      flashMsg(t('orderDetail.files.deleted'));
      loadFiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setFileBusy(false); }
  };

  const doFileDownload = async (f: any) => {
    try {
      const r = await api.get(`/api/ops/files/${f.id}/file`, { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data], { type: f.mime_type }), f.file_name);
    } catch (e: any) { alert(t('orderDetail.downloadFailed', { message: e?.response?.data?.message || e?.message })); }
  };

  if (err && !d) return <div className="card"><p className="err-msg">❌ {err}</p><Link to="/orders">← {t('orderDetail.backToList')}</Link></div>;
  if (!d) return <div className="card"><p>{t('common.loading')}</p></div>;

  // 前端本地预演：税基=(DI+货值)×(1+20%)+国际运费；税务=税基×6.5%
  // 参考 DDP = 税务 + DI + 国际运费 + 其他成本 + 每票利润
  const meta: BreakdownMeta | null = d.pricing_breakdown?.meta || d.pricing_breakdown || null;
  const diBrl = diAmountOf(d);
  const merchandiseBrl = Number(d.di_analysis?.totals?.merchandise_brl)
    || (d.di_analysis?.items || []).reduce((sum: number, item: any) => sum + (Number(item.merchandise_brl) || 0), 0);
  const hasDi = diBrl != null;
  const fx = fees.fx_rate;
  const previewOceanBrl = fees.ocean_freight_usd * fx;
  const previewPortBrl = fees.port_fee_usd * fx;
  const previewMarkupBrl = ((diBrl ?? 0) + merchandiseBrl) * fees.sales_markup_rate;
  const previewTaxBaseBrl = (diBrl ?? 0) + merchandiseBrl + previewMarkupBrl + previewOceanBrl;
  const previewSalesTaxBrl = previewTaxBaseBrl * fees.sales_tax_rate;
  const previewBrazilSegment = (diBrl ?? 0) + previewSalesTaxBrl + fees.profit_brl;
  const previewTotal = Math.round((previewSalesTaxBrl + (diBrl ?? 0) + previewOceanBrl + previewPortBrl + fees.profit_brl) * 100) / 100;
  const prevTotal = d.pricing_breakdown?.total ?? d.total_amount_brl ?? 0;
  const diff = Math.round((previewTotal - prevTotal) * 100) / 100;
  const noDiHint = t('orderDetail.di.requiredForDdp');

  // line_items 的字段（取第一个 row 的 keys 做表头）
  const liKeys: string[] = (d.line_items?.[0] && typeof d.line_items[0] === 'object')
    ? Object.keys(d.line_items[0]).filter(k => k !== 'row_no')
    : [];

  // M7：物流节点（正序）与当前阶段
  const shipEvents = [...(d.shipment?.events || [])].sort((a: any, b: any) =>
    String(a.happened_at).localeCompare(String(b.happened_at)));
  const curStage = shipEvents.length ? shipEvents[shipEvents.length - 1].stage : null;
  // M7 优化：流程进度（已到达的最深阶段）与建议的下一阶段
  const doneIdx = Math.max(-1, ...shipEvents.map(ev => SHIP_FLOW.indexOf(ev.stage)));
  const evNextStage = doneIdx < 0 ? 'booked'
    : doneIdx < SHIP_FLOW.length - 1 ? SHIP_FLOW[doneIdx + 1]
    : null; // 已签收 → 流程完成

  // 明细截图按行号分组：行级对应 + 未关联到行的截图
  const shotsByRow = new Map<number, any[]>();
  const unboundShots: any[] = [];
  for (const img of shots) {
    if (img.row_no != null) {
      const k = Number(img.row_no);
      if (!shotsByRow.has(k)) shotsByRow.set(k, []);
      shotsByRow.get(k)!.push(img);
    } else {
      unboundShots.push(img);
    }
  }

  const renderShots = (imgs: any[]) => (
    <div className="shot-cell">
      {imgs.map((img) => (
        <div
          key={img.id}
          className="shot-mini"
          title={img.file_name}
          onClick={() => shotThumbs[img.id] && setShotPreview({ url: shotThumbs[img.id], name: img.file_name })}
        >
          {shotThumbs[img.id]
            ? <img src={shotThumbs[img.id]} alt={img.file_name} />
            : <span className="muted text-sm">{t('common.loading')}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="order-detail">
      <div className="page-title">
        <h1>
          <Link to="/orders" className="btn-link">← {t('common.back')}</Link> &nbsp;
          {t('orderDetail.quoteLabel')} <code>{d.quote_no}</code>
        </h1>
        <div className="row gap-md">
          <span className={`status-tag status-${d.status}`}>{STATUS_KEYS[d.status] ? t(STATUS_KEYS[d.status]) : d.status}</span>
          {d.has_file && <button onClick={handleDownload} className="btn">📥 {t('orderDetail.originalExcel')}</button>}
        </div>
      </div>

      {flash && <div className="alert alert-ok">{flash}</div>}
      {err && <div className="alert alert-err">❌ {err}</div>}

      <div className={`alert ${currentCustomsApproved ? 'alert-ok' : 'alert-warn'}`}>
        <strong>
          {t('orderDetail.customs.title')}{!d.customs_review
            ? t('orderDetail.customs.notSubmitted')
            : d.customs_review.status === 'pending'
              ? t('orderDetail.customs.pending')
              : d.customs_review.status === 'changes_requested'
                ? t('orderDetail.customs.changesRequested')
                : t('orderDetail.customs.approvedVersion', { version: d.customs_review.di_review_version != null ? ` v${d.customs_review.di_review_version}` : '' })}
        </strong>
        {d.customs_review?.status === 'approved' && !currentCustomsApproved && (
          <span style={{ marginLeft: 8 }}>{t('orderDetail.customs.versionMismatch')}</span>
        )}
        {(d.customs_review?.reviewed_by || d.customs_review?.reviewed_at) && (
          <div className="text-sm" style={{ marginTop: 4 }}>
            {t('orderDetail.customs.reviewer', { name: d.customs_review.reviewed_by || '—' })}
            {d.customs_review.reviewed_at && ` · ${d.customs_review.reviewed_at.slice(0, 16).replace('T', ' ')}`}
          </div>
        )}
        {d.customs_review?.status === 'changes_requested' && d.customs_review.note && (
          <div style={{ marginTop: 4 }}>{t('orderDetail.customs.changesNote', { note: d.customs_review.note })}</div>
        )}
      </div>

      {/* M3 状态机工作条 */}
      {COMPUTABLE.has(d.status) && (
        <div className="alert alert-warn row-between order-workbar" style={{ alignItems: 'center' }}>
          <div>
            <strong>{d.status === 'failed' ? t('orderDetail.workbar.failed') : t('orderDetail.workbar.pending')}</strong>
            <span className="text-sm" style={{ marginLeft: 8 }}>
              {d.status === 'failed'
                ? (d.error_message || t('orderDetail.workbar.failedHintDefault'))
                : !hasDi
                  ? t('orderDetail.workbar.noDiHint')
                  : t('orderDetail.workbar.readyHint')}
            </span>
          </div>
          <div className="row gap-sm">
            <button
              className="btn"
              disabled={busy || !hasDi}
              onClick={handleCompute}
              title={!hasDi ? noDiHint : undefined}
            >
              {busy ? t('orderDetail.workbar.computing') : t('orderDetail.workbar.compute')}
            </button>
            {d.status !== 'failed'
              ? <button className="btn btn-ghost" disabled={busy} onClick={() => handleStatus('failed')}>{t('orderDetail.workbar.markFailed')}</button>
              : <button className="btn btn-ghost" disabled={busy} onClick={() => handleStatus('pending_fee')}>{t('orderDetail.workbar.reopen')}</button>}
          </div>
        </div>
      )}

      {/* M4 成交状态工作条：仅 done 报价可标记 */}
      {d.status === 'done' && (
        <div className="alert alert-warn row-between order-workbar" style={{ alignItems: 'center' }}>
          <div>
            <strong>🤝 {t('orderDetail.deal.followUp')}</strong>
            <span className="text-sm" style={{ marginLeft: 8 }}>
              {t('orderDetail.deal.current')}
              <span className={
                d.deal_status === 'won' ? 'deal-tag deal-won'
                : d.deal_status === 'lost' ? 'deal-tag deal-lost'
                : d.deal_status === 'open' ? 'deal-tag deal-open'
                : 'deal-tag deal-none'
              }>
                {d.deal_status ? (DEAL_KEYS[d.deal_status] ? t(DEAL_KEYS[d.deal_status]) : d.deal_status) : t('orderDetail.deal.none')}
              </span>
              {d.deal_closed_at && (
                <span className="muted" style={{ marginLeft: 6 }}>
                  {d.deal_status === 'won' ? t('orderDetail.deal.closedAt') : t('orderDetail.deal.markedAt')} {d.deal_closed_at.slice(0, 16).replace('T', ' ')}
                </span>
              )}
              {d.deal_note && <span className="muted" style={{ marginLeft: 6 }}>{t('orderDetail.deal.note', { note: d.deal_note })}</span>}
            </span>
          </div>
          <div className="row gap-sm">
            {d.deal_status !== 'won' && (
              <button
                className="btn"
                disabled={busy || !currentCustomsApproved}
                title={!currentCustomsApproved ? customsApprovalHint : undefined}
                onClick={() => handleDeal('won')}
              >✅ {t('orderDetail.deal.actionMarkWon')}</button>
            )}
            {d.deal_status !== 'lost' && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => handleDeal('lost')}>✗ {t('orderDetail.deal.actionMarkLost')}</button>
            )}
            {d.deal_status && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => handleDeal('open')}>{t('orderDetail.deal.resume')}</button>
            )}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* 左：DDP 可编辑面板 */}
        <div className="card">
          <div className="card-title">
            <h3>💰 {t('orderDetail.ddp.title')}</h3>
            <div className="row gap-sm">
              {meta?.is_reference && <span className="deal-tag deal-open">{t('orderDetail.ddp.referenceTag')}</span>}
              <span className="muted text-sm">{t('orderDetail.ddp.editableHint')}</span>
            </div>
          </div>
          <p className="muted text-sm mt-8">
            {t('orderDetail.ddp.formulaPrefix')}<strong>{t('orderDetail.ddp.formulaBold')}</strong>{t('orderDetail.ddp.formulaSuffix')}
          </p>

          <div className="table-wrap mt-12">
            <table className="table ddp-edit-table">
              <thead>
                <tr>
                  <th>{t('orderDetail.ddp.costItem')}</th>
                  <th style={{ width: 180 }}>{t('orderDetail.ddp.parameter')}</th>
                  <th style={{ width: 140 }}>{t('orderDetail.ddp.currentValue')}</th>
                  <th style={{ width: 80 }}>{t('orderDetail.ddp.unit')}</th>
                  <th className="amt">{t('orderDetail.ddp.lineSubtotal')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('orderDetail.ddp.oceanFreight')}</td>
                  <td>
                    <label className="text-sm muted">{t('orderDetail.ddp.oceanFreightLabel')}</label>
                    <input
                      type="number" step="1"
                      className="form-input"
                      value={fees.ocean_freight_usd}
                      onChange={e => setFees({ ...fees, ocean_freight_usd: Number(e.target.value) })}
                      disabled={saving}
                    />
                  </td>
                  <td>USD {fees.ocean_freight_usd}</td>
                  <td>{t('orderDetail.ddp.usdPerContainer')}</td>
                  <td className="amt">{previewOceanBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.originPortFee')}</td>
                  <td>
                    <label className="text-sm muted">{t('orderDetail.ddp.fixedUsd')}</label>
                    <input
                      type="number" step="0.1"
                      className="form-input"
                      value={fees.port_fee_usd}
                      onChange={e => setFees({ ...fees, port_fee_usd: Number(e.target.value) })}
                      disabled={saving}
                    />
                  </td>
                  <td>{fees.port_fee_usd}</td>
                  <td>USD</td>
                  <td className="amt">{previewPortBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.importTax')}</td>
                  <td>
                    <span className="muted text-sm">
                      {t('orderDetail.ddp.readonlyDi')}{meta?.di_review_version ? t('orderDetail.ddp.diVersionSuffix', { version: meta.di_review_version }) : ''}
                    </span>
                  </td>
                  <td>{hasDi ? `R$ ${diBrl!.toFixed(2)}` : t('orderDetail.ddp.diNotGenerated')}</td>
                  <td>BRL</td>
                  <td className="amt">{hasDi ? diBrl!.toFixed(2) : '—'}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.declaredValue')}</td>
                  <td><span className="muted text-sm">{t('orderDetail.ddp.readonlyValue')}</span></td>
                  <td>R$ {merchandiseBrl.toFixed(2)}</td>
                  <td>BRL</td>
                  <td className="amt">{merchandiseBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.markup')}</td>
                  <td>
                    <label className="text-sm muted">{t('orderDetail.ddp.markupLabel')}</label>
                    <input
                      type="number" step="1" min="0" max="99"
                      className="form-input"
                      value={Math.round(fees.sales_markup_rate * 10000) / 100}
                      onChange={e => setFees({ ...fees, sales_markup_rate: Number(e.target.value) / 100 })}
                      disabled={saving}
                    />
                  </td>
                  <td>{(fees.sales_markup_rate * 100).toFixed(2)}%</td>
                  <td>BRL</td>
                  <td className="amt">{previewMarkupBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.salesTax')}</td>
                  <td>
                    <label className="text-sm muted">{t('orderDetail.ddp.salesTaxLabel')}</label>
                    <input
                      type="number" step="0.1" min="0"
                      className="form-input"
                      value={Math.round(fees.sales_tax_rate * 10000) / 100}
                      onChange={e => setFees({ ...fees, sales_tax_rate: Number(e.target.value) / 100 })}
                      disabled={saving}
                    />
                  </td>
                  <td>{(fees.sales_tax_rate * 100).toFixed(2)}%</td>
                  <td>BRL</td>
                  <td className="amt">{previewSalesTaxBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>{t('orderDetail.ddp.profit')}</td>
                  <td>
                    <label className="text-sm muted">{t('orderDetail.ddp.profitLabel')}</label>
                    <input
                      type="number" step="1000" min="0"
                      className="form-input"
                      value={fees.profit_brl}
                      onChange={e => setFees({ ...fees, profit_brl: Number(e.target.value) })}
                      disabled={saving}
                    />
                  </td>
                  <td>R$ {fees.profit_brl.toFixed(2)}</td>
                  <td>BRL</td>
                  <td className="amt">{fees.profit_brl.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="pricing-subtotal">
                  <td colSpan={4}>{t('orderDetail.ddp.fxRate')}</td>
                  <td className="amt text-num" style={{ padding: 8 }}>
                    <input
                      type="number" step="0.1"
                      className="form-input form-input-sm"
                      value={fees.fx_rate}
                      onChange={e => setFees({ ...fees, fx_rate: Number(e.target.value) })}
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="pricing-subtotal">
                  <td colSpan={4}>{t('orderDetail.ddp.taxBase')}</td>
                  <td className="amt">{previewTaxBaseBrl.toFixed(2)}</td>
                </tr>
                <tr className="pricing-subtotal">
                  <td colSpan={4}>{t('orderDetail.ddp.brazilSubtotal')}</td>
                  <td className="amt">{previewBrazilSegment.toFixed(2)}</td>
                </tr>
                <tr className="pricing-total">
                  <td colSpan={4}>{t('orderDetail.ddp.total')}</td>
                  <td className="amt" style={{ fontSize: 17 }}>
                    R$ {previewTotal.toFixed(2)}
                    {diff !== 0 && (
                      <span className={diff > 0 ? 'diff-pos' : 'diff-neg'} style={{ fontSize: 12, marginLeft: 6, fontWeight: 500 }}>
                        ({diff > 0 ? '+' : ''}{diff.toFixed(2)})
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 订单已保存的 DDP 分项（API 返回，直接展示） */}
          {d.pricing_breakdown?.items?.length ? (
            <div className="mt-12">
              <div className="muted text-sm" style={{ marginBottom: 6 }}>
                {t('orderDetail.ddp.savedItems')}{meta?.calculation_version ? t('orderDetail.ddp.calcVersionSuffix', { version: meta.calculation_version }) : ''}
              </div>
              <table className="table">
                <thead>
                  <tr><th>{t('orderDetail.ddp.item')}</th><th>{t('orderDetail.ddp.description')}</th><th className="amt">{t('orderDetail.ddp.amount')}</th></tr>
                </thead>
                <tbody>
                  {d.pricing_breakdown.items.map(item => (
                    <tr key={item.code}>
                      <td>{item.name}</td>
                      <td className="muted text-sm">{item.note || '—'}</td>
                      <td className="amt">{item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="pricing-subtotal">
                    <td colSpan={2}>{t('orderDetail.ddp.itemsTotal')}</td>
                    <td className="amt">{d.pricing_breakdown.total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}

          {!hasDi && (
            <p className="alert alert-warn text-sm" style={{ marginTop: 12 }}>
              {noDiHint}
            </p>
          )}

          <div className="row gap-md mt-16">
            <button
              onClick={handleRecompute}
              disabled={saving || !hasDi}
              title={!hasDi ? noDiHint : t('orderDetail.ddp.recomputeHint')}
              className="btn btn-lg"
              style={{ background: hasDi ? '#2563eb' : undefined }}
            >
              {saving ? t('orderDetail.ddp.calculating') : t('orderDetail.ddp.recompute')}
            </button>
            <button onClick={load} className="btn btn-ghost btn-lg">{t('orderDetail.ddp.discard')}</button>
          </div>
        </div>

        {/* 右：货物汇总 */}
        <div className="card">
          <div className="card-title">
            <h3>📊 {t('orderDetail.summary.title')}</h3>
          </div>
          <table className="table">
            <tbody>
              <tr>
                <th style={{ width: 140, textAlign: 'left' }}>{t('orderDetail.summary.client')}</th>
                <td>
                  <select
                    className="form-input form-input-sm"
                    style={{ width: 200 }}
                    value={d.client_id}
                    disabled={busy}
                    onChange={e => handleChangeClient(e.target.value)}
                    title={t('orderDetail.summary.clientChangeHint')}
                  >
                    {!clients.some(c => c.id === d.client_id) && (
                      <option value={d.client_id}>{d.client_name || d.client_id}</option>
                    )}
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}><code>{d.client_id}</code></div>
                </td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('orderDetail.summary.salesperson')}</th>
                <td>
                  <select
                    className="form-input form-input-sm"
                    style={{ width: 160 }}
                    value={d.salesperson_id || ''}
                    disabled={busy}
                    onChange={e => handleAssign(e.target.value)}
                    title={t('orderDetail.summary.reassignHint')}
                  >
                    <option value="">{t('orderDetail.summary.unassigned')}</option>
                    {salespeople.map(s => (
                      <option key={s.id} value={s.id}>{s.username}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.templateVersion')}</th><td>v{d.template_version}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.validRows')}</th><td>{d.valid_rows} / {d.total_rows}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.totalCbm')}</th><td>{d.total_cbm?.toFixed(3) ?? '—'} CBM</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.totalGw')}</th><td>{d.total_gw_kg?.toFixed(2) ?? '—'} kg</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.declaredAmount')}</th><td>¥ {d.total_amount_rmb?.toFixed(2) ?? '—'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.declaredCurrency')}</th><td>{d.declared_currency === 'USD' ? t('orderDetail.summary.currencyUsd') : 'RMB'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.uploadedFile')}</th><td>{d.input_file_name || '—'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>{t('orderDetail.summary.updatedAt')}</th><td>{d.updated_at?.slice(0, 19).replace('T', ' ')}</td></tr>
              <tr style={{ fontWeight: 700 }}>
                <th style={{ textAlign: 'left' }}>{t('orderDetail.summary.totalBrl')}</th>
                <td style={{ fontSize: 16, color: '#c00', fontWeight: 700 }}>R$ {d.total_amount_brl?.toFixed(2) ?? '—'}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <th style={{ textAlign: 'left' }}>{t('orderDetail.summary.totalUsd')}</th>
                <td style={{ fontSize: 16, fontWeight: 700 }}>USD {d.total_amount_usd?.toFixed(2) ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>🧾 {t('orderDetail.di.title')}</h3>
          <div className="row gap-sm">
            {diVersions.length > 0 && (
              <select
                className="form-input form-input-sm"
                style={{ width: 190 }}
                aria-label={t('orderDetail.di.historyLabel')}
                value={diHistory?.version || ''}
                onChange={e => handleDiVersion(e.target.value)}
              >
                <option value="">{t('orderDetail.di.currentDraft')}</option>
                {[...diVersions].sort((a, b) => b.version - a.version).map(version => (
                  <option key={version.version} value={version.version}>{t('orderDetail.di.viewVersion', { version: version.version })}</option>
                ))}
              </select>
            )}
            {di && <span className={`status-tag ${di.status === 'reviewed' ? 'status-done' : 'status-pending_fee'}`}>{di.status === 'reviewed' ? `${t('orderDetail.di.savedTag')}${di.review_version ? ` ${t('orderDetail.di.versionTag', { version: di.review_version })}` : ''}` : t('orderDetail.di.unsavedTag')}</span>}
          </div>
        </div>
        <div className="alert alert-warn">{t('orderDetail.di.disclaimer')}</div>

        {diHistory?.analysis && (
          <div style={{ marginTop: 16, padding: 16, border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb' }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{t('orderDetail.di.historyTitle', { version: diHistory.version })}</strong>
                <div className="muted text-sm">{t('orderDetail.di.reviewerLine', { name: diHistory.reviewed_by, time: diHistory.reviewed_at?.slice(0, 16).replace('T', ' ') })}</div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setDiHistory(null)}>{t('orderDetail.di.backToDraft')}</button>
            </div>
            <p className="muted text-sm">
              {t('orderDetail.di.paramsLine', {
                rmb: diHistory.analysis.parameters?.rmb_brl,
                insurance: diHistory.analysis.parameters?.insurance_brl,
                uf: diHistory.analysis.parameters?.uf,
                icms: (Number(diHistory.analysis.parameters?.icms_rate) * 100).toFixed(2),
                freight: diHistory.analysis.parameters?.freight_brl
              })}
              <br />{t('orderDetail.di.historyNote')}
            </p>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 1100 }}>
                <thead><tr><th>{t('orderDetail.di.productNcm')}</th><th>{t('orderDetail.di.valueRmbBrl')}</th><th>II %</th><th>IPI %</th><th>PIS %</th><th>COFINS %</th><th>CIF BRL</th><th>{t('orderDetail.di.taxEstimateBrl')}</th><th>{t('orderDetail.di.sources')}</th></tr></thead>
                <tbody>
                  {diHistory.analysis.items.map((item: any) => (
                    <tr key={item.row_no}>
                      <td style={{ minWidth: 240 }}>
                        <strong>{item.product_en}</strong>
                        <div className="muted text-sm">{t('orderDetail.di.rowSku', { row: item.row_no, sku: item.sku })}</div>
                        <code>{item.ncm}</code>
                        {item.rationale && <div className="muted text-sm" style={{ marginTop: 5 }}>{item.rationale}</div>}
                      </td>
                      <td><div>¥ {Number(item.merchandise_rmb).toFixed(2)}</div><div className="muted text-sm">R$ {Number(item.merchandise_brl).toFixed(2)}</div></td>
                      <td>{(Number(item.ii_rate) * 100).toFixed(2)}%</td>
                      <td>{(Number(item.ipi_rate) * 100).toFixed(2)}%</td>
                      <td>{(Number(item.pis_rate) * 100).toFixed(2)}%</td>
                      <td>{(Number(item.cofins_rate) * 100).toFixed(2)}%</td>
                      <td>R$ {Number(item.cif_brl).toFixed(2)}</td>
                      <td><strong>R$ {Number(item.di_brl).toFixed(2)}</strong><div className="muted text-sm">II {item.ii_brl} · IPI {item.ipi_brl}<br />PIS {item.pis_brl} · COFINS {item.cofins_brl}<br />ICMS {item.icms_brl}</div></td>
                      <td>{item.sources?.length ? item.sources.map((url: string, i: number) => <div key={url}><a href={url} target="_blank" rel="noreferrer">{t('orderDetail.di.source', { index: i + 1 })}</a></div>) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>{t('orderDetail.di.cifTotal', { amount: Number(diHistory.analysis.totals.cif_brl).toFixed(2) })}</strong>
              <div className="muted text-sm">II {diHistory.analysis.totals.ii_brl} · IPI {diHistory.analysis.totals.ipi_brl} · PIS {diHistory.analysis.totals.pis_brl} · COFINS {diHistory.analysis.totals.cofins_brl} · ICMS {diHistory.analysis.totals.icms_brl}</div>
              <div style={{ fontSize: 18, marginTop: 6 }}><strong>{t('orderDetail.di.taxTotal', { amount: Number(diHistory.analysis.totals.di_brl).toFixed(2) })}</strong></div>
            </div>
          </div>
        )}
        <div className="row gap-md di-params" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}><label>{t('orderDetail.di.rmbRate')}</label><input className="form-input form-input-sm" style={{ width: 150 }} type="number" min="0" step="0.0001" value={diParams.rmb_brl} onChange={e => setDiParams({ ...diParams, rmb_brl: e.target.value })} placeholder={t('orderDetail.di.rmbRatePlaceholder')} /></div>
          <div className="form-row" style={{ margin: 0 }}><label>{t('orderDetail.di.insurance')}</label><input className="form-input form-input-sm" style={{ width: 140 }} type="number" min="0" step="0.01" value={diParams.insurance_brl} onChange={e => setDiParams({ ...diParams, insurance_brl: Number(e.target.value) })} /></div>
          <div className="form-row" style={{ margin: 0 }}><label>{t('orderDetail.di.uf')}</label><input className="form-input form-input-sm" style={{ width: 80 }} maxLength={2} value={diParams.uf} onChange={e => setDiParams({ ...diParams, uf: e.target.value.toUpperCase() })} /></div>
          <div className="form-row" style={{ margin: 0 }}><label>{t('orderDetail.di.icms')}</label><input className="form-input form-input-sm" style={{ width: 100 }} type="number" min="0" max="99" step="0.01" value={diParams.icms_rate * 100} onChange={e => setDiParams({ ...diParams, icms_rate: Number(e.target.value) / 100 })} /></div>
          <button className="btn" disabled={diBusy || !d.line_items?.length || ['analyzing', 'calculating'].includes(di?.status)} onClick={handleDiAnalyze}>{diBusy ? t('orderDetail.di.analyzing') : Array.isArray(di?.items) ? t('orderDetail.di.reanalyze') : t('orderDetail.di.analyze')}</button>
        </div>

        {di && !Array.isArray(di.items) && <div className={di.status === 'failed' ? 'alert alert-err mt-12' : 'alert alert-warn mt-12'}>
          {di.status === 'failed' ? t('orderDetail.di.calcFailed', { message: di.error_message || t('orderDetail.di.retryLater') }) : t('orderDetail.di.processing')}
        </div>}
        {di && Array.isArray(di.items) && di.totals && (
          <>
            <div className="table-wrap" style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 1200 }}>
                <thead><tr><th>{t('orderDetail.di.productSuggestion')}</th><th>{t('orderDetail.di.confidence')}</th><th>{t('orderDetail.di.valueRmbBrl')}</th><th>II %</th><th>IPI %</th><th>PIS %</th><th>COFINS %</th><th>CIF BRL</th><th>DI BRL</th><th>{t('orderDetail.di.sources')}</th></tr></thead>
                <tbody>
                  {di.items.map((item: any) => (
                    <tr key={item.row_no}>
                      <td style={{ minWidth: 250 }}>
                        <strong>{item.product_en}</strong>
                        <div className="muted text-sm">{t('orderDetail.di.rowSkuHs', { row: item.row_no, sku: item.sku, hs: item.previous_ncm || '—' })}</div>
                        <input className="form-input form-input-sm" style={{ width: 130, marginTop: 5 }} maxLength={8} value={item.ncm}
                          onChange={e => updateDiItem(item.row_no, 'ncm', e.target.value.replace(/\D/g, ''))} />
                        {item.rationale && <div className="muted text-sm" style={{ marginTop: 5 }}>{item.rationale}</div>}
                      </td>
                      <td>{Math.round((item.confidence || 0) * 100)}%</td>
                      <td><div>¥ {Number(item.merchandise_rmb).toFixed(2)}</div><div className="muted text-sm">R$ {Number(item.merchandise_brl).toFixed(2)}</div></td>
                      {(['ii_rate', 'ipi_rate', 'pis_rate', 'cofins_rate'] as const).map(key => (
                        <td key={key}><input className="form-input form-input-sm" style={{ width: 72 }} type="number" min="0" step="0.01"
                          value={Math.round(item[key] * 10000) / 100}
                          onChange={e => updateDiItem(item.row_no, key, Number(e.target.value) / 100)} /></td>
                      ))}
                      <td>R$ {Number(item.cif_brl).toFixed(2)}</td>
                      <td><strong>R$ {Number(item.di_brl).toFixed(2)}</strong><div className="muted text-sm">II {item.ii_brl} · IPI {item.ipi_brl}<br />PIS {item.pis_brl} · COFINS {item.cofins_brl}<br />ICMS {item.icms_brl}</div></td>
                      <td>{item.sources?.length ? item.sources.map((url: string, i: number) => <div key={url}><a href={url} target="_blank" rel="noreferrer">{t('orderDetail.di.source', { index: i + 1 })}</a></div>) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-between" style={{ marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong>{t('orderDetail.di.cifTotal', { amount: Number(di.totals.cif_brl).toFixed(2) })}</strong><br />
                <span className="muted text-sm">II {di.totals.ii_brl} · IPI {di.totals.ipi_brl} · PIS {di.totals.pis_brl} · COFINS {di.totals.cofins_brl} · ICMS {di.totals.icms_brl}</span>
                <div style={{ fontSize: 20, marginTop: 6 }}><strong>{t('orderDetail.di.taxTotal', { amount: Number(di.totals.di_brl).toFixed(2) })}</strong></div>
              </div>
              <button className="btn" disabled={diBusy} onClick={handleDiReview}>{t('orderDetail.di.saveVersion')}</button>
              <button
                className="btn btn-ghost"
                disabled={diBusy || di.status !== 'reviewed'}
                title={di.status !== 'reviewed' ? t('orderDetail.di.saveFirst') : t('orderDetail.di.generateDdpHint')}
                onClick={handleDiDdp}
              >{t('orderDetail.di.generateDdp')}</button>
            </div>
            {di.reviewed_by && <p className="muted text-sm">{t('orderDetail.di.savedBy', { name: di.reviewed_by, time: di.reviewed_at?.slice(0, 16).replace('T', ' ') })}</p>}
          </>
        )}
      </div>

      {/* M7 国际物流：成交走柜后运营维护，客户端实时可见（仅 done 订单） */}
      {d.status === 'done' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🚢 {t('orderDetail.ship.title')}</h3>
            {curStage ? (
              <span className="text-sm">
                {t('orderDetail.ship.currentStage', { stage: t(SHIP_STAGE_KEYS[curStage] || curStage) })}
              </span>
            ) : (
              <span className="muted text-sm">{t('orderDetail.ship.emptyHint')}</span>
            )}
          </div>

          <div className="ship-form-grid">
            <div>
              <label>{t('orderDetail.ship.vessel')}</label>
              <input className="form-input form-input-sm" value={shipForm.vessel} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, vessel: e.target.value })} placeholder={t('orderDetail.ship.vesselPlaceholder')} />
            </div>
            <div>
              <label>{t('orderDetail.ship.voyage')}</label>
              <input className="form-input form-input-sm" value={shipForm.voyage} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, voyage: e.target.value })} placeholder={t('orderDetail.ship.voyagePlaceholder')} />
            </div>
            <div>
              <label>{t('orderDetail.ship.billNo')}</label>
              <input className="form-input form-input-sm" value={shipForm.bill_no} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, bill_no: e.target.value })} />
            </div>
            <div>
              <label>{t('orderDetail.ship.containerNo')}</label>
              <input className="form-input form-input-sm" value={shipForm.container_no} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, container_no: e.target.value })} placeholder={t('orderDetail.ship.containerNoPlaceholder')} />
            </div>
            <div>
              <label>{t('orderDetail.ship.pol')}</label>
              <input className="form-input form-input-sm" value={shipForm.pol} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, pol: e.target.value })} placeholder={t('orderDetail.ship.polPlaceholder')} />
            </div>
            <div>
              <label>{t('orderDetail.ship.pod')}</label>
              <input className="form-input form-input-sm" value={shipForm.pod} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, pod: e.target.value })} placeholder={t('orderDetail.ship.podPlaceholder')} />
            </div>
            <div>
              <label>{t('orderDetail.ship.etd')}</label>
              <input type="date" className="form-input form-input-sm" value={shipForm.etd} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, etd: e.target.value })} />
            </div>
            <div>
              <label>{t('orderDetail.ship.eta')}</label>
              <input type="date" className="form-input form-input-sm" value={shipForm.eta} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, eta: e.target.value })} />
            </div>
            <div className="span-2">
              <label>{t('orderDetail.ship.remark')}</label>
              <textarea className="form-input form-input-sm" rows={2} value={shipForm.remark} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, remark: e.target.value })} placeholder={t('orderDetail.ship.remarkPlaceholder')} />
            </div>
          </div>
          <div className="row gap-md mt-12">
            <button className="btn" disabled={shipSaving} onClick={handleShipSave}>
              {shipSaving ? t('common.saving') : t('orderDetail.ship.save')}
            </button>
          </div>

          {/* M7 优化：流程进度条（已过实心 / 当前绿色 / 未来灰） */}
          <div className="ship-flow">
            {SHIP_FLOW.map((s, i) => (
              <div key={s}
                className={`ship-flow-step${i <= doneIdx ? ' done' : ''}${i === doneIdx ? ' cur' : ''}`}
                title={t(SHIP_STAGE_KEYS[s] || s)}>
                <span className="ship-flow-dot" />
                <span className="ship-flow-name">{t(FLOW_SHORT_KEYS[s] || s)}</span>
              </div>
            ))}
          </div>

          {/* 节点时间线管理（竖向时间线，与客户端视觉统一） */}
          <div className="ship-ev-section">
            <div className="muted text-sm" style={{ marginBottom: 8 }}>
              📍 {t('orderDetail.ship.timelineTitle')}
            </div>
            {shipEvents.length > 0 && (
              <div className="ship-timeline">
                {shipEvents.map((ev, i) => (
                  <div className={`ship-tl-item${i === shipEvents.length - 1 ? ' cur' : ''}`} key={ev.id}>
                    <span className="ship-tl-dot" />
                    <div className="ship-tl-body">
                      <div className="ship-tl-head">
                        <span className="deal-tag deal-open">{SHIP_STAGE_KEYS[ev.stage] ? t(SHIP_STAGE_KEYS[ev.stage]) : ev.stage}</span>
                        <span className="muted text-sm">{ev.happened_at.slice(0, 16).replace('T', ' ')}</span>
                        <button className="btn btn-sm btn-ghost ship-tl-del" disabled={shipBusy}
                          title={t('orderDetail.ship.deleteEvent')} onClick={() => handleEvDel(ev.id)}>✕</button>
                      </div>
                      {ev.note && <div className="muted text-sm" style={{ marginTop: 2 }}>{ev.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {shipEvents.length === 0 && (
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>{t('orderDetail.ship.noEvents')}</p>
            )}

            {/* M7 优化：一键推进（时间记为现在） */}
            <div className="ship-advance">
              {evNextStage ? (
                <>
                  <button className="btn" disabled={shipBusy} onClick={handleEvAdvance}>
                    ⚡ {t('orderDetail.ship.advanceTo', { stage: t(SHIP_STAGE_KEYS[evNextStage]) })}
                  </button>
                  <input className="form-input form-input-sm" style={{ flex: 1, minWidth: 200 }}
                    placeholder={t('orderDetail.ship.advanceNote')}
                    value={evForm.note} disabled={shipBusy}
                    onChange={e => setEvForm({ ...evForm, note: e.target.value })} />
                </>
              ) : (
                <span className="ok-msg">{t('orderDetail.ship.flowDone')}</span>
              )}
            </div>

            {/* 自定义添加：补录历史节点 / 跳阶段 */}
            <div className="row gap-md mt-8" style={{ flexWrap: 'wrap' }}>
              <select className="form-input form-input-sm" style={{ width: 150 }} value={evForm.stage}
                disabled={shipBusy} onChange={e => setEvForm({ ...evForm, stage: e.target.value })}
                title={t('orderDetail.ship.stageDefaultHint')}>
                {Object.keys(SHIP_STAGE_KEYS).map(k => (
                  <option key={k} value={k}>{t(SHIP_STAGE_KEYS[k])}</option>
                ))}
              </select>
              <input type="datetime-local" className="form-input form-input-sm" style={{ width: 200 }}
                value={evForm.at} disabled={shipBusy} title={t('orderDetail.ship.eventTime')}
                onChange={e => setEvForm({ ...evForm, at: e.target.value })} />
              <input className="form-input form-input-sm" style={{ width: 220 }} placeholder={t('orderDetail.ship.eventNote')}
                value={evForm.note} disabled={shipBusy}
                onChange={e => setEvForm({ ...evForm, note: e.target.value })} />
              <button className="btn btn-sm" disabled={shipBusy} onClick={handleEvAdd}>➕ {t('orderDetail.ship.addCustom')}</button>
              <span className="muted text-sm" style={{ alignSelf: 'center' }}>{t('orderDetail.ship.addCustomHint')}</span>
            </div>
          </div>
        </div>
      )}

      {/* M8 交付文件：放行截图 / 发票 PDF（操作员上传给客户查看/下载） */}
      {d.status === 'done' && (
        <div className="card">
          <div className="card-title">
            <h3>📎 {t('orderDetail.files.title')}</h3>
            <span className="muted text-sm">{t('orderDetail.files.hint')}</span>
          </div>
          {/* M9：开票抬头（客户维护并绑定到订单，开 NF 时使用） */}
          {d.invoice_cnpj ? (
            <div className="order-file-row" style={{ marginBottom: 12, background: '#fffbeb', borderColor: '#f59e0b' }}>
              <span className="deal-tag deal-open">{t('orderDetail.files.nfCompany')}</span>
              <span className="text-sm">{d.invoice_cnpj.company_name}</span>
              <span className="text-sm" style={{ fontFamily: 'monospace', fontWeight: 600 }}>CNPJ: {d.invoice_cnpj.cnpj}</span>
              <span className="text-sm" style={{ fontFamily: 'monospace', fontWeight: 600 }}>IE: {d.invoice_cnpj.ie || t('orderDetail.files.ieMissing')}</span>
              <span className="muted text-sm">{t('orderDetail.files.nfHint')}</span>
            </div>
          ) : (
            <p className="muted text-sm" style={{ margin: '0 0 12px' }}>
              {t('orderDetail.files.noCnpj')}
            </p>
          )}
          <div className="row gap-md order-file-upload" style={{ flexWrap: 'wrap' }}>
            <select className="form-input form-input-sm" style={{ width: 150 }} value={fileKind}
              disabled={fileBusy} onChange={e => setFileKind(e.target.value as any)}>
              <option value="clearance_shot">🖼 {t('orderDetail.fileKind.clearanceShot')}</option>
              <option value="invoice">🧾 {t('orderDetail.fileKind.invoice')}</option>
              <option value="other">📄 {t('orderDetail.fileKind.other')}</option>
            </select>
            <input className="form-input form-input-sm" style={{ width: 240 }} placeholder={t('orderDetail.files.notePlaceholder')}
              value={fileNote} disabled={fileBusy} onChange={e => setFileNote(e.target.value)} />
            <input type="file" accept="image/*,application/pdf" multiple disabled={fileBusy}
              onChange={onFilePick} title={t('orderDetail.files.pickTitle')} />
            <button className="btn btn-sm" disabled={pickFiles.length === 0 || fileBusy} onClick={doFileUpload}>
              📤 {t('orderDetail.files.upload')}{pickFiles.length > 0 ? t('orderDetail.files.uploadCount', { count: pickFiles.length }) : ''}
            </button>
          </div>
          {orderFiles.length > 0 ? (
            <div className="order-file-list mt-12">
              {orderFiles.map(f => (
                <div className="order-file-row" key={f.id}>
                  <span className="deal-tag deal-open">{FILE_KIND_KEYS[f.kind] ? t(FILE_KIND_KEYS[f.kind]) : f.kind}</span>
                  <span className="text-sm" title={f.file_name}
                    style={{ minWidth: 0, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {/^image\//.test(f.mime_type) ? '🖼' : '🧾'} {f.file_name}
                  </span>
                  <span className="muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                    {(f.size_bytes / 1024).toFixed(0)} KB · {f.created_at?.slice(0, 10)}
                  </span>
                  {f.note && <span className="muted text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note}</span>}
                  <button className="btn btn-sm btn-ghost" disabled={fileBusy} title={t('orderDetail.files.download')} onClick={() => doFileDownload(f)}>⬇</button>
                  <button className="btn btn-sm btn-ghost" disabled={fileBusy} title={t('common.delete')} onClick={() => doFileDelete(f.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm" style={{ margin: '12px 0 0' }}>
              {t('orderDetail.files.empty')}
            </p>
          )}
        </div>
      )}

      {/* 下：客户填写的 Excel 行数据（末列为该行对应的明细截图） */}
      {(d.line_items?.length || shots.length) ? (
        <div className="card">
          <div className="card-title">
            <h3>📋 {t('orderDetail.lines.title')}</h3>
            <span className="muted text-sm">
              {t('orderDetail.lines.summary', { rows: d.line_items?.length || 0, cols: liKeys.length })}{shots.length > 0 ? t('orderDetail.lines.shotsSuffix', { count: shots.length }) : ''}{t('orderDetail.lines.priceHint')}
            </span>
          </div>
          <div className="table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Row</th>
                    {liKeys.map(k => <th key={k}>{FIELD_LABEL_KEYS[k] ? t(FIELD_LABEL_KEYS[k]) : k}</th>)}
                    {shots.length > 0 && <th style={{ width: 150 }}>🖼 {t('orderDetail.lines.image')}</th>}
                    <th style={{ width: 160 }} title={t('orderDetail.lines.priceColumnHint')}>{t('orderDetail.lines.priceColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.line_items || []).map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td><strong>{it.row_no}</strong></td>
                      {liKeys.map(k => (
                        <td key={k}>
                          {typeof it[k] === 'number' ? (
                            k === 'unit_cbm' ? it[k]?.toFixed(4) : it[k]?.toFixed?.(3) ?? it[k]
                          ) : (
                            k === 'hs_code' ? <code style={{ fontSize: 12 }}>{it[k] ?? '—'}</code> : (it[k] ?? '—')
                          )}
                        </td>
                      ))}
                      {shots.length > 0 && (
                        <td style={{ verticalAlign: 'top', padding: 10 }}>
                          {(shotsByRow.get(Number(it.row_no)) || []).length > 0
                            ? renderShots(shotsByRow.get(Number(it.row_no))!)
                            : <span className="muted text-sm">—</span>}
                        </td>
                      )}
                      <td style={{ verticalAlign: 'middle' }}>
                        {Number(it.unit_price) > 0 ? (
                          <span className="adj-cell">
                            <input
                              type="number" step="0.01" min={0.0001} max={10000}
                              placeholder="%"
                              aria-label={t('orderDetail.lines.rowPriceLabel', { row: it.row_no })}
                              title={t('orderDetail.lines.rowPriceHint')}
                              value={adjPct[it.row_no] || ''}
                              disabled={priceBusyRow !== null}
                              onChange={e => setAdjPct(prev => ({ ...prev, [it.row_no]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleAdjustPrice(Number(it.row_no)); }}
                            />
                            <button
                              className="btn btn-sm"
                              disabled={priceBusyRow !== null || !(adjPct[it.row_no] || '').trim()}
                              title={t('orderDetail.lines.applyHint')}
                              onClick={() => handleAdjustPrice(Number(it.row_no))}
                            >{priceBusyRow === Number(it.row_no) ? '…' : t('orderDetail.lines.apply')}</button>
                          </span>
                        ) : (
                          <span className="muted text-sm" title={t('orderDetail.lines.noPrice')}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* 行数据为空但存在截图：单行仅渲染图片单元格 */}
                  {(!d.line_items || d.line_items.length === 0) && shots.length > 0 && (
                    <tr>
                      <td colSpan={liKeys.length + 1} className="muted text-sm">{t('orderDetail.lines.noRows')}</td>
                      <td style={{ verticalAlign: 'top', padding: 10 }}>{renderShots(shots)}</td>
                      <td><span className="muted text-sm">—</span></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 未关联到具体行的截图（整单维度） */}
          {unboundShots.length > 0 && (
            <div className="mt-12">
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>🖼 {t('orderDetail.lines.unboundShots', { count: unboundShots.length })}</p>
              {renderShots(unboundShots)}
            </div>
          )}
        </div>
      ) : null}

      {/* 截图放大预览 */}
      {shotPreview && (
        <div className="img-preview-mask" onClick={() => setShotPreview(null)}>
          <div className="img-preview-body" onClick={e => e.stopPropagation()}>
            <div className="row-between mb-8">
              <strong className="text-sm">{shotPreview.name}</strong>
              <button className="btn btn-sm btn-ghost" onClick={() => setShotPreview(null)}>{t('common.close')} ✕</button>
            </div>
            <img src={shotPreview.url} alt={shotPreview.name} />
          </div>
        </div>
      )}
    </div>
  );
}
