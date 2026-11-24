/**
 * 客户端 AI 询价——确定性计价引擎（纯函数，无框架依赖，便于 node:test 直接测试）
 * 金额一律由此处计算，模型只负责提取参数与组织话术，避免大模型编造价格。
 */
import { PRICE_TABLE, type CountryCode, type FreightChannel, type PriceClass, type PriceTable, type PriceValue } from './price-table';

export interface InquiryParams {
  goods?: string;          // 货物名称（尽量中文，匹配分类关键词）
  country?: CountryCode;
  mode?: 'sea' | 'air' | 'parcel';
  weightKg?: number;
  volumeCbm?: number;
  dimsCm?: [number, number, number];
  quantity?: number;
  battery?: boolean;       // 带电/纯电
  brand?: boolean;         // 品牌/F牌
}

export type EstimateStatus = 'quoted' | 'enquiry' | 'rejected';

export interface EstimateResult {
  channelCode: string;
  channelZh: string;
  channelPt: string;
  country: CountryCode;
  mode: 'sea' | 'air' | 'parcel';
  currency: 'USD' | 'CNY';
  status: EstimateStatus;
  className?: string;          // 命中的产品分类
  classConfidence?: 'exact' | 'fallback';
  tierLabel?: string;          // 命中的重量/体积分段
  chargeable?: number;         // 计费重量或方数
  unit?: 'CBM' | 'KG';
  unitPrice?: number;
  subtotal?: number;
  surcharges?: { labelZh: string; labelPt: string; amount: number }[];
  total?: number;
  transitZh: string;
  transitPt: string;
  reasonZh?: string;           // enquiry/rejected 的原因
  reasonPt?: string;
  notesZh: string[];
  notesPt: string[];
}

export interface EstimateOutput {
  estimates: EstimateResult[];
  warningsZh: string[];
  warningsPt: string[];
  missingZh: string[];   // 仍缺的参数（用于追问）
  missingPt: string[];
}

const COUNTRY_ALIASES: Record<string, CountryCode> = {
  巴西: 'BR', brasil: 'BR', brazil: 'BR', 'são paulo': 'BR', 'sao paulo': 'BR', 圣保罗: 'BR', 桑托斯: 'BR', santos: 'BR', 里约: 'BR',
  阿根廷: 'AR', argentina: 'AR', 布宜诺斯艾利斯: 'AR',
  智利: 'CL', chile: 'CL', 智力: 'CL',
  哥伦比亚: 'CO', colombia: 'CO',
  墨西哥: 'MX', mexico: 'MX', méxico: 'MX',
  厄瓜多尔: 'EC', ecuador: 'EC',
  秘鲁: 'PE', peru: 'PE', perú: 'PE'
};

function firstNumber(raw: string | undefined, portuguese = false): number | undefined {
  if (raw === undefined) return undefined;
  if (portuguese && /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ''));
  const separator = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  const normalized = separator < 0 ? raw :
    raw.slice(0, separator).replace(/[.,]/g, '') + '.' + raw.slice(separator + 1);
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 双语正则参数提取（无 AI 时的兜底；AI 提取结果优先生效） */
export function parseInquiryParams(text: string): InquiryParams {
  const params: InquiryParams = {};
  const lower = text.toLowerCase();
  const portuguese = !/[\u3400-\u9fff]/.test(text);
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(alias)) { params.country = code; break; }
  }
  if (/(海运|海運|marítimo|maritimo|sea|fcl|lcl)/i.test(lower)) params.mode = 'sea';
  else if (/(空运|空運|aéreo|aereo|air freight|航班)/i.test(lower)) params.mode = 'air';
  else if (/(小包|包裹|parcel|correios|邮政|邮局)/i.test(lower)) params.mode = 'parcel';

  const weight = text.match(/(-?\d+(?:[.,]\d+)*)\s*(?:kg|kgs|千克|公斤|quilos?|公斤重)/i);
  params.weightKg = firstNumber(weight?.[1], portuguese);
  const volume = text.match(/(-?\d+(?:[.,]\d+)*)\s*(?:cbm|方|立方|m3|m³|metros? ?c[uú]bicos?)/i);
  params.volumeCbm = firstNumber(volume?.[1], portuguese);
  const dims = text.match(/(-?\d+(?:[.,]\d+)*)\s*(?:cm|厘米)?\s*[x×*]\s*(-?\d+(?:[.,]\d+)*)\s*(?:cm|厘米)?\s*[x×*]\s*(-?\d+(?:[.,]\d+)*)\s*(?:cm|厘米)/i);
  if (dims) {
    const [length, width, height] = dims.slice(1).map(value => firstNumber(value, portuguese));
    if (length && width && height) params.dimsCm = [length, width, height];
  }
  params.battery = /(电池|充电宝|带电|纯电|移动电源|bateria|power ?bank)/i.test(lower);
  params.brand = /(品牌|仿牌|f牌|brand|marca)/i.test(lower);
  const qty = text.match(/(-?\d+(?:[.,]\d+)*)\s*(?:箱|件|个|pcs|cartons?|caixas?)/i);
  const quantity = firstNumber(qty?.[1], portuguese);
  if (Number.isInteger(quantity)) params.quantity = quantity;
  return params;
}

