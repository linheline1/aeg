import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  input_file_name: string | null; total_rows?: number; valid_rows?: number;
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

const FIELD_LABELS: Record<string, string> = {
  row_no: '行号', carton_no: '箱号', sku: 'SKU', product_cn: '品名 CN',
  product_en: '品名 EN', hs_code: 'HS Code', cartons: '箱数', pcs_per_carton: '件数/箱',
  total_pcs: '总件数', nw_per_carton: '净重/箱', gw_per_carton: '毛重/箱', total_gw: '总毛重',
  length_cm: '长 cm', width_cm: '宽 cm', height_cm: '高 cm', unit_cbm: '体积 CBM',
  unit_price: '计价单价 RMB', base_unit_price: '原单价 RMB',
  material: '材质', destination: '目的地', remark: '备注'
};

const STATUS_CN: Record<string, string> = {
  uploaded: '已上传', validating: '校验中', pending_fee: '待核算',
  computing: '计算中', done: '已完成', failed: '失败'
};
/** M4 成交状态 */
const DEAL_CN: Record<string, string> = { open: '跟进中', won: '已成交', lost: '未成交' };
/** M7 物流节点阶段（清关环节细化为三节点） */
const SHIP_STAGE_CN: Record<string, string> = {
  booked: '已订舱', loaded: '已装柜', customs_cn: '中国报关', departed: '已开船',
  on_water: '海运途中', arrived: '已到港', customs_br: '巴西清关中',
  duty_paid: '关税已缴', cleared: '清关放行', delivered: '已签收'
};
/** M7 物流流程顺序（进度条 / 一键推进 / 智能默认） */
const SHIP_FLOW = ['booked', 'loaded', 'customs_cn', 'departed', 'on_water', 'arrived', 'customs_br', 'duty_paid', 'cleared', 'delivered'];
/** 进度条上的阶段短名 */
const FLOW_SHORT: Record<string, string> = {
  booked: '订舱', loaded: '装柜', customs_cn: '报关', departed: '开船',
  on_water: '海运', arrived: '到港', customs_br: '清关中', duty_paid: '缴税',
  cleared: '放行', delivered: '签收'
};
/** 可触发核算的状态（M3 状态机，computing 视为重启残留可重试） */
const COMPUTABLE = new Set(['uploaded', 'pending_fee', 'failed', 'computing']);
/** M8 交付文件类型 */
const FILE_KIND_CN: Record<string, string> = { clearance_shot: '放行截图', invoice: '发票PDF', other: '其他' };

