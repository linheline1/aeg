const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AiNcmService } = require('../dist/order/ai-ncm.service');
const { calculateDi } = require('../dist/order/di-calculation');
const { calculateDdpPricing } = require('../dist/upload/ddp-pricing');
const { memoryRepositories, productRow, quoteService, runUploadRegression } = require('./quote-fixtures.cjs');

test('USD upload validates in original currency and retains ten image associations', async t => {
  const client = { id: 'client-1' };
  await runUploadRegression(t, memoryRepositories(client), client.id, true);
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

test('DDP write rejects a superseded quote revision without marking the quote failed', async () => {
  const { QuoteService } = require('../dist/upload/quote.service');
  const order = { id: 'quote', revision: 'old', client_id: 'client', status: 'uploaded',
    di_analysis: { totals: { di_brl: 10, merchandise_brl: 100 } } };
  let current = order.revision;
  const quotes = {
    async findVersioned() { return { ...order, revision: current }; },
    async updateIfUnchanged(_id, revision) {
      assert.equal(revision, 'old');
      assert.equal(current, 'edited');
      return null;
    },
    async update() { assert.fail('An outdated computation must not write any state'); }
  };
  const feeRepo = { async resolve() {
    current = 'edited';
    return { rates: { ocean_freight_usd: 10, port_fee_usd: 0, br_trucking_brl: 0,
      fx_rate: 5, sales_markup_rate: 0, sales_tax_rate: 0, profit_brl: 0 } };
  } };
  const service = new QuoteService(quotes, feeRepo, {}, {}, {}, {}, {}, {});
  await assert.rejects(() => service.computeOrder(order.id, { username: 'test', role: 'operator' }), { status: 409 });
  assert.equal(current, 'edited');
});

test('customer decisions are version-bound, ownership-checked and idempotent across concurrent requests', async () => {
  const { ClientOrderController } = require('../dist/order/client-order.controller');
  const { publishQuote } = require('../dist/order/quote-publication');
  let order = { id: 'q', revision: '1', client_id: 'c', status: 'done', line_items: [{ row_no: 1 }] };
  const pricing = { brl: 120, breakdown: { fx_rate: 5, items: [] } };
  Object.assign(order, publishQuote(order, pricing, new Date(Date.now() - 8 * 86400000)));
  let audits = 0;
  const repo = {
    async findVersioned() { return structuredClone(order); },
    async updateIfUnchanged(_id, revision, patch) {
      if (order.revision !== revision) return null;
      order = { ...order, ...patch, revision: String(Number(revision) + 1) };
      return order;
    }
  };
  const controller = new ClientOrderController(repo, { async entry() { audits++; } }, {});
  const own = { user: { client_id: 'c', username: 'customer' } };
  const decide = (version, decision, request = own) => controller.decide('q', { version, decision }, request);
  await assert.rejects(() => decide(1, 'accepted'), { status: 409 });
  await assert.rejects(() => decide(1, 'accepted', { user: { client_id: 'other' } }), { status: 404 });
  Object.assign(order, publishQuote(order, pricing));
  await assert.rejects(() => decide(1, 'accepted'), { status: 409 });
  await decide(2, 'rejected');
  assert.equal(order.deal_status, 'lost');
  Object.assign(order, publishQuote(order, { ...pricing, brl: 130 }));
  assert.equal(order.deal_status, 'open');
  const [first, retry] = await Promise.all([decide(3, 'accepted'), decide(3, 'accepted')]);
  assert.deepEqual(first, retry);
  assert.equal(audits, 2);
  assert.equal(order.deal_status, 'won');
  assert.equal(order.quote_versions[2].amount, 130);
  await assert.rejects(() => decide(3, 'rejected'), { status: 409 });
  assert.throws(() => publishQuote(order, pricing), { status: 409 });
});

test('inbox deduplicates source events and persists reads per customer account', async t => {
  const { ClientNotificationsController } = require('../dist/order/client-notifications.controller');
  const { isolatedWorkspace } = require('./quote-fixtures.cjs');
  await isolatedWorkspace(t);
  const time = '2026-11-22T08:00:00.000Z';
  const version = { version: 1, published_at: time, decision: { value: 'accepted', at: time } };
  const event = { id: 'event-1', stage: 'departed', created_at: time };
  const opened = { status: 'open', message: 'Port congestion', updated_at: time };
  const resolved = { status: 'resolved', message: 'Unloading complete', updated_at: '2026-11-23T08:00:00.000Z' };
  const quotes = { async find({ where }) {
    return [{ id: where.client_id, quote_no: 'TEST', quote_versions: [version, version],
      shipment: { events: [event, event], exception: resolved, exception_updates: [opened, opened, resolved] } }];
  } };
  const make = () => new ClientNotificationsController(quotes);
  const account = (client_id, sub) => ({ user: { client_id, sub } });
  const own = account('customer-1', 'user-1');
  const otherUser = account('customer-1', 'user-2');
  const otherClient = account('customer-2', 'user-3');
  const inbox = await make().list(own);
  assert.equal(inbox.unread, 5);
  assert.equal(inbox.total, 5);
  assert.deepEqual(new Set(inbox.items.map(item => item.type)), new Set(['published', 'accepted', 'shipment', 'exception_open', 'exception_resolved']));
  assert.equal(inbox.items[0].message, resolved.message);
  const ids = [inbox.items[0].id];
  await assert.rejects(() => make().markRead(otherClient, { ids }), { status: 404 });
  await make().markRead(own, { ids });
  await make().markRead(own, { ids });
  assert.deepEqual(await make().unread(own), { unread: 4 });
  assert.equal((await make().list(otherUser)).unread, 5);
});

test('customs changes invalidate even unversioned pricing and cannot overwrite new shipment data', async () => {
  const { CustomsService } = require('../dist/customs/customs.service');
  const { OpsOrderController } = require('../dist/order/ops-order.controller');
  const draft = {
    id: 'quote', quote_no: 'TEST', status: 'done', deal_status: 'open', total_amount_rmb: 100,
    total_amount_brl: 400, total_amount_usd: 80, pricing_breakdown: { fx_rate: 5 },
    line_items: [{ row_no: 1, total_pcs: 1, unit_price: 100, total_price: 100 }]
  };
  const quote = structuredClone(draft);
  let revision = 0;
  let beforeWrite;
  const repo = {
    async findById() { return structuredClone(quote); },
    async findVersioned() { return { ...structuredClone(quote), revision }; },
    async updateIfUnchanged(_id, expected, patch) {
      beforeWrite?.();
      if (revision !== expected) return null;
      revision++;
      Object.assign(quote, patch);
      return structuredClone(quote);
    }
  };
  const audit = { async entry() {} };
  const operator = { username: 'operator', role: 'operator' };
  const actor = { username: 'customs', role: 'customs' };
  const customs = new CustomsService(repo, { async findByQuote() { return []; } }, audit, {}, {});
  const ops = new OpsOrderController({}, {}, repo, audit, {}, {}, {});
  await customs.updateProductAmounts(quote.id, [{ row_no: 1, amount: 200 }], actor);
  assert.equal(quote.total_amount_rmb, 200);
  assert.equal(quote.total_amount_brl, null);
  assert.equal(quote.pricing_breakdown, null);
  assert.equal(quote.status, 'uploaded');
  await assert.rejects(() => ops.publishVersion(quote.id, { user: operator }), { status: 409 });
  Object.assign(quote, draft, { deal_status: 'won' });
  beforeWrite = () => {
    revision++;
    quote.shipment = { exception: { status: 'open', message: 'Delay' } };
    beforeWrite = undefined;
  };
  await assert.rejects(() => customs.addProgress(quote.id, { stage: 'customs_br' }, actor), { status: 409 });
  await customs.addProgress(quote.id, { stage: 'customs_br' }, actor);
  assert.equal(quote.shipment.exception.message, 'Delay');
  assert.equal(quote.shipment.events[0].stage, 'customs_br');
});
