#!/usr/bin/env node
/**
 * 把「内置结构化价目表」与「Excel 报价表全文」导入 dev.json 知识库。
 *
 * 用法：
 *   node apps/api/scripts/seed-knowledge.cjs                 # 仅导入内置结构化价目表
 *   node apps/api/scripts/seed-knowledge.cjs <xlsx路径>      # 指定 Excel
 *   node apps/api/scripts/seed-knowledge.cjs <xlsx路径> --force  # 重建 seed 条目（保留人工新建的条目）
 *
 * 需要先 `pnpm --filter @aeg/api build`（脚本 require dist）。
 * 生产 PostgreSQL 环境不用本脚本，改由管理端上传/新建。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../../..');
const DB_PATH = path.join(ROOT, 'apps/api/data/dev.json');

const { PRICE_TABLE } = require('../dist/inquiry/price-table');
const { priceTableChunks, chunksFromMarkdown } = require('../dist/knowledge/knowledge.utils');
const { KnowledgeService } = require('../dist/knowledge/knowledge.service');

const uid = () => crypto.randomUUID();

async function main() {
  const xlsx = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  const force = process.argv.includes('--force');
  const now = new Date().toISOString();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const existing = Array.isArray(db.knowledge_docs) ? db.knowledge_docs : [];

  if (existing.length && !force) {
    console.log(`已有 ${existing.length} 条知识库文档，跳过导入（如需重建 seed 条目请加 --force）`);
    return;
  }

  const seeds = [];

  // ① 结构化价目表：驱动确定性计价引擎
  seeds.push({
    id: uid(),
    title: '安易智链巴西/阿根廷报价表（结构化价目表）',
    kind: 'price_table',
    tags: ['报价表', '价目表', '巴西', '阿根廷', '海运', '空运', '小包', 'price table'],
    status: 'active',
    is_current: true,
    version: PRICE_TABLE.version,
    effective_date: PRICE_TABLE.effectiveDate || null,
    source_file: xlsx ? path.basename(xlsx) : null,
    summary: `结构化价目表：${PRICE_TABLE.channels.length} 个渠道；AI 询价计价引擎以此为准`,
    content: JSON.stringify(PRICE_TABLE, null, 2),
    chunks: priceTableChunks(PRICE_TABLE),
    created_by: 'seed',
    created_at: now,
    updated_at: now
  });

  // ② Excel 全文：转 Markdown 后作为可检索文档，供 AI 话术引用规则/备注
  if (xlsx && fs.existsSync(xlsx)) {
    const service = new KnowledgeService(null);
    const parsed = await service.parseWorkbookFile(xlsx);
    if (parsed.rowCount) {
      seeds.push({
        id: uid(),
        title: '安易智链巴西阿根廷报价表 20260924（原始表全文）',
        kind: 'doc',
        tags: ['报价表', '原始表', '巴西', '阿根廷', '专线', '海外仓', '反倾销', '货物属性'],
        status: 'active',
        is_current: false,
        version: '20260924',
        effective_date: '2026-09-01',
        source_file: path.basename(xlsx),
        summary: `Excel 全文导入：${parsed.sheetNames.length} 个工作表，${parsed.rowCount} 行；含分区、反倾销清单、货物属性矩阵`,
        content: parsed.markdown,
        chunks: chunksFromMarkdown(parsed.markdown, '报价表全文'),
        created_by: 'seed',
        created_at: now,
        updated_at: now
      });
      console.log(`Excel 解析：${parsed.sheetNames.length} sheet / ${parsed.rowCount} 行 / ${parsed.markdown.length} 字符`);
    } else {
      console.warn('Excel 中没有可读数据行，跳过全文导入');
    }
  } else if (xlsx) {
    console.warn(`未找到 Excel（${xlsx}），仅导入结构化价目表`);
  }

  const kept = force ? existing.filter(doc => doc.created_by !== 'seed') : existing;
  // 若人工已指定当前价目表，不要被 seed 抢占
  if (kept.some(doc => doc.kind === 'price_table' && doc.is_current && doc.status === 'active')) {
    seeds[0].is_current = false;
  }
  db.knowledge_docs = [...seeds, ...kept];
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`知识库种子写入完成：新增 ${seeds.length} 条，保留 ${kept.length} 条 → ${DB_PATH}`);
}

main().catch(error => { console.error(error); process.exit(1); });