/** 关键词最长匹配：长词优先（手机壳 → 一类，而不是命中十二类的「手机」） */
export function classifyGoods(goods: string, channel: FreightChannel):
  { priceClass: PriceClass | null; confidence: 'exact' | 'fallback'; ambiguous: boolean; allMatched: PriceClass[] } {
  const text = (goods || '').toLowerCase();
  if (!text || !channel.classes.length) return { priceClass: null, confidence: 'fallback', ambiguous: false, allMatched: [] };
  const hits: { cls: PriceClass; keyword: string }[] = [];
  for (const cls of channel.classes) {
    for (const keyword of cls.keywords) {
      if (keyword && text.includes(keyword.toLowerCase())) hits.push({ cls, keyword });
    }
  }
  if (!hits.length) return { priceClass: null, confidence: 'fallback', ambiguous: false, allMatched: [] };
  const longest = hits.reduce((best, hit) => hit.keyword.length > best.keyword.length ? hit : best);
  // 同长度命中多个分类时，取报价更高的（保守）；此时才提示歧义
  const sameLength = hits.filter(hit => hit.keyword.length === longest.keyword.length);
  const byPrice = (cls: PriceClass): number => {
    const max = Math.max(...cls.prices.filter((p): p is number => typeof p === 'number'));
    return Number.isFinite(max) ? max : -1;
  };
  const chosen = sameLength.length > 1 ? sameLength.reduce((a, b) => byPrice(b.cls) > byPrice(a.cls) ? b : a).cls : longest.cls;
  const allMatched = Array.from(new Set(hits.map(hit => hit.cls)));
  return { priceClass: chosen, confidence: 'exact', ambiguous: sameLength.length > 1, allMatched };
}

function tierIndex(channel: FreightChannel, value: number): number {
  for (let i = 0; i < channel.tiers.length; i++) {
    const max = channel.tiers[i].max;
    if (max === null || value <= max) return i;
  }
  return channel.tiers.length - 1;
}

function weightTierFee(tiers: { max: number; fee: number }[] | undefined, weight: number): number | undefined {
  if (!tiers?.length) return undefined;
  for (const tier of tiers) {
    if (weight <= tier.max) return tier.fee;
  }
  return undefined; // 超出最高段，由 overFee 处理
}

function parcelOpFee(channel: FreightChannel, weight: number): { fee: number; overFlag: boolean } {
  const base = weightTierFee(channel.opFees, weight);
  if (base !== undefined) return { fee: base, overFlag: false };
  const last = channel.opFees![channel.opFees!.length - 1];
  const over = channel.overFee;
  if (!over || weight <= over.overKg) return { fee: last.fee, overFlag: false };
  const steps = Math.ceil((weight - over.overKg) / over.stepKg);
  return { fee: last.fee + steps * over.fee, overFlag: true };
}

function priceValue(v: PriceValue): PriceValue { return v; }

function round2(n: number): number { return Math.round(n * 100) / 100; }

/** 海运计费方数：max(实际方数, 重量/300)，最低 1CBM */
function chargeableCbm(channel: FreightChannel, weightKg?: number, volumeCbm?: number): number | undefined {
  if (!Number.isFinite(Number(volumeCbm)) && !Number.isFinite(Number(weightKg))) return undefined;
  const byVolume = Number(volumeCbm) || 0;
  const byWeight = Number(weightKg) ? Number(weightKg) / (channel.rules.cbmKgRatio || 300) : 0;
  const cbm = Math.max(byVolume, byWeight);
  return Math.max(cbm, channel.rules.minChargeCbm ?? 0);
}

