const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { ALL_ENTITIES } = require('../dist/data-source');
const { ClientEntity } = require('../dist/entities/client.entity');
const { UploadDraftEntity } = require('../dist/entities/upload-draft.entity');
const { PgQuotesRepo, PgImageRepo } = require('../dist/common/pg-repos');
const { UploadDraftsRepo } = require('../dist/upload/upload-draft.repository');
const { QuoteTaskStore } = require('../dist/quote-tasks/quote-task.store');
const { QuoteAiTasksService } = require('../dist/quote-tasks/quote-ai-tasks.service');
const { quoteService, runUploadRegression } = require('./quote-fixtures.cjs');

test('PostgreSQL migrations support quote uploads and versioned automatic DI tasks', async t => {
  const url = new URL(process.env.AEG_TEST_PG_URL ?? 'postgres://missing');
  assert.ok(url.protocol === 'postgres:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/aeg_quote_test',
    'Set AEG_TEST_PG_URL to a dedicated local PostgreSQL database named aeg_quote_test');
  const ds = new DataSource({
    type: 'postgres', url: url.href, entities: ALL_ENTITIES,
    migrations: [require('node:path').resolve(__dirname, '../dist/migrations/*.js').replace(/\\/g, '/')],
    synchronize: false
  });
  await ds.initialize();
  try {
    await ds.runMigrations();
    assert.equal(await ds.showMigrations(), false);
    const drafts = new UploadDraftsRepo(ds);
    const lockDraft = await drafts.insert({
      client_id: require('node:crypto').randomUUID(), status: 'preview', file_name: 'lock.xlsx', file_path: 'lock.xlsx',
      template_version: '2.0', rows: [], converted_by_ai: false, declared_currency: 'RMB',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    });
    try {
      const observed = await Promise.all([
        drafts.withLock(lockDraft.id, async manager => {
          await manager.query('SELECT pg_sleep(0.1)');
          await manager.update(UploadDraftEntity, lockDraft.id, { status: 'confirmed' });
          return 'committed';
        }),
        new UploadDraftsRepo(ds).withLock(lockDraft.id, async manager =>
          (await manager.findOneByOrFail(UploadDraftEntity, { id: lockDraft.id })).status)
      ]);
      assert.deepEqual(observed, ['committed', 'confirmed']);
    } finally {
      await ds.getRepository(UploadDraftEntity).delete(lockDraft.id);
    }
    const runner = ds.createQueryRunner();
    try {
      await runner.startTransaction();
      const manager = runner.manager;
      const client = await manager.save(manager.create(ClientEntity, { name: 'Synthetic quote test', status: 'active' }));
      const other = await manager.save(manager.create(ClientEntity, { name: 'Synthetic other client', status: 'active' }));
      const repositories = { getRepository: entity => manager.getRepository(entity) };
      const quotes = new PgQuotesRepo(repositories);
      const repos = {
        quotes,
        images: new PgImageRepo(repositories),
        drafts: new UploadDraftsRepo(repositories),
        clients: manager.getRepository(ClientEntity)
      };
      const quote = await runUploadRegression(t, repos, client.id);
      await assert.rejects(() => manager.transaction(async tx => {
        const repo = new PgQuotesRepo({ getRepository: entity => tx.getRepository(entity) });
        const { id, created_at, updated_at, ...copy } = quote;
        await repo.insert({ ...copy, quote_no: quote.quote_no + '-DUP' });
      }), error => error.code === '23505' && error.constraint === 'uq_quote_source_draft');
      const own = await quotes.findPaged({ where: { client_id: client.id, status: 'uploaded' }, q: quote.quote_no, pageSize: 1 });
      assert.equal(own.total, 1);
      assert.equal(own.items[0].id, quote.id);
      assert.equal((await quotes.findPaged({ where: { client_id: other.id }, q: quote.quote_no })).total, 0);

      const storage = { query: (sql, args) => manager.query(sql, args) };
      const store = new QuoteTaskStore(storage);
      const ai = { async suggest({ line_items }) {
        return line_items.map(row => ({
          row_no: row.row_no, ncm: row.hs_code, ii_rate: 0, ipi_rate: 0, pis_rate: 0, cofins_rate: 0,
          sources: ['https://example.gov.br/test']
        }));
      } };
      const logic = quoteService(repos, ai);
      logic.autoDiInput = async () => ({
        parameters: { rmb_brl: 1, icms_rate: 0, uf: 'SP' },
        rates: {
          ocean_freight_usd: 100, port_fee_usd: 0, br_trucking_brl: 0, fx_rate: 5,
          sales_markup_rate: 0, sales_tax_rate: 0, profit_brl: 0
        }
      });
      const service = new QuoteAiTasksService(store, logic, ai, repos.quotes, repos.images);
      await service.startDi(quote.id, undefined, { username: 'test', role: 'operator' }, true);
      const key = 'di:' + quote.id;
      for (let batch = 0; batch < 4; batch++) await service.step(await store.get(key));
      const savedTask = await new QuoteTaskStore(storage).get(key);
      assert.equal(savedTask.status, 'complete');
      assert.equal(savedTask.result.items.length, 10);
      const published = await quotes.findById(quote.id);
      assert.equal(published.di_analysis.task_id, savedTask.id);
      assert.equal(published.status, 'done');
      assert.equal(published.total_amount_brl, 500);
      assert.equal((await store.counts()).complete, 1);
      assert.equal(await quotes.updateIfUnchanged(quote.id, '2000-01-01T00:00:00.000Z', { status: 'failed' }), null);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  } finally {
    await ds.destroy();
  }
});
