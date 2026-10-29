import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { FIELD_DICTIONARY, FORMULA_COLUMNS, DATA_START_ROW, TEMPLATE_MAX_ROWS } from '@aeg/shared-types';

/** 读取隐藏 Sheet TEMPLATE_META 的 JSON；不存在或损坏返回 null */
export async function readTemplateMeta(filePath: string): Promise<TemplateMeta | null> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const hidden = wb.worksheets.find(ws => ws.name === 'TEMPLATE_META');
    if (!hidden) return null;
    const a1 = hidden.getCell('A1').value;
    if (!a1 || typeof a1 !== 'string') return null;
    return JSON.parse(a1);
  } catch {
    return null;
  }
}

/** 写入隐藏 Sheet TEMPLATE_META（workbook 必须尚未保存） */
export function writeTemplateMeta(wb: ExcelJS.Workbook, meta: TemplateMeta): void {
  const hidden = wb.addWorksheet('TEMPLATE_META', { state: 'hidden' });
  hidden.getCell('A1').value = JSON.stringify(meta);
}

/** 模板元信息 */
export interface TemplateMeta {
  template_id: string; // 如 "BR整柜"
  version: string; // 如 "2.0"
  schema_hash: string; // 字段 + 公式列排序后的 SHA256
  published_at: string; // ISO 时间
  min_rows: number;
  max_rows: number;
}

/**
 * 计算 schema_hash：
 *   对 FIELD_DICTIONARY 按 sort_order 排序后，取 col_letter + field_key + formula(如有) 拼接 JSON，SHA256
 * 上传校验时客户端模板的 TEMPLATE_META.schema_hash 必须与当前启用版本一致。
 */
export function computeSchemaHash(): string {
  const sorted = [...FIELD_DICTIONARY].sort((a, b) => a.sort_order - b.sort_order);
  const payload = sorted.map(f => ({
    col: f.col_letter,
    key: f.field_key,
    formula: f.formula || null,
    required: f.required
  }));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** 校验模板版本（供 M2 上传时用） */
export async function validateTemplateMeta(
  filePath: string,
  expectedVersion: string,
  expectedSchemaHash?: string
): Promise<{ ok: boolean; reason?: string; meta?: TemplateMeta }> {
  const meta = await readTemplateMeta(filePath);
  if (!meta) return { ok: false, reason: 'TEMPLATE_META 缺失或损坏' };
  if (meta.version !== expectedVersion) {
    return { ok: false, reason: `模板版本不一致（${meta.version} ≠ ${expectedVersion}），请下载最新模板`, meta };
  }
  if (expectedSchemaHash && meta.schema_hash !== expectedSchemaHash) {
    return { ok: false, reason: '模板 schema 已被修改，请下载最新模板', meta };
  }
  return { ok: true, meta };
}

/** 工具：Excel 列字母 → 0-based index */
export function colLetterToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** 工具：0-based index → Excel 列字母 */
export function indexToColLetter(idx: number): string {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export { FORMULA_COLUMNS, DATA_START_ROW, TEMPLATE_MAX_ROWS };
