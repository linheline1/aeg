require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const {
  tokenize, scoreChunks, chunksFromMarkdown, cellText, cleanCellText,
  validatePriceTable, priceTableChunks
} = require('../dist/knowledge/knowledge.utils');
const { KnowledgeService } = require('../dist/knowledge/knowledge.service');
const { PRICE_TABLE } = require('../dist/inquiry/price-table');
const { estimate, renderEstimateText } = require('../dist/inquiry/quote-estimator');

function stubRepo(overrides = {}) {
  return {
    findAll: async () => [],
    findCurrentPriceTable: async () => null,
    ...overrides
  };
}

test('tokenize handles Chinese bigrams, Latin words and channel codes', () => {
  const tokens = tokenize('巴西海运 AYZL0001 capinhas de celular 手机壳');
  assert.ok(tokens.includes('手机壳'));
  assert.ok(tokens.includes('巴西'));
  assert.ok(tokens.includes('ayzl0001'));
  assert.ok(tokens.includes('capinhas'));
  assert.ok(tokens.includes('celular'));
});

test('scoreChunks ranks tag/title matches above body-only matches', () => {
  const docs = [
    { id: 'a', title: '通用说明', tags: [], chunks: [{ heading: '正文', text: '巴西 手机壳 价格 说明' }] },
    { id: 'b', title: '巴西海运费率', tags: ['巴西', '海运'], chunks: [{ heading: '巴西海运', text: '分段单价 820 USD/CBM' }] }
  ];
  const hits = scoreChunks('巴西海运 手机壳', docs, 5);
  assert.equal(hits[0].docId, 'b');
  assert.ok(hits[0].score > hits[1].score);
});

test('scoreChunks returns nothing for empty query', () => {
  assert.deepEqual(scoreChunks('', [{ id: 'a', title: 'x', tags: [], chunks: [] }]), []);
});

test('chunksFromMarkdown splits by heading and caps long blocks', () => {
  const md = '## 巴西海运\n| 分类 | 单价 |\n| 手机壳 | 820 |\n\n## 空运\n| 分类 | 单价 |\n| 手机壳 | 36 |';
  const chunks = chunksFromMarkdown(md, '全文');
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].heading, '巴西海运');
  assert.ok(chunks[0].text.includes('820'));
  assert.equal(chunks[1].heading, '空运');
});

test('cellText flattens richText, formula results and dates', () => {
  assert.equal(cellText({ richText: [{ text: '巴西' }, { text: '海运' }] }), '巴西海运');
  assert.equal(cellText({ result: 820 }), '820');
  assert.equal(cellText({ text: 'capinha' }), 'capinha');
  assert.equal(cellText(null), '');
  assert.equal(cellText(820), '820');
});

test('cleanCellText drops WPS DISPIMG placeholders but keeps real text', () => {
  assert.equal(cleanCellText('=DISPIMG("ID_E105912228EF44C38E55CD997429C27F",1)'), '');
  assert.equal(cleanCellText('手机壳'), '手机壳');
  assert.equal(cleanCellText({ result: 820 }), '820');
});

test('validatePriceTable rejects broken structures', () => {  assert.equal(validatePriceTable(null), false);
  assert.equal(validatePriceTable({ version: 'x', channels: [] }), false);
  assert.equal(validatePriceTable(PRICE_TABLE), true);
});

test('priceTableChunks creates one chunk per channel plus meta', () => {
  const chunks = priceTableChunks(PRICE_TABLE);
  assert.equal(chunks.length, PRICE_TABLE.channels.length + 1);
  assert.equal(chunks[0].heading, '价目表说明');
  assert.ok(chunks.some(c => c.heading.includes('AYZL0001')));
});

test('estimate accepts an injected price table (knowledge-driven pricing)', () => {
  const base = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 });
  const baseTotal = base.estimates.find(x => x.channelCode === 'AYZL0001').total;
  assert.equal(baseTotal, 4100);

  const custom = JSON.parse(JSON.stringify(PRICE_TABLE));
  custom.version = '20270101';
  custom.channels[0].classes[0].prices = [900, 900, 900];
  const changed = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 }, custom);
  assert.equal(changed.estimates.find(x => x.channelCode === 'AYZL0001').total, 4500);
});

test('renderEstimateText shows the knowledge table version, not a hardcoded one', () => {
  const output = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 });
  const text = renderEstimateText(output, {}, 'zh', { version: '20270101', title: '新版报价表' });
  assert.ok(text.includes('2027-01-01'));
  assert.ok(text.includes('新版报价表'));
  assert.ok(!text.includes('2026-09-24'));
});

test('KnowledgeService falls back to builtin table when repo has no current doc', async () => {
  const active = await new KnowledgeService(stubRepo()).activePriceTable();
  assert.equal(active.source, 'builtin');
  assert.equal(active.version, PRICE_TABLE.version);
  assert.equal(active.table.channels.length, PRICE_TABLE.channels.length);
});

test('KnowledgeService reads current price table from the knowledge base', async () => {
  const custom = JSON.parse(JSON.stringify(PRICE_TABLE));
  custom.version = '20270101';
  const repo = stubRepo({
    findCurrentPriceTable: async () => ({
      id: 'doc-1', title: '新价目表', version: '20270101', content: JSON.stringify(custom)
    })
  });
  const active = await new KnowledgeService(repo).activePriceTable();
  assert.equal(active.source, 'knowledge');
  assert.equal(active.docId, 'doc-1');
  assert.equal(active.table.version, '20270101');
});

test('KnowledgeService falls back when stored table is corrupted', async () => {
  const repo = stubRepo({
    findCurrentPriceTable: async () => ({ id: 'bad', title: '坏数据', version: 'x', content: '{not json' })
  });
  const active = await new KnowledgeService(repo).activePriceTable();
  assert.equal(active.source, 'builtin');
});

test('KnowledgeService.search returns scored chunks and bounded context', async () => {
  const repo = stubRepo({
    findAll: async () => [{
      id: 'd1', title: '巴西分区表', tags: ['巴西', '分区'],
      chunks: [{ heading: '圣保罗', text: 'CEP 0 开头为圣保罗市区，其他州加收 10 RMB/KG' }]
    }]
  });
  const hits = await new KnowledgeService(repo).search('圣保罗 分区 加收', 3);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].score > 0);
  const context = KnowledgeService.renderContext(hits, 50);
  assert.ok(context.length <= 50 + 200); // 单块超限时直接不纳入
});

test('parseWorkbookFile converts xlsx sheets into markdown and chunks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeg-kb-'));
  const file = path.join(dir, 'quote.xlsx');
  try {
    const wb = new ExcelJS.Workbook();
    const sea = wb.addWorksheet('巴西海运');
    sea.addRow(['分类', '1-5CBM', '5-10CBM']);
    sea.addRow(['手机壳', 820, 800]);
    const note = wb.addWorksheet('说明');
    note.addRow(['备注', '带电货物需单独询价']);
    await wb.xlsx.writeFile(file);

    const service = new KnowledgeService(stubRepo());
    const parsed = await service.parseWorkbookFile(file);
    assert.deepEqual(parsed.sheetNames, ['巴西海运', '说明']);
    assert.equal(parsed.rowCount, 3);
    assert.ok(parsed.markdown.includes('## 巴西海运'));
    assert.ok(parsed.markdown.includes('手机壳'));
    assert.ok(parsed.chunks.length >= 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
