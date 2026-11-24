import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PRICE_TABLE, type PriceTable } from '../inquiry/price-table';
import type { KnowledgeDocRepo, KnowledgeDocRow, KnowledgeChunk } from '../common/mock-db';
import {
  cleanCellText, chunksFromMarkdown, scoreChunks, validatePriceTable,
  type SearchDoc, type SearchHit
} from './knowledge.utils';

export interface ActivePriceTable {
  table: PriceTable;
  source: 'knowledge' | 'builtin';
  docId: string | null;
  version: string;
  title: string;
}

export interface WorkbookParseResult {
  title: string;
  markdown: string;
  chunks: KnowledgeChunk[];
  sheetNames: string[];
  rowCount: number;
}

export interface ImportOptions {
  title?: string;
  tags?: string[];
  version?: string;
  effectiveDate?: string | null;
  summary?: string;
  createdBy?: string;
  /** 原始文件名（上传时用 file.originalname，避免落临时文件名） */
  sourceFile?: string;
}

const MAX_ROWS_PER_SHEET = 300;
const MAX_CELLS_PER_ROW = 24;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger('Knowledge');

  constructor(@Inject('KnowledgeDocRepo') private readonly docs: KnowledgeDocRepo) {}

  /**
   * 当前启用的价目表。知识库无有效条目或内容损坏时回退到内置 PRICE_TABLE，
   * 保证 AI 询价永远不会因为后台误删资料而失去报价能力。
   */
  async activePriceTable(): Promise<ActivePriceTable> {
    try {
      const row = await this.docs.findCurrentPriceTable();
      if (row) {
        const parsed = JSON.parse(row.content);
        if (validatePriceTable(parsed)) {
          return {
            table: parsed as unknown as PriceTable,
            source: 'knowledge', docId: row.id,
            version: row.version || String(parsed.version),
            title: row.title
          };
        }
        this.logger.warn(`knowledge price table ${row.id} is invalid, falling back to builtin`);
      }
    } catch (error) {
      this.logger.warn(`knowledge price table read failed: ${String(error)}`);
    }
    return { table: PRICE_TABLE, source: 'builtin', docId: null, version: PRICE_TABLE.version, title: '内置价目表' };
  }

  /** 关键词检索：返回可注入 AI prompt 的片段 */
  async search(query: string, limit = 4): Promise<SearchHit[]> {
    if (!query || !query.trim()) return [];
    const rows = await this.docs.findAll();
    const searchDocs: SearchDoc[] = rows.map(row => ({
      id: row.id, title: row.title, tags: row.tags || [], chunks: row.chunks || []
    }));
    return scoreChunks(query, searchDocs, limit);
  }

  /** 把 AI 检索片段拼成 prompt context（含来源标注，便于模型引用） */
  static renderContext(hits: SearchHit[], maxChars = 2600): string {
    if (!hits.length) return '';
    const parts: string[] = [];
    let used = 0;
    for (const hit of hits) {
      const block = `[知识库:${hit.title} / ${hit.heading}]\n${hit.text}`;
      if (used + block.length > maxChars) break;
      parts.push(block);
      used += block.length;
    }
    return parts.join('\n\n');
  }

  /** xlsx → 每 sheet 一段 Markdown 表格；WPS 内嵌图片部件不影响单元格读取 */
  async parseWorkbookFile(filePath: string): Promise<WorkbookParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheetNames: string[] = [];
    const parts: string[] = [];
    let totalRows = 0;

    workbook.eachSheet((sheet) => {
      const name = String(sheet.name || 'Sheet').trim();
      sheetNames.push(name);
      const lines: string[] = [`## ${name}`, ''];
      let rowCount = 0;
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rowCount >= MAX_ROWS_PER_SHEET) return;
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (cells.length >= MAX_CELLS_PER_ROW) return;
          cells.push(cleanCellText(cell.value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim());
        });
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (!cells.some(Boolean)) return;
        // 合并单元格会让同一个值在整行重复，去掉相邻重复项让检索片段可读
        const deduped = cells.filter((value, index) => index === 0 || value !== cells[index - 1]);
        lines.push(`| ${deduped.join(' | ')} |`);
        rowCount++;
        totalRows++;
      });
      if (rowCount) parts.push(lines.join('\n'));
    });

    const markdown = parts.join('\n\n');
    return {
      title: path.basename(filePath, path.extname(filePath)),
      markdown,
      chunks: chunksFromMarkdown(markdown, '报价表全文'),
      sheetNames,
      rowCount: totalRows
    };
  }

  /** 从上传的 xlsx 创建一条 doc 知识库文档 */
  async importWorkbook(filePath: string, options: ImportOptions = {}): Promise<KnowledgeDocRow> {
    const parsed = await this.parseWorkbookFile(filePath);
    if (!parsed.rowCount) throw new Error('工作簿中没有可读的数据行');
    return this.docs.insert({
      title: options.title?.trim() || parsed.title,
      kind: 'doc',
      tags: options.tags?.length ? options.tags : ['报价表', '价目表', '报价', 'price table'],
      status: 'active',
      is_current: false,
      version: options.version?.trim() || '',
      effective_date: options.effectiveDate || null,
      source_file: options.sourceFile || path.basename(filePath),
      summary: options.summary?.trim() || `Excel 导入：${parsed.sheetNames.length} 个工作表，${parsed.rowCount} 行有效数据`,
      content: parsed.markdown,
      chunks: parsed.chunks,
      created_by: options.createdBy || 'system'
    });
  }

  /** 手动编辑 Markdown 正文后重建检索片段 */
  rebuildChunks(content: string): KnowledgeChunk[] {
    return chunksFromMarkdown(content, '全文');
  }
}