/** 空运/小包计费重量：max(实重, 体积重)，最低起收 */
function chargeableKg(channel: FreightChannel, params: InquiryParams): number | undefined {
  const weight = Number(params.weightKg);
  const dims = params.dimsCm;
  const divisor = channel.rules.volumetricDivisor;
  let volWeight = 0;
  if (dims && divisor) volWeight = (dims[0] * dims[1] * dims[2]) / divisor;
  else if (Number.isFinite(Number(params.volumeCbm)) && divisor) volWeight = params.volumeCbm! * 1_000_000 / divisor;
  const chargeable = Math.max(Number.isFinite(weight) ? weight : 0, volWeight);
  if (chargeable <= 0) return undefined;
  return Math.max(chargeable, channel.rules.minChargeKg ?? 0);
}

function antiDumpingHit(goods: string, table: PriceTable = PRICE_TABLE): boolean {
  const text = (goods || '').toLowerCase();
  return (table.antiDumpingKeywords || []).some(keyword => text.includes(keyword.toLowerCase()));
}

function batteryRejected(channel: FreightChannel, params: InquiryParams): boolean {
  if (!params.battery) return false;
  if (channel.battery === 'none') return true;
  return false; // builtin/pure 渠道由分类与备注提示
}

export function estimate(params: InquiryParams, table: PriceTable = PRICE_TABLE): EstimateOutput {
  const warningsZh: string[] = [];
  const warningsPt: string[] = [];
  const missingZh: string[] = [];
  const missingPt: string[] = [];
  const goods = (params.goods || '').trim();
  if (!goods) { missingZh.push('货物名称'); missingPt.push('nome do produto'); }
  if (!params.country) { missingZh.push('目的国家'); missingPt.push('país de destino'); }
  const hasWeightOrVolume = Number.isFinite(Number(params.weightKg)) || Number.isFinite(Number(params.volumeCbm)) || !!params.dimsCm;
  if (!hasWeightOrVolume) { missingZh.push('重量或体积'); missingPt.push('peso ou volume'); }

  const out: EstimateOutput = { estimates: [], warningsZh, warningsPt, missingZh, missingPt };
  if (missingZh.length || !params.country) return out;

  // 带电标识：AI/正则提取优先，品名本身含电池类关键词时自动识别
  const batteryFlag = params.battery || (goods ? /(电池|充电宝|移动电源|纯电|bateria|power ?bank)/i.test(goods) : false);
  const brandFlag = params.brand || (goods ? /(品牌|仿牌|f牌|brand|marca)/i.test(goods) : false);
  params.battery = batteryFlag;
  params.brand = brandFlag;

  const candidates = table.channels.filter(channel => channel.country === params.country)
    .filter(channel => params.mode ? channel.mode === params.mode : channel.mode !== 'parcel');

  const antiDump = goods && antiDumpingHit(goods, table);
  if (antiDump) {
    warningsZh.push('该品类可能列入巴西反倾销清单，或产生高额反倾销税，出货前需单独确认。');
    warningsPt.push('Este produto pode estar na lista antidumping do Brasil; confirme antes de embarcar.');
  }

  for (const channel of candidates) {
    const result: EstimateResult = {
      channelCode: channel.code, channelZh: channel.nameZh, channelPt: channel.namePt,
      country: channel.country, mode: channel.mode, currency: channel.currency,
      status: 'quoted',
      transitZh: channel.rules.transitZh, transitPt: channel.rules.transitPt,
      notesZh: [], notesPt: []
    };

    if (batteryRejected(channel, params)) {
      result.status = 'rejected';
      result.reasonZh = '该渠道不收带电/纯电产品';
      result.reasonPt = 'Este canal não aceita produtos com bateria';
      out.estimates.push(result);
      continue;
    }

    if (channel.mode === 'parcel') {
      const weight = chargeableKg(channel, params);
      if (weight === undefined || !goods) { continue; } // 缺参数的渠道不出价
      const maxW = channel.rules.maxWeightKg;
      if (maxW && weight > maxW) {
        result.status = 'rejected';
        result.reasonZh = `超出单票限重 ${maxW}KG`;
        result.reasonPt = `Acima do limite de ${maxW}kg por envio`;
        out.estimates.push(result);
        continue;
      }
      const perKg = channel.perKg ?? weightTierFee(channel.perKgTiers, weight);
      if (perKg === undefined) continue;
      const { fee: opFee } = parcelOpFee(channel, weight);
      result.status = 'quoted';
      result.chargeable = round2(weight);
      result.unit = 'KG';
      result.unitPrice = perKg;
      result.subtotal = round2(perKg * weight);
      result.surcharges = [{ labelZh: '操作费/票', labelPt: 'Taxa de operação', amount: opFee }];
      result.total = round2(perKg * weight + opFee);
      if (channel.kind === 'agent') {
        result.notesZh.push('代理渠道，分区/渠道细则以客服确认为准');
        result.notesPt.push('Canal de agente; detalhes conforme atendimento');
      }
      if (params.battery && channel.battery === 'pure') {
        result.notesZh.push('纯电/充电宝需按纯电渠道，MSDS 视产品提供');
        result.notesPt.push('Bateria pura exige canal próprio e MSDS conforme produto');
      }
      out.estimates.push(result);
      continue;
    }

    // 海运 / 空运自营专线
    const chargeable = channel.mode === 'sea'
      ? chargeableCbm(channel, params.weightKg, params.volumeCbm)
      : chargeableKg(channel, params);
    if (chargeable === undefined || !goods) continue;

    const { priceClass, confidence, ambiguous } = classifyGoods(goods, channel);
    const idx = tierIndex(channel, chargeable);
    result.tierLabel = channel.tiers[idx]?.label;
    result.chargeable = round2(chargeable);
    result.unit = channel.unit;

    if (!priceClass) {
      result.status = 'enquiry';
      result.classConfidence = 'fallback';
      result.reasonZh = `「${goods.slice(0, 30)}」未在${channel.nameZh}分类表中直接命中，需人工确认分类单价`;
      result.reasonPt = `"${goods.slice(0, 30)}" sem classificação direta na tabela do ${channel.namePt}; confirmar com o time`;
      out.estimates.push(result);
      continue;
    }

    result.className = priceClass.name;
    result.classConfidence = confidence;
    const price = priceValue(priceClass.prices[idx] ?? priceClass.prices[priceClass.prices.length - 1]);
    if (price === 'rejected') {
      result.status = 'rejected';
      result.reasonZh = `该品类（${priceClass.name}）此渠道不收`;
      result.reasonPt = `Categoria ${priceClass.name} não aceita neste canal`;
      out.estimates.push(result);
      continue;
    }
    if (price === 'enquiry') {
      result.status = 'enquiry';
      result.reasonZh = `该品类（${priceClass.name}）需单独询价`;
      result.reasonPt = `Categoria ${priceClass.name} exige cotação individual`;
      out.estimates.push(result);
      continue;
    }

    result.status = 'quoted';
    result.unitPrice = price;
    result.subtotal = round2(price * chargeable);
    result.surcharges = [];
    // 巴西空运 F 牌加收
    if (params.brand && channel.code === 'AYZL0002') {
      const bump = priceClass.name === '八类（服装）' ? 4 : 2;
      result.surcharges.push({ labelZh: `F牌加收 ${bump} USD/KG`, labelPt: `Acréscimo marca ${bump} USD/KG`, amount: round2(bump * chargeable) });
    }
    result.total = round2(result.subtotal + result.surcharges.reduce((sum, s) => sum + s.amount, 0));
    if (confidence === 'fallback') {
      result.notesZh.push('按保守分类估算');
      result.notesPt.push('Estimado por classificação conservadora');
    }
    if (ambiguous) {
      result.notesZh.push('多个同优先级分类命中，已取较高报价，请与客服确认');
      result.notesPt.push('Mais de uma categoria igualmente aplicável; usado o valor mais alto, confirme conosco');
    }
    if (channel.mode === 'sea' && Number.isFinite(Number(params.weightKg)) && !Number.isFinite(Number(params.volumeCbm))) {
      result.notesZh.push('未提供体积，按重量折算方数（1CBM=300KG）');
      result.notesPt.push('Volume não informado; convertido pelo peso (1CBM=300KG)');
    }
    if (channel.code === 'AYZL0002' && !/圣保罗|são paulo|sao paulo|0\d{4}/i.test(goods + ' ' + JSON.stringify(params))) {
      result.notesZh.push('报价到圣保罗市区（邮编 0 开头），其他地区加收 10 RMB/KG（最低 200 RMB/票）');
      result.notesPt.push('Preço até São Paulo capital (CEP 0); outras regiões +10 RMB/kg (mín. 200 RMB)');
    }
    out.estimates.push(result);
  }

  // 排序：有价在前，单询次之，不收最后；自营优先
  const order = { quoted: 0, enquiry: 1, rejected: 2 } as const;
  out.estimates.sort((a, b) => order[a.status] - order[b.status]);
  return out;
}