export default function OrderDetail() {
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
  const customsApprovalHint = '需由报关行批准当前 DI 版本后才能进行此操作';
  const checkCurrentCustomsApproval = (action: string) => {
    if (currentCustomsApproved) return true;
    setErr(`报关行尚未批准当前 DI 版本，不能${action}`);
    return false;
  };

  /** M3：按费率表核算并发布（uploaded/pending_fee/failed → computing → done） */
  const handleCompute = async () => {
    if (diAmountOf(d) == null) { setErr('请先生成 DI（NCM / DI 进口税费预估）后再核算参考 DDP'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/compute`, {});
      flashMsg(`✅ 核算完成 ${r.data.quote_no} → R$ ${r.data.total_amount_brl?.toFixed(2)}`);
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const handleAdjustPrice = async (rowNo: number) => {
    const raw = (adjPct[rowNo] || '').trim();
    const pct = Number(raw);
    if (!raw || !Number.isFinite(pct) || pct <= 0 || pct > 10000) {
      flashMsg('请输入大于 0 的计价百分比，例如 30 表示按原单价的 30% 计价');
      return;
    }
    setPriceBusyRow(rowNo); setErr(null);
    try {
      const r = await api.patch(`/api/ops/orders/${id}/line-items/${rowNo}/price`, { percent: pct });
      const parts = [`行 ${rowNo}：原价 ¥${r.data.base_unit_price} × ${pct}% = ¥${r.data.unit_price}`];
      parts.push(`行总价 ¥${r.data.total_price}；整柜货值 ¥${r.data.total_amount_rmb}`);
      if (r.data.total_amount_brl != null) {
        parts.push(`参考 DDP R$ ${Number(r.data.total_amount_brl).toFixed(2)}；请等待报关行重新确认`);
      } else {
        parts.push('订单已回到「已上传」，请重新核算发布');
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
    if (next === 'failed' && !window.confirm('确定标记该订单为失败？客户将看不到此报价。')) return;
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/status`, { status: next });
      flashMsg(next === 'failed' ? '已标记失败' : '已重新开启核算');
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setBusy(false); }
  };

  const handleRecompute = async () => {
    if (diAmountOf(d) == null) { setErr('请先生成 DI（NCM / DI 进口税费预估）后再重新计算参考 DDP'); return; }
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
      setFlash(`✅ 已保存参考 DDP 预估 ${r.data.quote_no} → R$ ${r.data.total_amount_brl.toFixed(2)} / USD ${r.data.total_amount_usd.toFixed(2)}`);
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
    } catch (e: any) { alert('下载失败: ' + (e?.response?.data?.message || e?.message)); }
  };

  const diPayload = () => ({
    rmb_brl: Number(diParams.rmb_brl),
    insurance_brl: Number(diParams.insurance_brl),
    uf: diParams.uf,
    icms_rate: Number(diParams.icms_rate)
  });

  const handleDiAnalyze = async () => {
    if (!diParams.rmb_brl) { setErr('请填写 RMB → BRL 汇率'); return; }
    setDiBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/di/analyze`, diPayload());
      setDi(r.data);
      setD(prev => prev ? { ...prev, di_analysis: r.data } : prev);
      flashMsg('✅ AI NCM 分析与 DI 计算完成，请核对后保存 DI 版本');
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || 'NCM 分析失败'); }
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
      flashMsg(`✅ 已保存 DI 版本 v${r.data.review_version}，可生成参考 DDP；报关行批准后才能标记成交`);
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || 'DI 版本保存失败'); }
    finally { setDiBusy(false); }
  };

  const handleDiVersion = async (value: string) => {
    setErr(null);
    setDiHistory(null);
    if (!value) return;
    try {
      const r = await api.get(`/api/ops/orders/${id}/di/versions/${value}`);
      setDiHistory(r.data);
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || 'DI 历史版本加载失败'); }
  };

  const handleDiDdp = async () => {
    setDiBusy(true); setErr(null);
    try {
      const r = await api.post(`/api/ops/orders/${id}/di/ddp`);
      flashMsg(`✅ 已按 DI 版本 v${di?.review_version} + 默认运费生成参考 DDP：R$ ${r.data.total_amount_brl?.toFixed(2)}`);
      load();
    } catch (e: any) { setErr(e?.response?.data?.message || e?.message || 'DDP 生成失败'); }
    finally { setDiBusy(false); }
  };

  /** M4：成交标记（won/lost/open） */
  const handleDeal = async (next: 'won' | 'lost' | 'open') => {
    if (next === 'won' && !checkCurrentCustomsApproval('标记成交')) return;
    let note: string | undefined;
    if (next === 'lost') {
      note = window.prompt('未成交原因（可选，将记入审计日志）：') ?? undefined;
    }
    setBusy(true); setErr(null);
    try {
      await api.patch(`/api/ops/orders/${id}/deal`, {
        deal_status: next,
        ...(note !== undefined ? { note } : {})
      });
      flashMsg(next === 'won' ? '✅ 已标记成交' : next === 'lost' ? '已标记未成交' : '已恢复跟进中');
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
      flashMsg('✅ 业务员已更新');
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
      flashMsg('✅ 物流信息已保存');
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
      flashMsg('✅ 物流节点已添加');
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
      flashMsg(`✅ 已推进到「${SHIP_STAGE_CN[evNextStage]}」`);
      setEvForm({ stage: evNextStage, at: '', note: '' });
      load();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setShipBusy(false); }
  };

  /** M7：删除误录的物流节点 */
  const handleEvDel = async (eventId: string) => {
    if (!window.confirm('确定删除该物流节点？')) return;
    setShipBusy(true); setErr(null);
    try {
      await api.delete(`/api/ops/orders/${id}/shipment/events/${eventId}`);
      flashMsg('物流节点已删除');
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
      flashMsg(`✅ 已上传 ${r.data.count} 个文件，客户端可见`);
      setPickFiles([]); setFileNote('');
      loadFiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setFileBusy(false); }
  };

  const doFileDelete = async (fid: string) => {
    if (!window.confirm('确定删除该文件？客户端将不再可见。')) return;
    setFileBusy(true); setErr(null);
    try {
      await api.delete(`/api/ops/files/${fid}`);
      flashMsg('文件已删除');
      loadFiles();
    } catch (e: any) {
      setErr(getApiErrorMessage(e));
    } finally { setFileBusy(false); }
  };

  const doFileDownload = async (f: any) => {
    try {
      const r = await api.get(`/api/ops/files/${f.id}/file`, { responseType: 'blob' });
      await downloadOrShareFile(new Blob([r.data], { type: f.mime_type }), f.file_name);
    } catch (e: any) { alert('下载失败: ' + (e?.response?.data?.message || e?.message)); }
  };

  if (err && !d) return <div className="card"><p className="err-msg">❌ {err}</p><Link to="/orders">← 返回列表</Link></div>;
  if (!d) return <div className="card"><p>加载中…</p></div>;

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
  const noDiHint = '请先生成 DI（NCM / DI 进口税费预估）后再计算参考 DDP';

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
            : <span className="muted text-sm">加载中…</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="order-detail">
      <div className="page-title">
        <h1>
          <Link to="/orders" className="btn-link">← 返回</Link> &nbsp;
          报价单 <code>{d.quote_no}</code>
        </h1>
        <div className="row gap-md">
          <span className={`status-tag status-${d.status}`}>{STATUS_CN[d.status] || d.status}</span>
          {d.input_file_name && <button onClick={handleDownload} className="btn">📥 原 Excel</button>}
        </div>
      </div>

      {flash && <div className="alert alert-ok">{flash}</div>}
      {err && <div className="alert alert-err">❌ {err}</div>}

      <div className={`alert ${currentCustomsApproved ? 'alert-ok' : 'alert-warn'}`}>
        <strong>
          报关审核：{!d.customs_review
            ? '尚未提交'
            : d.customs_review.status === 'pending'
              ? '等待报关行'
              : d.customs_review.status === 'changes_requested'
                ? '需修改'
                : `已批准${d.customs_review.di_review_version != null ? ` v${d.customs_review.di_review_version}` : ''}`}
        </strong>
        {d.customs_review?.status === 'approved' && !currentCustomsApproved && (
          <span style={{ marginLeft: 8 }}>批准版本与当前 DI 版本不匹配，需重新提交报关行审核。</span>
        )}
        {(d.customs_review?.reviewed_by || d.customs_review?.reviewed_at) && (
          <div className="text-sm" style={{ marginTop: 4 }}>
            复核人：{d.customs_review.reviewed_by || '—'}
            {d.customs_review.reviewed_at && ` · ${d.customs_review.reviewed_at.slice(0, 16).replace('T', ' ')}`}
          </div>
        )}
        {d.customs_review?.status === 'changes_requested' && d.customs_review.note && (
          <div style={{ marginTop: 4 }}>需修改备注：{d.customs_review.note}</div>
        )}
      </div>

      {/* M3 状态机工作条 */}
      {COMPUTABLE.has(d.status) && (
        <div className="alert alert-warn row-between order-workbar" style={{ alignItems: 'center' }}>
          <div>
            <strong>{d.status === 'failed' ? '⚠️ 该订单已标记失败' : '⏳ 该订单待核算'}</strong>
            <span className="text-sm" style={{ marginLeft: 8 }}>
              {d.status === 'failed'
                ? (d.error_message || '可修改费率后重新核算')
                : !hasDi
                  ? '尚未生成 DI，请先生成 NCM / DI 进口税费预估'
                  : '可按费率表生成参考 DDP；报关行批准仅影响最终成交'}
            </span>
          </div>
          <div className="row gap-sm">
            <button
              className="btn"
              disabled={busy || !hasDi}
              onClick={handleCompute}
              title={!hasDi ? noDiHint : undefined}
            >
              {busy ? '处理中…' : '⚡ 按费率表核算并发布'}
            </button>
            {d.status !== 'failed'
              ? <button className="btn btn-ghost" disabled={busy} onClick={() => handleStatus('failed')}>标记失败</button>
              : <button className="btn btn-ghost" disabled={busy} onClick={() => handleStatus('pending_fee')}>重新开启</button>}
          </div>
        </div>
      )}

      {/* M4 成交状态工作条：仅 done 报价可标记 */}
      {d.status === 'done' && (
        <div className="alert alert-warn row-between order-workbar" style={{ alignItems: 'center' }}>
          <div>
            <strong>🤝 成交跟进</strong>
            <span className="text-sm" style={{ marginLeft: 8 }}>
              当前：
              <span className={
                d.deal_status === 'won' ? 'deal-tag deal-won'
                : d.deal_status === 'lost' ? 'deal-tag deal-lost'
                : d.deal_status === 'open' ? 'deal-tag deal-open'
                : 'deal-tag deal-none'
              }>
                {d.deal_status ? DEAL_CN[d.deal_status] : '未标记'}
              </span>
              {d.deal_closed_at && (
                <span className="muted" style={{ marginLeft: 6 }}>
                  {d.deal_status === 'won' ? '成交于' : '标记于'} {d.deal_closed_at.slice(0, 16).replace('T', ' ')}
                </span>
              )}
              {d.deal_note && <span className="muted" style={{ marginLeft: 6 }}>备注：{d.deal_note}</span>}
            </span>
          </div>
          <div className="row gap-sm">
            {d.deal_status !== 'won' && (
              <button
                className="btn"
                disabled={busy || !currentCustomsApproved}
                title={!currentCustomsApproved ? customsApprovalHint : undefined}
                onClick={() => handleDeal('won')}
              >✅ 标记成交</button>
            )}
            {d.deal_status !== 'lost' && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => handleDeal('lost')}>✗ 标记未成交</button>
            )}
            {d.deal_status && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => handleDeal('open')}>恢复跟进</button>
            )}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* 左：DDP 可编辑面板 */}
        <div className="card">
          <div className="card-title">
            <h3>💰 参考 DDP 预估 · 编辑费率</h3>
            <div className="row gap-sm">
              {meta?.is_reference && <span className="deal-tag deal-open">参考 DDP 预估</span>}
              <span className="muted text-sm">运营端 · 可修改后重新计算</span>
            </div>
          </div>
          <p className="muted text-sm mt-8">
            公式：销售税基 =（DI + 货值）×（1 + 20% 加成）+ 国际运费；销售税务 = 税基 × 6.5%；
            参考 DDP = 税务 + DI + 国际运费 + 其他成本 + 每票利润。
            修改后点「重新计算并保存」，客户端看到的是更新后的<strong>参考预估</strong>，不构成最终成交价。
          </p>

          <div className="table-wrap mt-12">
            <table className="table">
              <thead>
                <tr>
                  <th>费用项</th>
                  <th style={{ width: 180 }}>参数</th>
                  <th style={{ width: 140 }}>当前值</th>
                  <th style={{ width: 80 }}>单位</th>
                  <th className="amt">行小计 (BRL)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>整柜海运费</td>
                  <td>
                    <label className="text-sm muted">一口价（USD/整柜）</label>
                    <input
                      type="number" step="1"
                      className="form-input"
                      value={fees.ocean_freight_usd}
                      onChange={e => setFees({ ...fees, ocean_freight_usd: Number(e.target.value) })}
                      disabled={saving}
                    />
                  </td>
                  <td>USD {fees.ocean_freight_usd}</td>
                  <td>USD/柜</td>
                  <td className="amt">{previewOceanBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>起运港杂费</td>
                  <td>
                    <label className="text-sm muted">固定（USD）</label>
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
                  <td>巴西进口税费（DI）</td>
                  <td>
                    <span className="muted text-sm">
                      只读 · 来源于订单 DI 分析{meta?.di_review_version ? `（DI 版本 v${meta.di_review_version}）` : ''}
                    </span>
                  </td>
                  <td>{hasDi ? `R$ ${diBrl!.toFixed(2)}` : '未生成 DI'}</td>
                  <td>BRL</td>
                  <td className="amt">{hasDi ? diBrl!.toFixed(2) : '—'}</td>
                </tr>
                <tr>
                  <td>申报货值</td>
                  <td><span className="muted text-sm">只读 · 来源于 AI DI 分析的货值（BRL）</span></td>
                  <td>R$ {merchandiseBrl.toFixed(2)}</td>
                  <td>BRL</td>
                  <td className="amt">{merchandiseBrl.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>税基利润加成</td>
                  <td>
                    <label className="text-sm muted">（DI + 货值）× 加成（%）</label>
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
                  <td>销售税务</td>
                  <td>
                    <label className="text-sm muted">销售税基 × 税率（%）</label>
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
                  <td>每票利润</td>
                  <td>
                    <label className="text-sm muted">固定（BRL/票）</label>
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
                  <td colSpan={4}>汇率（USD→BRL）</td>
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
                  <td colSpan={4}>销售税基（DI + 货值 + 20%加成 + 国际运费）</td>
                  <td className="amt">{previewTaxBaseBrl.toFixed(2)}</td>
                </tr>
                <tr className="pricing-subtotal">
                  <td colSpan={4}>巴西段小计（DI + 销售税务 + 每票利润）</td>
                  <td className="amt">{previewBrazilSegment.toFixed(2)}</td>
                </tr>
                <tr className="pricing-total">
                  <td colSpan={4}>参考 DDP 合计（BRL）</td>
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
                订单已保存的分项（API 返回{meta?.calculation_version ? ` · 计算版本 ${meta.calculation_version}` : ''}）
              </div>
              <table className="table">
                <thead>
                  <tr><th>分项</th><th>说明</th><th className="amt">金额 (BRL)</th></tr>
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
                    <td colSpan={2}>分项合计</td>
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
              title={!hasDi ? noDiHint : '按当前参数重新计算并写回订单'}
              className="btn btn-lg"
              style={{ background: hasDi ? '#2563eb' : undefined }}
            >
              {saving ? '计算中…' : '🔄 重新计算并保存'}
            </button>
            <button onClick={load} className="btn btn-ghost btn-lg">取消更改</button>
          </div>
        </div>

        {/* 右：货物汇总 */}
        <div className="card">
          <div className="card-title">
            <h3>📊 货物汇总</h3>
          </div>
          <table className="table">
            <tbody>
              <tr><th style={{ width: 140, textAlign: 'left' }}>客户</th><td>{d.client_name || '—'} <code style={{ fontSize: 11 }}>{d.client_id}</code></td></tr>
              <tr>
                <th style={{ textAlign: 'left' }}>归属业务员</th>
                <td>
                  <select
                    className="form-input form-input-sm"
                    style={{ width: 160 }}
                    value={d.salesperson_id || ''}
                    disabled={busy}
                    onChange={e => handleAssign(e.target.value)}
                    title="改派业务员（清空 = 回到客户默认归属）"
                  >
                    <option value="">未分配</option>
                    {salespeople.map(s => (
                      <option key={s.id} value={s.id}>{s.username}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr><th style={{ textAlign: 'left' }}>模板版本</th><td>v{d.template_version}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>有效行</th><td>{d.valid_rows} / {d.total_rows}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>总体积</th><td>{d.total_cbm?.toFixed(3) ?? '—'} CBM</td></tr>
              <tr><th style={{ textAlign: 'left' }}>总毛重</th><td>{d.total_gw_kg?.toFixed(2) ?? '—'} kg</td></tr>
              <tr><th style={{ textAlign: 'left' }}>整柜申报金额（RMB）</th><td>¥ {d.total_amount_rmb?.toFixed(2) ?? '—'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>申报币种</th><td>{d.declared_currency === 'USD' ? 'USD（已按汇率折算为 RMB）' : 'RMB'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>上传文件</th><td>{d.input_file_name || '—'}</td></tr>
              <tr><th style={{ textAlign: 'left' }}>最后修改</th><td>{d.updated_at?.slice(0, 19).replace('T', ' ')}</td></tr>
              <tr style={{ fontWeight: 700 }}>
                <th style={{ textAlign: 'left' }}>当前 BRL 合计</th>
                <td style={{ fontSize: 16, color: '#c00', fontWeight: 700 }}>R$ {d.total_amount_brl?.toFixed(2) ?? '—'}</td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <th style={{ textAlign: 'left' }}>当前国际海运费 USD</th>
                <td style={{ fontSize: 16, fontWeight: 700 }}>USD {d.total_amount_usd?.toFixed(2) ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <h3>🧾 NCM / DI 进口税费预估</h3>
          <div className="row gap-sm">
            {diVersions.length > 0 && (
              <select
                className="form-input form-input-sm"
                style={{ width: 190 }}
                aria-label="DI 历史版本"
                value={diHistory?.version || ''}
                onChange={e => handleDiVersion(e.target.value)}
              >
                <option value="">当前编辑</option>
                {[...diVersions].sort((a, b) => b.version - a.version).map(version => (
                  <option key={version.version} value={version.version}>查看历史版本 v{version.version}</option>
                ))}
              </select>
            )}
            {di && <span className={`status-tag ${di.status === 'reviewed' ? 'status-done' : 'status-pending_fee'}`}>{di.status === 'reviewed' ? `已保存 DI 版本${di.review_version ? ` v${di.review_version}` : ''}` : '待保存 DI 版本'}</span>}
          </div>
        </div>
        <div className="alert alert-warn">AI 仅用于检索和建议 NCM。请核对官方来源、NCM 与税率；进口税费由系统按固定公式预估，DI 即可生成参考 DDP。报关行批准当前 DI 版本后才可标记成交，客户端展示的 DDP 为参考预估，不构成最终报价。</div>

        {diHistory?.analysis && (
          <div style={{ marginTop: 16, padding: 16, border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb' }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>历史版本 v{diHistory.version}（只读）</strong>
                <div className="muted text-sm">复核人：{diHistory.reviewed_by} · {diHistory.reviewed_at?.slice(0, 16).replace('T', ' ')}</div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setDiHistory(null)}>返回当前编辑</button>
            </div>
            <p className="muted text-sm">
              参数：RMB → BRL {diHistory.analysis.parameters?.rmb_brl} · 保险 R$ {diHistory.analysis.parameters?.insurance_brl} · UF {diHistory.analysis.parameters?.uf} · ICMS {(Number(diHistory.analysis.parameters?.icms_rate) * 100).toFixed(2)}% · 国际运费 R$ {diHistory.analysis.parameters?.freight_brl}
              <br />历史快照仅供查看，不会修改当前草稿或报价。
            </p>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 1100 }}>
                <thead><tr><th>产品 / NCM</th><th>货值 RMB / BRL</th><th>II %</th><th>IPI %</th><th>PIS %</th><th>COFINS %</th><th>CIF BRL</th><th>进口税费预估 BRL</th><th>官方来源</th></tr></thead>
                <tbody>
                  {diHistory.analysis.items.map((item: any) => (
                    <tr key={item.row_no}>
                      <td style={{ minWidth: 240 }}>
                        <strong>{item.product_en}</strong>
                        <div className="muted text-sm">行 {item.row_no} · {item.sku}</div>
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
                      <td>{item.sources?.length ? item.sources.map((url: string, i: number) => <div key={url}><a href={url} target="_blank" rel="noreferrer">来源 {i + 1}</a></div>) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>CIF 合计：R$ {Number(diHistory.analysis.totals.cif_brl).toFixed(2)}</strong>
              <div className="muted text-sm">II {diHistory.analysis.totals.ii_brl} · IPI {diHistory.analysis.totals.ipi_brl} · PIS {diHistory.analysis.totals.pis_brl} · COFINS {diHistory.analysis.totals.cofins_brl} · ICMS {diHistory.analysis.totals.icms_brl}</div>
              <div style={{ fontSize: 18, marginTop: 6 }}><strong>进口税费预估合计：R$ {Number(diHistory.analysis.totals.di_brl).toFixed(2)}</strong></div>
            </div>
          </div>
        )}
        <div className="row gap-md di-params" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}><label>RMB → BRL 汇率</label><input className="form-input form-input-sm" style={{ width: 150 }} type="number" min="0" step="0.0001" value={diParams.rmb_brl} onChange={e => setDiParams({ ...diParams, rmb_brl: e.target.value })} placeholder="例如 0.78" /></div>
          <div className="form-row" style={{ margin: 0 }}><label>保险费（BRL）</label><input className="form-input form-input-sm" style={{ width: 140 }} type="number" min="0" step="0.01" value={diParams.insurance_brl} onChange={e => setDiParams({ ...diParams, insurance_brl: Number(e.target.value) })} /></div>
          <div className="form-row" style={{ margin: 0 }}><label>进口州 UF</label><input className="form-input form-input-sm" style={{ width: 80 }} maxLength={2} value={diParams.uf} onChange={e => setDiParams({ ...diParams, uf: e.target.value.toUpperCase() })} /></div>
          <div className="form-row" style={{ margin: 0 }}><label>ICMS（%）</label><input className="form-input form-input-sm" style={{ width: 100 }} type="number" min="0" max="99" step="0.01" value={diParams.icms_rate * 100} onChange={e => setDiParams({ ...diParams, icms_rate: Number(e.target.value) / 100 })} /></div>
          <button className="btn" disabled={diBusy || !d.line_items?.length} onClick={handleDiAnalyze}>{diBusy ? '分析中…' : di ? '重新用 AI 分析 NCM' : '用 AI 分析 NCM 并计算 DI'}</button>
        </div>

        {di && (
          <>
            <div className="table-wrap" style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 1200 }}>
                <thead><tr><th>产品 / NCM 建议</th><th>可信度</th><th>货值 RMB / BRL</th><th>II %</th><th>IPI %</th><th>PIS %</th><th>COFINS %</th><th>CIF BRL</th><th>DI BRL</th><th>官方来源</th></tr></thead>
                <tbody>
                  {di.items.map((item: any) => (
                    <tr key={item.row_no}>
                      <td style={{ minWidth: 250 }}>
                        <strong>{item.product_en}</strong>
                        <div className="muted text-sm">行 {item.row_no} · {item.sku} · 原 HS {item.previous_ncm || '—'}</div>
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
                      <td>{item.sources?.length ? item.sources.map((url: string, i: number) => <div key={url}><a href={url} target="_blank" rel="noreferrer">来源 {i + 1}</a></div>) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-between" style={{ marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong>CIF 合计：R$ {Number(di.totals.cif_brl).toFixed(2)}</strong><br />
                <span className="muted text-sm">II {di.totals.ii_brl} · IPI {di.totals.ipi_brl} · PIS {di.totals.pis_brl} · COFINS {di.totals.cofins_brl} · ICMS {di.totals.icms_brl}</span>
                <div style={{ fontSize: 20, marginTop: 6 }}><strong>进口税费预估合计：R$ {Number(di.totals.di_brl).toFixed(2)}</strong></div>
              </div>
              <button className="btn" disabled={diBusy} onClick={handleDiReview}>保存 DI 版本</button>
              <button
                className="btn btn-ghost"
                disabled={diBusy || di.status !== 'reviewed'}
                title={di.status !== 'reviewed' ? '请先保存当前 DI 版本' : '按当前 DI 版本生成参考 DDP'}
                onClick={handleDiDdp}
              >用默认运费 + DI 进口税费预估生成 DDP</button>
            </div>
            {di.reviewed_by && <p className="muted text-sm">DI 版本保存人：{di.reviewed_by} · {di.reviewed_at?.slice(0, 16).replace('T', ' ')}</p>}
          </>
        )}
      </div>

      {/* M7 国际物流：成交走柜后运营维护，客户端实时可见（仅 done 订单） */}
      {d.status === 'done' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <h3>🚢 国际物流</h3>
            {curStage ? (
              <span className="text-sm">
                当前阶段：<span className="deal-tag deal-open">{SHIP_STAGE_CN[curStage] || curStage}</span>
              </span>
            ) : (
              <span className="muted text-sm">成交走柜后在此维护物流信息，客户将实时可见</span>
            )}
          </div>

          <div className="ship-form-grid">
            <div>
              <label>船名</label>
              <input className="form-input form-input-sm" value={shipForm.vessel} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, vessel: e.target.value })} placeholder="如 MSC ANNA" />
            </div>
            <div>
              <label>航次</label>
              <input className="form-input form-input-sm" value={shipForm.voyage} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, voyage: e.target.value })} placeholder="如 244W" />
            </div>
            <div>
              <label>提单号 B/L</label>
              <input className="form-input form-input-sm" value={shipForm.bill_no} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, bill_no: e.target.value })} />
            </div>
            <div>
              <label>柜号</label>
              <input className="form-input form-input-sm" value={shipForm.container_no} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, container_no: e.target.value })} placeholder="如 MSCU1234567" />
            </div>
            <div>
              <label>起运港</label>
              <input className="form-input form-input-sm" value={shipForm.pol} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, pol: e.target.value })} placeholder="如 Shanghai" />
            </div>
            <div>
              <label>目的港（巴西）</label>
              <input className="form-input form-input-sm" value={shipForm.pod} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, pod: e.target.value })} placeholder="如 Santos" />
            </div>
            <div>
              <label>预计开船日 ETD</label>
              <input type="date" className="form-input form-input-sm" value={shipForm.etd} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, etd: e.target.value })} />
            </div>
            <div>
              <label>预计到港日 ETA</label>
              <input type="date" className="form-input form-input-sm" value={shipForm.eta} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, eta: e.target.value })} />
            </div>
            <div className="span-2">
              <label>物流备注</label>
              <textarea className="form-input form-input-sm" rows={2} value={shipForm.remark} disabled={shipSaving}
                onChange={e => setShipForm({ ...shipForm, remark: e.target.value })} placeholder="可选，客户可见" />
            </div>
          </div>
          <div className="row gap-md mt-12">
            <button className="btn" disabled={shipSaving} onClick={handleShipSave}>
              {shipSaving ? '保存中…' : '💾 保存物流信息'}
            </button>
          </div>

          {/* M7 优化：流程进度条（已过实心 / 当前绿色 / 未来灰） */}
          <div className="ship-flow">
            {SHIP_FLOW.map((s, i) => (
              <div key={s}
                className={`ship-flow-step${i <= doneIdx ? ' done' : ''}${i === doneIdx ? ' cur' : ''}`}
                title={SHIP_STAGE_CN[s]}>
                <span className="ship-flow-dot" />
                <span className="ship-flow-name">{FLOW_SHORT[s]}</span>
              </div>
            ))}
          </div>

          {/* 节点时间线管理（竖向时间线，与客户端视觉统一） */}
          <div className="ship-ev-section">
            <div className="muted text-sm" style={{ marginBottom: 8 }}>
              📍 物流节点 · 客户可见的动态时间线（按时间正序）
            </div>
            {shipEvents.length > 0 && (
              <div className="ship-timeline">
                {shipEvents.map((ev, i) => (
                  <div className={`ship-tl-item${i === shipEvents.length - 1 ? ' cur' : ''}`} key={ev.id}>
                    <span className="ship-tl-dot" />
                    <div className="ship-tl-body">
                      <div className="ship-tl-head">
                        <span className="deal-tag deal-open">{SHIP_STAGE_CN[ev.stage] || ev.stage}</span>
                        <span className="muted text-sm">{ev.happened_at.slice(0, 16).replace('T', ' ')}</span>
                        <button className="btn btn-sm btn-ghost ship-tl-del" disabled={shipBusy}
                          title="删除该节点" onClick={() => handleEvDel(ev.id)}>✕</button>
                      </div>
                      {ev.note && <div className="muted text-sm" style={{ marginTop: 2 }}>{ev.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {shipEvents.length === 0 && (
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>暂无节点，从「已订舱」开始推进。</p>
            )}

            {/* M7 优化：一键推进（时间记为现在） */}
            <div className="ship-advance">
              {evNextStage ? (
                <>
                  <button className="btn" disabled={shipBusy} onClick={handleEvAdvance}>
                    ⚡ 推进到「{SHIP_STAGE_CN[evNextStage]}」
                  </button>
                  <input className="form-input form-input-sm" style={{ flex: 1, minWidth: 200 }}
                    placeholder="本次推进备注（可选，客户可见）"
                    value={evForm.note} disabled={shipBusy}
                    onChange={e => setEvForm({ ...evForm, note: e.target.value })} />
                </>
              ) : (
                <span className="ok-msg">🎉 流程已完成（已签收）</span>
              )}
            </div>

            {/* 自定义添加：补录历史节点 / 跳阶段 */}
            <div className="row gap-md mt-8" style={{ flexWrap: 'wrap' }}>
              <select className="form-input form-input-sm" style={{ width: 150 }} value={evForm.stage}
                disabled={shipBusy} onChange={e => setEvForm({ ...evForm, stage: e.target.value })}
                title="默认选中建议的下一阶段">
                {Object.entries(SHIP_STAGE_CN).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input type="datetime-local" className="form-input form-input-sm" style={{ width: 200 }}
                value={evForm.at} disabled={shipBusy} title="节点发生时间（留空 = 现在）"
                onChange={e => setEvForm({ ...evForm, at: e.target.value })} />
              <input className="form-input form-input-sm" style={{ width: 220 }} placeholder="节点备注（可选）"
                value={evForm.note} disabled={shipBusy}
                onChange={e => setEvForm({ ...evForm, note: e.target.value })} />
              <button className="btn btn-sm" disabled={shipBusy} onClick={handleEvAdd}>➕ 自定义添加</button>
              <span className="muted text-sm" style={{ alignSelf: 'center' }}>补录历史节点或跳阶段时使用</span>
            </div>
          </div>
        </div>
      )}

      {/* M8 交付文件：放行截图 / 发票 PDF（操作员上传给客户查看/下载） */}
      {d.status === 'done' && (
        <div className="card">
          <div className="card-title">
            <h3>📎 交付文件 · 客户可见</h3>
            <span className="muted text-sm">放行截图 / 发票 PDF · 单个 ≤10MB · 一次最多 9 个</span>
          </div>
          {/* M9：开票抬头（客户维护并绑定到订单，开 NF 时使用） */}
          {d.invoice_cnpj ? (
            <div className="order-file-row" style={{ marginBottom: 12, background: '#fffbeb', borderColor: '#f59e0b' }}>
              <span className="deal-tag deal-open">NF 受票公司</span>
              <span className="text-sm">{d.invoice_cnpj.company_name}</span>
              <span className="text-sm" style={{ fontFamily: 'monospace', fontWeight: 600 }}>CNPJ: {d.invoice_cnpj.cnpj}</span>
              <span className="text-sm" style={{ fontFamily: 'monospace', fontWeight: 600 }}>IE: {d.invoice_cnpj.ie || '未登记（历史资料）'}</span>
              <span className="muted text-sm">请使用以上巴西公司资料开具 NF</span>
            </div>
          ) : (
            <p className="muted text-sm" style={{ margin: '0 0 12px' }}>
              客户尚未指定本订单的开票 CNPJ（可在订单详情页选择）。
            </p>
          )}
          <div className="row gap-md order-file-upload" style={{ flexWrap: 'wrap' }}>
            <select className="form-input form-input-sm" style={{ width: 150 }} value={fileKind}
              disabled={fileBusy} onChange={e => setFileKind(e.target.value as any)}>
              <option value="clearance_shot">🖼 放行截图</option>
              <option value="invoice">🧾 发票 PDF</option>
              <option value="other">📄 其他</option>
            </select>
            <input className="form-input form-input-sm" style={{ width: 240 }} placeholder="备注（可选，客户可见）"
              value={fileNote} disabled={fileBusy} onChange={e => setFileNote(e.target.value)} />
            <input type="file" accept="image/*,application/pdf" multiple disabled={fileBusy}
              onChange={onFilePick} title="选择图片或 PDF 文件" />
            <button className="btn btn-sm" disabled={pickFiles.length === 0 || fileBusy} onClick={doFileUpload}>
              📤 上传{pickFiles.length > 0 ? `（${pickFiles.length} 个）` : ''}
            </button>
          </div>
          {orderFiles.length > 0 ? (
            <div className="order-file-list mt-12">
              {orderFiles.map(f => (
                <div className="order-file-row" key={f.id}>
                  <span className="deal-tag deal-open">{FILE_KIND_CN[f.kind] || f.kind}</span>
                  <span className="text-sm" title={f.file_name}
                    style={{ minWidth: 0, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {/^image\//.test(f.mime_type) ? '🖼' : '🧾'} {f.file_name}
                  </span>
                  <span className="muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                    {(f.size_bytes / 1024).toFixed(0)} KB · {f.created_at?.slice(0, 10)}
                  </span>
                  {f.note && <span className="muted text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.note}</span>}
                  <button className="btn btn-sm btn-ghost" disabled={fileBusy} title="下载/查看" onClick={() => doFileDownload(f)}>⬇</button>
                  <button className="btn btn-sm btn-ghost" disabled={fileBusy} title="删除" onClick={() => doFileDelete(f.id)}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm" style={{ margin: '12px 0 0' }}>
              暂无交付文件。清关放行后可上传放行截图与发票 PDF，客户在其订单详情页可查看/下载。
            </p>
          )}
        </div>
      )}

      {/* 下：客户填写的 Excel 行数据（末列为该行对应的明细截图） */}
      {(d.line_items?.length || shots.length) ? (
        <div className="card">
          <div className="card-title">
            <h3>📋 客户填写明细</h3>
            <span className="muted text-sm">
              {d.line_items?.length || 0} 行 · {liKeys.length} 列{shots.length > 0 ? ` · 🖼 截图 ${shots.length} 张（按行对应）` : ''} · 可按行百分比计价（联动重算 DI/DDP）
            </span>
          </div>
          <div className="table-wrap">
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Row</th>
                    {liKeys.map(k => <th key={k}>{FIELD_LABELS[k] || k}</th>)}
                    {shots.length > 0 && <th style={{ width: 150 }}>🖼 图片</th>}
                    <th style={{ width: 160 }} title="新单价 = 原单价 × 自定义百分比；行总价和参考 DDP 自动重算">原单价计价 %</th>
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
                              aria-label={`第 ${it.row_no} 行原单价计价百分比`}
                              title="新单价 = 原单价 × 百分比，例如原价 35 输入 30 → 10.5；100 = 恢复原价"
                              value={adjPct[it.row_no] || ''}
                              disabled={priceBusyRow !== null}
                              onChange={e => setAdjPct(prev => ({ ...prev, [it.row_no]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleAdjustPrice(Number(it.row_no)); }}
                            />
                            <button
                              className="btn btn-sm"
                              disabled={priceBusyRow !== null || !(adjPct[it.row_no] || '').trim()}
                              title="应用计价并重新计算 DI / DDP"
                              onClick={() => handleAdjustPrice(Number(it.row_no))}
                            >{priceBusyRow === Number(it.row_no) ? '…' : '应用'}</button>
                          </span>
                        ) : (
                          <span className="muted text-sm" title="该行无有效单价，无法按百分比调整">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* 行数据为空但存在截图：单行仅渲染图片单元格 */}
                  {(!d.line_items || d.line_items.length === 0) && shots.length > 0 && (
                    <tr>
                      <td colSpan={liKeys.length + 1} className="muted text-sm">无行数据</td>
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
              <p className="muted text-sm" style={{ margin: '0 0 8px' }}>🖼 未关联到明细行的截图（{unboundShots.length} 张）</p>
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
              <button className="btn btn-sm btn-ghost" onClick={() => setShotPreview(null)}>关闭 ✕</button>
            </div>
            <img src={shotPreview.url} alt={shotPreview.name} />
          </div>
        </div>
      )}
    </div>
  );
}
