const assert = require('node:assert/strict');
const { test } = require('node:test');
const { QuoteAiTasksService } = require('../dist/quote-tasks/quote-ai-tasks.service');
const { QuoteTaskStore } = require('../dist/quote-tasks/quote-task.store');
const { isolatedWorkspace, memoryRepositories, productRow, quoteService } = require('./quote-fixtures.cjs');

const good = row => ({
  row_no: row.row_no, ncm: '56090000', confidence: 0.9,
  ii_rate: 0.1, ipi_rate: 0, pis_rate: 0, cofins_rate: 0, sources: ['https://example.gov.br/reference']
});

test('NCM task preserves checkpoints across restart, stops on billing and retries only failed rows', async t => {
  await isolatedWorkspace(t);
  const client = { id: 'client-1' };
  const draftId = 'draft-1';
  const rows = Array.from({ length: 13 }, (_, index) => productRow(index, '5609000100'));
  const repos = memoryRepositories(client);
  await repos.drafts.insert({
    id: draftId, client_id: client.id, status: 'preview', declared_currency: 'RMB',
    expires_at: new Date(Date.now() + 60_000).toISOString(), rows
  });
  const calls = [];
  let retry = false;
  const ai = { async suggest({ line_items }) {
    calls.push(line_items.map(row => row.row_no));
    if (!retry && calls.length === 2) throw new Error('provider timed out');
    if (!retry && calls.length === 3) throw new Error('HTTP 402');
    return line_items.map(good);
  } };
  const build = store => new QuoteAiTasksService(store, quoteService(repos, ai), ai, repos.quotes, repos.images);
  let store = new QuoteTaskStore();
  let service = build(store);
  const key = 'ncm:' + draftId;
  const initial = await service.startNcm(draftId, client.id, rows, 'USD');
  const duplicate = await service.startNcm(draftId, client.id, rows, 'USD');
  assert.equal(duplicate.id, initial.id);
  const edited = structuredClone(rows);
  edited[0].data.product_en = 'Edited product';
  await assert.rejects(() => service.startNcm(draftId, client.id, edited, 'USD'), { status: 409 });
  await assert.rejects(() => service.getNcm(draftId, 'other-client'), { status: 404 });
  const queued = await store.get(key);
  await Promise.all([service.step(queued), service.step(queued)]);
  assert.deepEqual(calls, [[5, 6, 7, 8]]);

  const saved = await store.get(key);
  assert.equal(await store.save({ ...saved, status: 'running', leaseUntil: Date.now() - 1 }, saved.revision), true);
  store = new QuoteTaskStore();
  service = build(store);
  assert.deepEqual((await store.due(Date.now(), 10)).map(task => task.key), [key]);
  const advance = async count => {
    for (let i = 0; i < count; i++) await service.step(await store.get(key));
  };
  await advance(3);
  const partial = await service.getNcm(draftId, client.id);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.completed, 4);
  assert.equal(partial.failed, 9);
  assert.equal(partial.currency, 'USD');
  assert.equal(partial.error.code, 'billing');
  assert.deepEqual(new Set(partial.failures.map(row => row.code)), new Set(['timeout', 'billing']));
  assert.equal((await store.counts()).billing, 1);
  assert.equal((await store.due(Date.now(), 10)).length, 0);
  assert.deepEqual(calls.flat(), rows.slice(0, 12).map(row => row.row_no));

  retry = true;
  await service.startNcm(draftId, client.id, partial.result.rows, 'USD');
  await advance(4);
  const complete = await service.getNcm(draftId, client.id);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.result.ncm_count, 9);
  assert.ok(complete.result.rows.every(row => row.data.hs_code === '56090000'));
  assert.deepEqual(calls.slice(3).flat(), rows.slice(4).map(row => row.row_no));
});

test('DI task reuses successful rows and prevents stale results overwriting a changed quote', async t => {
  await isolatedWorkspace(t);
  const store = new QuoteTaskStore();
  const key = 'di:quote-1';
  const parameters = { rmb_brl: 2, icms_rate: 0.1, uf: 'SP', freight_brl: 0 };
  const actor = { username: 'operator', role: 'operator' };
  const order = {
    id: 'quote-1', client_id: 'client-1', status: 'uploaded', revision: 'v1',
    line_items: Array.from({ length: 5 }, (_, index) => ({ row_no: index + 5, total_price: 100, hs_code: '56090000' }))
  };
  const calls = [];
  const ai = { async suggest({ line_items }) {
    calls.push(line_items.map(row => row.row_no));
    if (calls.length === 2) throw new Error('provider timed out');
    return line_items.map(good);
  } };
  let published = 0;
  const quotes = { async findVersioned() { return structuredClone(order); } };
  const quote = { async publishTaskDi(snapshot, analysis) {
    if (snapshot.revision !== order.revision) return false;
    order.di_analysis = analysis;
    order.revision = 'published';
    published++;
    return true;
  } };
  const service = new QuoteAiTasksService(store, quote, ai, quotes, { async findByQuote() { return []; } });
  const advance = async count => {
    for (let i = 0; i < count; i++) await service.step(await store.get(key));
  };
  await service.startDi(order.id, parameters, actor);
  await advance(3);
  assert.equal((await service.getDi(order.id)).status, 'partial');
  assert.equal(published, 0);
  await service.retryDi(order.id, actor);
  await advance(2);
  assert.equal((await service.getDi(order.id)).status, 'complete');
  assert.equal(order.di_analysis.items.length, 5);
  assert.deepEqual(calls, [[5, 6, 7, 8], [9], [9]]);

  await service.startDi(order.id, parameters, actor);
  await advance(2);
  order.revision = 'user-edited';
  order.line_items[0].total_price = 999;
  await advance(1);
  assert.equal((await service.getDi(order.id)).status, 'stale');
  assert.equal(published, 1);
  assert.equal(order.line_items[0].total_price, 999);
});
