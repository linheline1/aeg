const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { mock } = require('node:test');
const ExcelJS = require('exceljs');
const { DATA_START_ROW, FIELD_DICTIONARY } = require('../../../packages/shared-types/dist');
const storage = require('../dist/common/mock-db');
const { QuoteService } = require('../dist/upload/quote.service');
const { UploadDraftsRepo } = require('../dist/upload/upload-draft.repository');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/M1sAAAAASUVORK5CYII=', 'base64');
const actor = { username: 'quote-test', role: 'client' };
const fx = 5.6637;

function productRow(index, hsCode = '56090000') {
  return {
    row_no: DATA_START_ROW + index,
    data: {
      product_cn: '测试绑带',
      product_en: 'Synthetic strap',
      sku: 'TEST-' + index,
      hs_code: hsCode,
      cartons: 2,
      pcs_per_carton: 4,
      nw_per_carton: 2,
      gw_per_carton: 3,
      length_cm: 30,
      width_cm: 20,
      height_cm: 10,
      unit_price: index === 0 ? 112.852 : 1,
      material: '不带电',
      description: 'Synthetic regression specimen'
    },
    source_totals: { total_pcs: 8, total_price: index === 0 ? 902.82 : 8 }
  };
}

async function makeWorkbook(filename, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Quote');
  const imageId = workbook.addImage({ buffer: png, extension: 'png' });
  for (const row of rows) {
    for (const field of FIELD_DICTIONARY) {
      const value = row.data[field.field_key] ?? row.source_totals[field.field_key];
      if (value != null) worksheet.getCell(field.col_letter + row.row_no).value = value;
    }
    const placement = { tl: { col: 22, row: row.row_no - 1 }, ext: { width: 16, height: 16 } };
    worksheet.addImage(imageId, placement);
  }
  // One extra placement in the same row must not result in a duplicate.
  worksheet.addImage(imageId, { tl: { col: 23, row: rows[0].row_no - 1 }, ext: { width: 16, height: 16 } });
  const meta = workbook.addWorksheet('TEMPLATE_META', { state: 'hidden' });
  meta.getCell('A1').value = JSON.stringify({ template_id: 'BR_FCL', version: '2.0' });
  await workbook.xlsx.writeFile(filename);
}

function memoryRepositories(client) {
  const drafts = new Map();
  const quotes = new Map();
  const images = [];
  return {
    quotes: {
      async insert(row) {
        const saved = { ...row, id: randomUUID() };
        quotes.set(saved.id, saved);
        return saved;
      },
      async findById(id) { return quotes.get(id); }
    },
    clients: { async findOne() { return client; } },
    drafts: {
      withLock: UploadDraftsRepo.prototype.withLock,
      async insert(row) { drafts.set(row.id, structuredClone(row)); },
      async findById(id) { return structuredClone(drafts.get(id)); },
      async update(id, change) {
        const row = drafts.get(id);
        return row ? structuredClone(Object.assign(row, change)) : null;
      }
    },
    images: {
      async insertMany(rows) { images.push(...rows); },
      async findByQuote(id) { return images.filter(row => row.quote_id === id); }
    }
  };
}

function quoteService(repos, ai) {
  return new QuoteService(
    repos.quotes,
    { async resolve() { return { rates: { fx_rate: fx } }; } },
    { async entry() {} },
    repos.clients,
    repos.images,
    repos.drafts,
    { async isEnabled() { assert.fail('The standard template should not require AI conversion'); } },
    ai ?? { async suggest() { assert.fail('Complete NCMs should not call the model'); } }
  );
}

async function isolatedWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aeg-quote-test-'));
  const patched = mock.method(storage, 'repoRoot', () => root);
  t.after(async () => {
    patched.mock.restore();
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

async function runUploadRegression(t, repos, clientId, concurrent = false) {
  const root = await isolatedWorkspace(t);
  const service = quoteService(repos);
  const filename = path.join(root, 'synthetic.xlsx');
  const rows = Array.from({ length: 10 }, (_, index) => productRow(index));
  await makeWorkbook(filename, rows);

  const preview = await service.previewUpload(filename, 'synthetic.xlsx', clientId, '2.0');
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.deepEqual(preview.errors ?? [], []);
  assert.equal(preview.rows.length, 10);
  assert.equal(preview.rows[0].source_totals.total_price, 902.82);
  assert.ok(Math.abs(preview.rows[0].data.total_price - 902.816) < 1e-8);

  const edited = structuredClone(preview.rows);
  edited[0].data.unit_price += 1;
  const rejected = await service.confirmUpload(preview.draft_id, clientId, edited, 'USD', actor);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some(issue => issue.field_key === 'total_price'));
  assert.equal((await repos.drafts.findById(preview.draft_id)).status, 'preview');

  const submit = () => quoteService(repos).confirmUpload(preview.draft_id, clientId, preview.rows, 'USD', actor);
  const [confirmed, concurrentReplay] = await Promise.all(concurrent ? [submit(), submit()] : [submit()]);
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
  assert.equal(confirmed.embedded_image_count, 10);
  const quote = await repos.quotes.findById(confirmed.quote_id);
  assert.equal(quote.source_draft_id, preview.draft_id);
  if (concurrentReplay) assert.equal(concurrentReplay.quote_id, quote.id);
  assert.equal(quote.declared_currency, 'USD');
  assert.equal(quote.status, 'uploaded');
  assert.ok(Math.abs(quote.line_items[0].total_price - 5113.2789792) < 1e-8);
  assert.equal((await repos.drafts.findById(preview.draft_id)).status, 'confirmed');

  const images = await repos.images.findByQuote(quote.id);
  assert.deepEqual(images.map(image => image.row_no).sort((a, b) => a - b), rows.map(row => row.row_no));
  for (const image of images) assert.deepEqual(await fs.readFile(path.join(root, image.file_path)), png);

  const replay = await service.confirmUpload(preview.draft_id, clientId, preview.rows, 'USD', actor);
  assert.equal(replay.quote_id, quote.id);
  return quote;
}

module.exports = { isolatedWorkspace, memoryRepositories, productRow, quoteService, runUploadRegression };
