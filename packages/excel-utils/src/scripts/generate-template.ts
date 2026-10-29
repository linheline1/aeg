import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import {
  FIELD_DICTIONARY,
  FORMULA_COLUMNS,
  DATA_START_ROW,
  TEMPLATE_MAX_ROWS,
  SUMMARY_CHECK_COLUMNS
} from '@aeg/shared-types';
import { computeSchemaHash, writeTemplateMeta } from '../index.js';
import type { TemplateMeta } from '../index.js';

/**
 * 生成 PRD v2.0 巴西整柜装箱清单模板
 *
 * Sheet1 结构：
 *   Row 1 — 说明区（锁定，合并 A1:AA1）
 *   Row 2 — 入仓号提示（A2 固定文案，B2 客户填写）
 *   Row 3 — 表头（锁定，按 FIELD_DICTIONARY 列顺序 A→AA）
 *   Row 4 — 合计行（锁定，公式 =SUM($5:$104) 覆盖 SUMMARY_CHECK_COLUMNS）
 *   Row 5..104 — 数据填写区（100 行）
 * 隐藏 Sheet：TEMPLATE_META（meta JSON 写入 A1）
 */
async function generateTemplate(outputPath: string, version = '2.0'): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AEG DDP System';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('巴西整柜装箱清单', {
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  // ===== Row 1 — 说明区 =====
  ws.mergeCells('A1:AA1');
  ws.getCell('A1').value = '请按此模板做装箱清单，不允许修改格式（公式列请勿动；图片可选；入仓号选填；每行一个 SKU；箱号可填范围如 1-167）';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFF6600' }, size: 11 };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;

  // ===== Row 2 — 入仓号 =====
  ws.getCell('A2').value = '入仓号（整票，选填）：';
  ws.getCell('A2').font = { bold: true };
  ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
  ws.getRow(2).height = 22;
  // B2 开放填写
  ws.getCell('B2').protection = { locked: false };

  // ===== Row 3 — 表头 =====
  ws.getRow(3).height = 44;
  ws.getRow(3).font = { bold: true, size: 10 };
  ws.getRow(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  for (const f of FIELD_DICTIONARY) {
    const cell = ws.getCell(`${f.col_letter}3`);
    cell.value = f.header_cn;
    if (f.col_letter === 'O') {
      ws.mergeCells('O3:Q3');
      cell.value = '外箱尺寸 (CM)';
    }
    if (f.col_letter === 'X' || f.col_letter === 'Y') {
      cell.font = { bold: true, italic: true, color: { argb: 'FF888888' } };
    }
  }

  // ===== Row 4 — 合计行 =====
  ws.getRow(4).height = 20;
  ws.getRow(4).font = { bold: true };
  ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
  ws.getCell('A4').value = '合计 →';
  ws.getCell('A4').font = { bold: true, italic: true };

  const endDataRow = DATA_START_ROW + TEMPLATE_MAX_ROWS - 1; // 104
  for (const col of SUMMARY_CHECK_COLUMNS) {
    ws.getCell(`${col}4`).value = { formula: `SUM(${col}5:${col}${endDataRow})` };
  }

  // ===== Row 5..104 — 公式预填 =====
  for (let r = DATA_START_ROW; r <= endDataRow; r++) {
    ws.getCell(`J${r}`).value = { formula: `H${r}*I${r}` };
    ws.getCell(`M${r}`).value = { formula: `H${r}*K${r}` };
    ws.getCell(`N${r}`).value = { formula: `H${r}*L${r}` };
    ws.getCell(`R${r}`).value = { formula: `O${r}*P${r}*Q${r}/1000000` };
    ws.getCell(`S${r}`).value = { formula: `R${r}*H${r}` };
    ws.getCell(`U${r}`).value = { formula: `T${r}*J${r}` };

    // 开放数据区可编辑单元格
    for (const f of FIELD_DICTIONARY) {
      if (f.editable && !FORMULA_COLUMNS.includes(f.col_letter)) {
        ws.getCell(`${f.col_letter}${r}`).protection = { locked: false };
      }
    }
  }

  // ===== 数据验证（仅首行；整表由 Excel 模板自身规则约束即可）=====
  ws.getCell('H5').dataValidation = {
    type: 'whole',
    operator: 'between',
    formulae: ['1', '99999'],
    showErrorMessage: true,
    errorTitle: '请输入正整数',
    error: '箱数必须是 1-99999 的正整数'
  };
  ws.getCell('I5').dataValidation = {
    type: 'whole',
    operator: 'between',
    formulae: ['1', '99999'],
    showErrorMessage: true,
    errorTitle: '请输入正整数',
    error: '单箱件数必须是 1-99999 的正整数'
  };
  ws.getCell('V5').dataValidation = {
    type: 'list',
    formulae: ['"不带电,带电,含电池,其他"'],
    showErrorMessage: true,
    errorTitle: '请从下拉列表选择'
  };
  ws.getCell('E5').dataValidation = {
    type: 'textLength',
    operator: 'equal',
    formulae: ['8'],
    showErrorMessage: true,
    errorTitle: 'HS Code',
    error: 'HS Code 应为 8 位数字'
  };

  // ===== 条件格式：必填为空标黄 =====
  const requiredCols = FIELD_DICTIONARY.filter(
    f => f.required && f.data_type !== 'FORMULA' && f.data_type !== 'IMAGE'
  ).map(f => f.col_letter);

  for (const col of requiredCols) {
    try {
      ws.addConditionalFormatting({
        ref: `${col}${DATA_START_ROW}:${col}${endDataRow}`,
        rules: [
          {
            priority: 1,
            type: 'cellIs',
            operator: 'equal',
            formulae: ['""'],
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFFF00' } } }
          } as any
        ]
      });
    } catch {
      // 某些 ExcelJS 版本条件格式 API 略有差异；跳过不阻断模板生成
    }
  }

  // 条件格式：毛重 < 净重 标红（仅第 1 行，Excel 模板自身可扩展）
  try {
    ws.addConditionalFormatting({
      ref: `L${DATA_START_ROW}:L${endDataRow}`,
      rules: [
        {
          priority: 2,
          type: 'expression',
          formulae: [`AND(K${DATA_START_ROW}<>"", L${DATA_START_ROW}<>"", L${DATA_START_ROW}<K${DATA_START_ROW})`],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFF9999' } } }
        } as any
      ]
    });
  } catch {
    // ignore
  }

  // ===== 列宽 =====
  const widths: Record<string, number> = {
    A: 12, B: 18, C: 14, D: 12, E: 14, F: 14, G: 16,
    H: 8, I: 10, J: 10, K: 12, L: 12, M: 12, N: 12,
    O: 10, P: 10, Q: 10, R: 12, S: 12, T: 12, U: 12,
    V: 12, W: 30, X: 20, Y: 20, Z: 18, AA: 20
  };
  for (const f of FIELD_DICTIONARY) {
    ws.getColumn(f.col_letter).width = widths[f.col_letter] || 12;
  }

  // ===== 工作表保护 =====
  // 锁定所有单元格（默认），仅开放 Row 5..104 的可编辑字段 + B2
  ws.protect('ddp2025', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    deleteColumns: false,
    insertRows: false,
    deleteRows: false,
    insertHyperlinks: false,
    sort: false,
    autoFilter: false,
    pivotTables: false
  });

  // ===== 隐藏 Sheet TEMPLATE_META =====
  const meta: TemplateMeta = {
    template_id: 'BR_FCL',
    version,
    schema_hash: computeSchemaHash(),
    published_at: new Date().toISOString(),
    min_rows: 1,
    max_rows: TEMPLATE_MAX_ROWS
  };
  writeTemplateMeta(wb, meta);

  // ===== 保存 =====
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await wb.xlsx.writeFile(outputPath);
  console.log(`✅ 模板已生成：${outputPath}`);
  console.log(`   schema_hash = ${meta.schema_hash}`);
  console.log(`   max_rows    = ${meta.max_rows}`);
  return outputPath;
}

// CLI 入口
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  const out =
    process.argv[2] ||
    path.resolve(
      __dirname,
      '../../../../apps/api/uploads/templates/巴西整柜装箱清单_模板_v2.0.xlsx'
    );
  generateTemplate(out).catch(err => {
    console.error('❌ 生成失败：', err);
    process.exit(1);
  });
}

export { generateTemplate };
