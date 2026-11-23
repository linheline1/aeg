const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AiNcmService } = require('../dist/order/ai-ncm.service');
const { calculateDi } = require('../dist/order/di-calculation');
const { calculateDdpPricing } = require('../dist/upload/ddp-pricing');
const { memoryRepositories, productRow, quoteService, runUploadRegression } = require('./quote-fixtures.cjs');

test('USD upload validates in original currency and retains ten image associations', async t => {
  const client = { id: 'client-1' };
  await runUploadRegression(t, memoryRepositories(client), client.id);
});

test('NCM completion preserves existing codes and rejects wrong prefixes or ten-digit model results', async t => {
  const client = { id: 'client-1' };
  const repos = memoryRepositories(client);
  const rows = ['560900', '0123459900', '8428399900', '9615119900', '85094010'].map((code, index) => productRow(index, code));
  await repos.drafts.insert({ id: 'draft', client_id: client.id, rows, status: 'preview' });
  const ai = new AiNcmService({
    async resolve() { return { baseUrl: 'https://example.invalid', apiKey: 'test-key', model: 'stub', timeoutMs: 1000 }; }
  }, {});
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    assert.match(prompt, /"current_hs_code":"012345","chinese_tariff_code":"0123459900"/);
    assert.doesNotMatch(prompt, /85094010/);
    const items = ['56090000', '01234580', '99999910', '9615119900'].map((ncm, index) => ({
      row_no: rows[index].row_no, ncm, confidence: 0.9
    }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ items }) } }] });
  });
  const result = await quoteService(repos, ai).aiCheckUpload('draft', client.id, rows);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.ncm_count, 2);
  assert.deepEqual(result.rows.map(row => row.data.hs_code), ['56090000', '01234580', '8428399900', '9615119900', '85094010']);
  assert.deepEqual(result.issues.map(issue => [issue.row, issue.field_key]), [[rows[2].row_no, 'hs_code'], [rows[3].row_no, 'hs_code']]);
});

test('DI allocates freight and insurance by volume and includes additional fees once', () => {
  const line_items = [
    { row_no: 5, total_price: 100, total_cbm: 1 },
    { row_no: 6, total_price: 100, total_cbm: 3 }
  ];
  const suggestions = line_items.map(({ row_no }) => ({
    row_no, ncm: '56090000', ii_rate: 0.1, ipi_rate: 0, pis_rate: 0, cofins_rate: 0
  }));
  const parameters = { rmb_brl: 2, freight_brl: 40, insurance_brl: 8, icms_rate: 0, uf: 'SP' };
  const result = calculateDi({ line_items }, suggestions, parameters, [{ name: 'Synthetic fee', amount_brl: 5 }]);
  assert.deepEqual(result.items.map(item => item.freight_brl), [10, 30]);
  assert.deepEqual(result.items.map(item => item.insurance_brl), [2, 6]);
  assert.equal(result.totals.import_taxes_brl, 44.8);
  assert.equal(result.totals.di_brl, 49.8);
  assert.throws(() => calculateDi({ line_items }, suggestions.slice(0, 1), parameters), /linha 6/);
});

test('DDP uses the reviewed DI version and applies the quoted sales tax base', () => {
  const result = calculateDdpPricing({
    oceanFreightUsd: 100, portFeeUsd: 10, brazilTruckingBrl: 200, fxRate: 5,
    merchandiseBrl: 1000, diBrl: 100, salesMarkupRate: 0.2, salesTaxRate: 0.1, profitBrl: 100,
    diReviewVersion: 3
  });
  assert.equal(result.breakdown.tax_base_brl, 1820);
  assert.equal(result.breakdown.sales_tax_brl, 182);
  assert.equal(result.breakdown.di_review_version, 3);
  assert.equal(result.brl, 1132);
});
