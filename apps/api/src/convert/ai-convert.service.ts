import { Inject, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AiConfigRepo, ResolvedAiConfig } from '../common/mock-db';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedTypes = require('../../../../packages/shared-types/dist/index.js');
const FIELD_DICTIONARY = sharedTypes.FIELD_DICTIONARY as any[];

export interface ConvertedRow {
  row_no: number;
  data: Record<string, any>;
  source_totals?: {
    total_pcs?: number | null;
    total_price?: number | null;
    total_cbm?: number | null;
  };
}

export interface AiConvertSuccess {
  ok: true;
  rows: ConvertedRow[];
  warehouseCode: string;
  notes?: string;
  currency?: 'RMB' | 'USD';
}

export interface AiConvertFailure {
  ok: false;
  reason: string;
}

interface SheetSample {
  name: string;
  rowCount: number;
  sample: any[][];
}

interface AiMapping {
  sheet?: string;
  header_row?: number;
  data_start_row: number;
  warehouse_code?: string;
  mapping: Record<string, string | null>;
  notes?: string;
}

const NUMERIC_TYPES = new Set(['INTEGER', 'DECIMAL']);

/** 数值归一化：千分位、逗号小数（1,5 → 1.5）、去空格与货币/单位字符 */
function toNumberLike(v: any): any {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return v;
  let s = String(v).trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return v;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // 同时存在两种分隔符：靠后的为小数点，另一个为千分位
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // 只有逗号：视为小数点（巴西/欧洲习惯）
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isNaN(n) ? v : n;
}

/**
 * M11：AI 识别非标 Excel 结构并转换为标准 27 字段行。
 * AI 只产出列映射 JSON，逐行数据由确定性代码转换，随后走与标准模板相同的校验管线。
 */
@Injectable()
export class AiConvertService {
  private readonly logger = new Logger(AiConvertService.name);

  constructor(@Inject('AiConfigRepo') private readonly aiConfig: AiConfigRepo) {}

  async isEnabled(): Promise<boolean> {
    const cfg = await this.aiConfig.resolve('deepseek-flash', 30000);
    return !!cfg.apiKey;
  }

  async convert(wb: ExcelJS.Workbook): Promise<AiConvertSuccess | AiConvertFailure> {
    const cfg = await this.aiConfig.resolve('deepseek-flash', 30000);
    if (cfg.apiKey) {
      try {
        const sheets = this.extractSamples(wb);
        if (sheets.length === 0) return { ok: false, reason: '工作簿为空' };
        const mapping = await this.requestMapping(sheets, cfg);
        const converted = this.applyMapping(wb, mapping);
        if (converted.ok && this.rowsHaveRequiredValues(converted.rows)) {
          return { ...converted, notes: 'AI 已完成清单结构识别与字段映射' };
        }
        const fallback = this.heuristicConvert(wb);
        return fallback || converted;
      } catch (e: any) {
        this.logger.warn(`AI 转换失败：${e?.message || e}`);
        const fallback = this.heuristicConvert(wb);
        if (fallback) return fallback;
        return { ok: false, reason: e?.message || 'AI 转换失败' };
      }
    }
    const heuristic = this.heuristicConvert(wb);
    if (heuristic) return heuristic;
    return { ok: false, reason: '未配置 AI 转换（API Key 为空）' };
  }

  private rowsHaveRequiredValues(rows: ConvertedRow[]): boolean {
    const required = FIELD_DICTIONARY.filter(field => field.required && !field.formula);
    return rows.length > 0 && rows.every(row => required.every(field => {
      const value = row.data[field.field_key];
      return value !== null && value !== undefined && value !== '';
    }));
  }

  private deriveUnitPrice(data: Record<string, any>, sourceTotals: ConvertedRow['source_totals']): void {
    if (data.unit_price !== null && data.unit_price !== undefined && data.unit_price !== '') return;
    const totalPcs = Number(sourceTotals?.total_pcs)
      || Number(data.total_pcs)
      || Number(data.cartons) * Number(data.pcs_per_carton);
    const totalPrice = Number(sourceTotals?.total_price) || Number(data.total_price);
    if (Number.isFinite(totalPcs) && totalPcs > 0 && Number.isFinite(totalPrice) && totalPrice > 0) {
      data.unit_price = Math.round((totalPrice / totalPcs) * 1_000_000) / 1_000_000;
    }
  }