function fmtCurrency(amount: number, currency: 'USD' | 'CNY', lang: 'zh' | 'pt', cnyPerUsd?: number): string {
  const locale = lang === 'pt' ? 'pt-BR' : 'zh-CN';
  const num = amount.toLocaleString(locale, { maximumFractionDigits: 2 });
  const approximateUsd = currency === 'CNY' && cnyPerUsd
    ? ` (≈ ${(amount / cnyPerUsd).toLocaleString(locale, { maximumFractionDigits: 0 })} USD)` : '';
  return `${num} ${currency}${approximateUsd}`;
}

/** 无 AI 时的双语模板渲染（AI 正常时也可作为兜底） */
export interface EstimateMeta {
  version?: string;
  title?: string;
  fxNote?: string;
}

export function renderEstimateText(output: EstimateOutput, params: InquiryParams, lang: 'zh' | 'pt', meta: EstimateMeta = {}): string {
  const zh = lang === 'zh';
  if (!output.estimates.length) {
    return zh
      ? `感谢您的咨询。目前还缺少：${output.missingZh.join('、') || '重量/体积'}。请补充后我再为您按报价表估算参考价。`
      : `Obrigado! Ainda falta: ${output.missingPt.join(', ') || 'peso/volume'}. Complemente para eu estimar pela tabela de preços.`;
  }
  const rawVersion = meta.version || PRICE_TABLE.version;
  const versionLabel = /^\d{8}$/.test(rawVersion)
    ? `${rawVersion.slice(0, 4)}-${rawVersion.slice(4, 6)}-${rawVersion.slice(6, 8)}` : rawVersion;
  const fx = meta.fxNote || PRICE_TABLE.fxNote || '汇率固定 7.1';
  const cnyPerUsd = firstNumber(fx.match(/^汇率固定\s*(\d+(?:[.,]\d+)?)\s*[（(]CNY\/USD[）)]$/)?.[1]);
  const fxLabel = !zh && cnyPerUsd ? `câmbio fixo de ${cnyPerUsd.toLocaleString('pt-BR')} CNY por USD` : fx;
  const title = meta.title || (zh ? '安易智链报价表' : 'tabela AEG');
  const lines: string[] = [];
  lines.push(zh
    ? `根据${title}（${versionLabel} 版，${fxLabel}）的参考价：`
    : `Estimativa pela ${title} (versão ${versionLabel}, ${fxLabel}):`);
  for (const item of output.estimates.slice(0, 4)) {
    const name = zh ? item.channelZh : item.channelPt;
    if (item.status === 'quoted') {
      const basis = zh
        ? `${name}｜${item.className ?? ''}｜${item.tierLabel ?? ''}｜${item.unitPrice} ${item.currency}/${item.unit === 'KG' ? 'KG' : 'CBM'} × ${item.chargeable} ${item.unit === 'KG' ? 'KG' : 'CBM'}`
        : `${name} | ${item.className ?? ''} | ${item.tierLabel ?? ''} | ${item.unitPrice} ${item.currency}/${item.unit === 'KG' ? 'kg' : 'm³'} × ${item.chargeable}`;
      const extra = (item.surcharges ?? []).map(s => `${zh ? s.labelZh : s.labelPt} ${s.amount}`).join('，');
      lines.push(zh
        ? `• ${basis}${extra ? `＋${extra}` : ''} ≈ ${fmtCurrency(item.total!, item.currency, 'zh', cnyPerUsd)}；${item.transitZh}`
        : `• ${basis}${extra ? ` + ${extra}` : ''} ≈ ${fmtCurrency(item.total!, item.currency, 'pt', cnyPerUsd)}; ${item.transitPt}`);
    } else if (item.status === 'enquiry') {
      lines.push(zh ? `• ${name}：${item.reasonZh}` : `• ${name}: ${item.reasonPt}`);
    } else {
      lines.push(zh ? `• ${name}：${item.reasonZh}` : `• ${name}: ${item.reasonPt}`);
    }
    for (const note of (zh ? item.notesZh : item.notesPt)) lines.push(`  - ${note}`);
  }
  for (const warn of (zh ? output.warningsZh : output.warningsPt)) lines.push(`⚠ ${warn}`);
  lines.push(zh
    ? '以上为大概参考价，最终以正式报价单为准。登录上传装箱清单可获得精确核算。'
    : 'Valores aproximados; a proposta formal prevalece. Entre e envie a lista de embalagem para o cálculo exato.');
  return lines.join('\n');
}