  private heuristicConvert(wb: ExcelJS.Workbook): AiConvertSuccess | null {
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) return null;
    const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    const textOf = (v: any): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        if (v.richText && Array.isArray(v.richText)) return v.richText.map((part: any) => String(part?.text || '')).join('');
        if (v.text != null) return String(v.text);
        if ('result' in v) return String(v.result);
      }
      return String(v);
    };
    const matchers: [string, string][] = [
      ['外箱尺寸', 'size'], ['cartonsize', 'size'], ['中文品名', 'product_cn'], ['英文品名', 'product_en'], ['productnameen', 'product_en'],
      ['产品名称', 'product_cn'], ['nomedoproduto', 'product_en'], ['descriptionen', 'product_en'], ['goodsdescription', 'product_en'],
      ['productdescription', 'description'], ['description', 'description'], ['remarks', 'description'],
      ['海关编码', 'hs_code'], ['hscode', 'hs_code'], ['ncm', 'hs_code'],
      ['产品型号', 'sku'], ['productsku', 'sku'], ['sku', 'sku'], ['itemno', 'sku'], ['itemcode', 'sku'],
      ['quantityperbox', 'pcs_per_carton'], ['quantitypercarton', 'pcs_per_carton'], ['单箱件数', 'pcs_per_carton'], ['每箱数量', 'pcs_per_carton'], ['pcscarton', 'pcs_per_carton'],
      ['总件数', 'total_pcs'], ['totalpcs', 'total_pcs'], ['totalquantity', 'total_pcs'], ['quantidadetotal', 'total_pcs'],
      ['boxquantity', 'cartons'], ['箱数', 'cartons'], ['cartons', 'cartons'], ['quantity', 'cartons'],
      ['单箱净重', 'nw_per_carton'], ['nwkg', 'nw_per_carton'], ['netweight', 'nw_per_carton'],
      ['单箱毛重', 'gw_per_carton'], ['gwkg', 'gw_per_carton'], ['grossweight', 'gw_per_carton'],
      ['lengthcm', 'length_cm'], ['widthcm', 'width_cm'], ['heightcm', 'height_cm'],
      ['总体积', 'total_cbm'], ['totalcbm', 'total_cbm'], ['总cbm', 'total_cbm'],
      ['单价', 'unit_price'], ['unitprice', 'unit_price'], ['amount', 'unit_price'],
      ['总金额', 'total_price'], ['总价', 'total_price'], ['totalprice', 'total_price'], ['valortotal', 'total_price'],
      ['goodsmaterials', 'material'], ['货物材质', 'material'], ['材质', 'material'], ['material', 'material'],
      ['机器条码', 'machine_barcode'], ['箱号', 'carton_no'], ['cartonno', 'carton_no'], ['boxno', 'carton_no'], ['备注', 'remark']
    ];
    const mappingForRow = (r: number): Record<string, string> => {
      const row = ws.getRow(r);
      const mapping: Record<string, string> = {};
      let sizeSeq = 0;
      for (let c = 1; c <= 40; c++) {
        const norm = normalize(textOf(row.getCell(c).value));
        if (!norm) continue;
        for (const [token, field] of matchers) {
          if (!norm.includes(token)) continue;
          if (field === 'size') {
            const sizeField = ['length_cm', 'width_cm', 'height_cm'][sizeSeq++];
            if (sizeField && !mapping[sizeField]) mapping[sizeField] = this.colLetter(c);
            break;
          }
          if (!mapping[field]) mapping[field] = this.colLetter(c);
          break;
        }
      }
      return mapping;
    };
    let best: { row: number; mapping: Record<string, string> } | null = null;
    for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
      const mapping = mappingForRow(r);
      const found = Object.keys(mapping).length;
      if (found >= 3 && (!best || found > Object.keys(best.mapping).length)) best = { row: r, mapping };
    }
    if (!best) return null;
    for (let r = Math.max(1, best.row - 2); r <= Math.min(ws.rowCount, best.row + 2); r++) {
      if (r === best.row) continue;
      const adjacent = mappingForRow(r);
      for (const [field, col] of Object.entries(adjacent)) {
        if (!best.mapping[field]) best.mapping[field] = col;
      }
    }
    if (!best.mapping.product_en && !best.mapping.product_cn && !best.mapping.sku) return null;
    if (!best.mapping.product_cn && best.mapping.product_en) best.mapping.product_cn = best.mapping.product_en;
    if (!best.mapping.description) best.mapping.description = best.mapping.product_cn || best.mapping.product_en;
    const missingRequired = FIELD_DICTIONARY.some(field => field.required && !field.formula && !best.mapping[field.field_key]);
    if (missingRequired) return null;
    const start = best.row + 1;
    const rows: ConvertedRow[] = [];
    let firstWarehouse = '';
    for (let r = start; r <= ws.rowCount; r++) {
      const excelRow = ws.getRow(r);
      if (!excelRow || !excelRow.cellCount) continue;
      const data: Record<string, any> = {};
      const sourceTotals = this.readSourceTotals(excelRow, best.mapping);
      let nonEmpty = 0;
      for (const f of FIELD_DICTIONARY) {
        if (f.formula) continue;
        const col = best.mapping[f.field_key];
        if (!col) { data[f.field_key] = null; continue; }
        let v: any = excelRow.getCell(this.colToIndex(col) + 1).value;
        if (v && typeof v === 'object' && 'result' in v) v = v.result;
        if (NUMERIC_TYPES.has(f.data_type) && v !== null && v !== undefined && v !== '') v = toNumberLike(v);
        if (f.field_key === 'hs_code' && v !== null && v !== undefined && v !== '' && /^\d{10,12}$/.test(String(v))) {
          v = String(v).slice(0, 8);
        }
        if (v !== null && v !== undefined && v !== '') nonEmpty++;
        data[f.field_key] = v ?? null;
      }
      if (nonEmpty === 0) continue;
      const looksHeader = String(data.product_cn || '').includes('商品名称') || /nome\s*do\s*produto/i.test(String(data.product_en || ''));
      if (looksHeader) continue;
      if (!String(data.sku || data.product_en || data.product_cn || '').trim() && !String(data.carton_no || '').trim()) continue;
      const sku = String(data.sku || data.product_en || data.product_cn || '').trim();
      const productEn = String(data.product_en || '').trim();
      const productCn = String(data.product_cn || '').trim();
      data.sku = sku || `ITEM-${r}`;
      data.product_en = productEn || productCn || data.sku;
      data.product_cn = productCn || productEn || data.sku;
      data.carton_no = String(data.carton_no || '').trim() || null;
      data.material = ['不带电', '带电', '含电池', '其他'].includes(String(data.material || '').trim()) ? data.material : '其他';
      data.description = String(data.description || '').trim() || data.product_en;
      if (!firstWarehouse && data.warehouse_code_line) firstWarehouse = String(data.warehouse_code_line).trim();
      this.deriveUnitPrice(data, sourceTotals);
      rows.push({ row_no: r, data, source_totals: sourceTotals });
    }
    if (rows.length === 0) return null;
    let warehouseCode = '';
    for (let r = 1; r <= Math.min(6, ws.rowCount); r++) {
      const cell = ws.getRow(r).getCell(2).value;
      const text = String(cell || '');
      const match = text.match(/warehouse\s*[:：]\s*(.+)/i);
      if (match) { warehouseCode = match[1].trim(); break; }
    }
    return { ok: true, rows, warehouseCode: warehouseCode || firstWarehouse, notes: 'Excel 表头已自动识别并转换', currency: this.detectCurrency(ws) };
  }

  private detectCurrency(ws: ExcelJS.Worksheet): 'RMB' | 'USD' {
    let text = '';
    for (let r = 1; r <= Math.min(100, ws.rowCount); r++) {
      for (let c = 1; c <= 40; c++) {
        const value: any = ws.getRow(r).getCell(c).value;
        if (value && typeof value === 'object' && Array.isArray(value.richText)) {
          text += value.richText.map((part: any) => String(part?.text || '')).join('') + ' ';
        } else if (value && typeof value === 'object' && 'text' in value) text += String(value.text) + ' ';
        else if (value && typeof value === 'object' && 'result' in value) text += String(value.result) + ' ';
        else if (value != null) text += String(value) + ' ';
      }
    }
    return /usd|美元|美金/i.test(text) ? 'USD' : 'RMB';
  }

  private colLetter(index: number): string {
    let n = index, out = '';
    while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }

  /** 各 sheet 取前 15 行 × 前 40 列样例 + 总行数（只送样例，控制 token 与隐私） */
  private extractSamples(wb: ExcelJS.Workbook): SheetSample[] {
    const out: SheetSample[] = [];
    for (const ws of wb.worksheets) {
      if (ws.name === 'TEMPLATE_META') continue;
      const sample: any[][] = [];
      const maxRow = Math.min(ws.rowCount, 15);
      for (let r = 1; r <= maxRow; r++) {
        const row = ws.getRow(r);
        const vals: any[] = [];
        for (let c = 1; c <= 40; c++) {
          let v: any = row.getCell(c).value;
          if (v && typeof v === 'object' && 'result' in v) v = v.result;
          vals.push(v ?? null);
        }
        sample.push(vals);
      }
      out.push({ name: ws.name, rowCount: ws.rowCount, sample });
    }
    return out;
  }

  private async requestMapping(sheets: SheetSample[], cfg: ResolvedAiConfig): Promise<AiMapping> {
    const { baseUrl, apiKey, model, timeoutMs } = cfg;

    const fieldDict = FIELD_DICTIONARY
      .filter(f => !f.formula || ['total_pcs', 'total_price', 'total_cbm'].includes(f.field_key))
      .map(f => ({
        field_key: f.field_key,
        header_cn: f.header_cn,
        type: f.data_type,
        required: !!f.required,
        ...(f.enum_values ? { enum_values: f.enum_values } : {}),
        ...(f.remark ? { remark: f.remark } : {})
      }));

    const system = [
      '你是物流装箱清单结构识别助手。用户会给你若干 Excel sheet 的样例行（JSON 数组，按行排列）。',
      '请识别哪个 sheet 是装箱清单数据页、表头在哪一行、数据从哪一行开始，并给出源列字母到目标字段 field_key 的映射。',
      '只输出 JSON，不要输出任何解释。结构：',
      '{"sheet":"数据页名称","header_row":表头行号,"data_start_row":数据起始行号,"warehouse_code":"入仓号(若样例中能找到，否则空字符串)","mapping":{"<field_key>":"源列字母(如 A,B,C)" 或 null},"notes":"简短说明"}',
      'mapping 必须包含每个你能识别的目标字段；确实找不到来源列的填 null。total_pcs、total_price、total_cbm 虽然由后端重算，也必须识别原始来源列，供缺少单价、体积时推导使用。',
      '如果样例中只有一个品名列，可以同时映射到 product_cn 与 product_en。',
      'carton_no 是箱号（如 1 或 1-167）；cartons 是箱数（每行箱数）；pcs_per_carton 是每箱件数；total_pcs 是总件数，必须等于 cartons × pcs_per_carton。不要把箱数、每箱件数、总件数混淆。',
      'unit_price 是单价，total_price 是总价（金额必须等于 total_pcs × unit_price）。如果只有总金额和总件数而没有单价，必须同时识别 total_price 与 total_pcs 的来源列，后端再按 总金额÷总件数 计算单价，不能臆造单价。如果源文件含 10-12 位 HS Code，保留原样，不要改写。材质只选 不带电/带电/含电池/其他。',
      '尺寸按列出现顺序映射为 length_cm、width_cm、height_cm，不要重复映射到同一列；unit_cbm/total_cbm 由后端用 长×宽×高×箱数 重算，不要凭感觉猜。',
      '如果源表头出现多行标题、重复标题、合计行，只返回真正的表头行和第一条商品数据行；合计行不是商品行。不要猜测不存在的列，不确定就返回 null 并说明 notes。',
      'warehouse_code 通常出现在标题区（如"入仓号：XXX"）而非数据区。'
    ].join('\n');

    const user = JSON.stringify({ target_fields: fieldDict, sheets });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI 服务返回 ${res.status}：${text.slice(0, 200)}`);
    }
    const body: any = await res.json();
    let content: string = body?.choices?.[0]?.message?.content || '';
    content = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed: AiMapping;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('AI 返回的结构映射不是有效 JSON');
    }
    if (!parsed.mapping || typeof parsed.mapping !== 'object') {
      throw new Error('AI 返回缺少 mapping 字段');
    }
    return parsed;
  }

  private colToIndex(col: string): number {
    let n = 0;
    for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
  }

  private readSourceTotals(row: ExcelJS.Row, mapping: Record<string, string | null>) {
    const read = (field: string) => {
      const col = mapping[field];
      if (!col) return null;
      let value: any = row.getCell(this.colToIndex(col) + 1).value;
      if (value && typeof value === 'object' && 'result' in value) value = value.result;
      const parsed = toNumberLike(value);
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
    };
    return { total_pcs: read('total_pcs'), total_price: read('total_price'), total_cbm: read('total_cbm') };
  }

  private applyMapping(wb: ExcelJS.Workbook, m: AiMapping): AiConvertSuccess | AiConvertFailure {
    const ws = wb.worksheets.find(w => w.name === m.sheet) || wb.worksheets[0];
    if (!ws) return { ok: false, reason: 'AI 指定的数据页不存在' };

    const start = Math.max(1, m.data_start_row || ((m.header_row || 1) + 1));
    const rows: ConvertedRow[] = [];
    let firstWarehouseLine = '';
    for (let r = start; r <= ws.rowCount; r++) {
      const excelRow = ws.getRow(r);
      if (!excelRow || !excelRow.cellCount) continue;
      const data: Record<string, any> = {};
      const sourceTotals = this.readSourceTotals(excelRow, m.mapping);
      let nonEmpty = 0;
      for (const f of FIELD_DICTIONARY) {
        if (f.formula) continue;
        const col = m.mapping[f.field_key];
        if (!col) { data[f.field_key] = null; continue; }
        let v: any = excelRow.getCell(this.colToIndex(col) + 1).value;
        if (v && typeof v === 'object' && 'result' in v) v = v.result;
        if (NUMERIC_TYPES.has(f.data_type) && v !== null && v !== undefined && v !== '') {
          v = toNumberLike(v);
        }
        if (v !== null && v !== undefined && v !== '') nonEmpty++;
        data[f.field_key] = v ?? null;
      }
      if (nonEmpty === 0) continue;
      const identity = String(data.sku || data.product_en || data.product_cn || '').trim();
      if (/^(total|合计|总计|subtotal)$/i.test(identity)) continue;
      if (/商品名称|产品名称|nome\s*do\s*produto/i.test(String(data.product_cn || data.product_en || ''))) continue;
      if (!identity && !data.carton_no) continue;
      if (!firstWarehouseLine && data.warehouse_code_line) {
        firstWarehouseLine = String(data.warehouse_code_line).trim();
      }
      data.product_en = String(data.product_en || data.product_cn || data.sku || '').trim();
      data.product_cn = String(data.product_cn || data.product_en || data.sku || '').trim();
      data.sku = String(data.sku || data.product_en || data.product_cn || `ITEM-${r}`).trim();
      data.description = String(data.description || data.product_en || data.product_cn || data.sku).trim();
      data.material = ['不带电', '带电', '含电池', '其他'].includes(String(data.material || '').trim()) ? data.material : '其他';
      this.deriveUnitPrice(data, sourceTotals);
      rows.push({ row_no: r, data, source_totals: sourceTotals });
    }
    if (rows.length === 0) {
      return { ok: false, reason: `AI 识别数据起始行为第 ${start} 行，但未读到有效数据` };
    }

    return {
      ok: true,
      rows,
      warehouseCode: (m.warehouse_code || '').trim() || firstWarehouseLine,
      notes: m.notes,
      currency: this.detectCurrency(ws)
    };
  }
}
