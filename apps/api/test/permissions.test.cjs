require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Module } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { NestFactory } = require('@nestjs/core');
const { AuthGuard, RolesGuard } = require('../dist/common/guards/auth.guard');
const { ClientOrderController } = require('../dist/order/client-order.controller');
const { OpsOrderController } = require('../dist/order/ops-order.controller');
const { CustomsController } = require('../dist/customs/customs.controller');
const { CustomsService } = require('../dist/customs/customs.service');
const { AisStreamService } = require('../dist/order/ais-stream.service');
const { QuoteService } = require('../dist/upload/quote.service');
const { QuoteAiTasksService } = require('../dist/quote-tasks/quote-ai-tasks.service');
const { OrderDocumentsController } = require('../dist/order/order-documents.controller');
const { ClientNotificationsController } = require('../dist/order/client-notifications.controller');
const { randomUUID } = require('node:crypto');
const { isolatedWorkspace } = require('./quote-fixtures.cjs');

test('quote HTTP routes enforce authentication, customer ownership and staff role permissions', async t => {
  const quote = { id: 'quote-1', client_id: 'client-1', salesperson_id: 'sales-1', status: 'uploaded' };
  const jwt = new JwtService();
  let edits = 0;
  let revision = 0;
  const audit = [];
  const users = new Map();
  const provider = (provide, useValue) => ({ provide, useValue });
  class TestModule {}
  Module({
    controllers: [ClientOrderController, OpsOrderController, CustomsController],
    providers: [
      AuthGuard, RolesGuard, provider(JwtService, jwt),
      provider('QuotesRepo', {
        async findById() { return quote; },
        async findVersioned() { return { ...quote, revision: String(revision) }; },
        async updateIfUnchanged(_id, expected, patch, entry) {
          if (expected !== String(revision)) return null;
          revision += 1;
          Object.assign(quote, patch);
          audit.push(entry);
          return quote;
        }
      }),
      provider('AuditRepo', {}), provider('ClientRepo', { async findOne() { return { name: 'Synthetic client' }; } }),
      provider('UserRepo', { async findOne({ where }) { return users.get(where.id) ?? null; } }), provider('ImageRepo', {}),
      provider(AisStreamService, {}),
      provider(CustomsService, { async list() { return { items: [] }; } }),
      provider(QuoteAiTasksService, { async getDi() { return null; } }),
      provider(QuoteService, { async updateLineItems() { edits++; return { ok: true }; } })
    ]
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
  function session(user) {
    const id = user.sub ?? [user.role, user.username ?? user.client_id].filter(Boolean).join('-');
    if (!users.has(id)) users.set(id, { ...user, id, status: 'active', session_revision: null });
    return jwt.sign({ sub: id, session_revision: users.get(id).session_revision }, { secret });
  }
  async function expectStatus(path, expected, user, method = 'GET', body) {
    const headers = {};
    if (user) {
      headers.Authorization = 'Bearer ' + (typeof user === 'string' ? user : session(user));
    }
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(payload));
    return payload;
  }

  await expectStatus('/client/orders/quote-1', 401);
  const owned = await expectStatus('/client/orders/quote-1', 200, { role: 'client', client_id: 'client-1' });
  assert.equal(owned.id, 'quote-1');
  await expectStatus('/client/orders/quote-1', 404, { role: 'client', client_id: 'client-2' });
  await expectStatus('/ops/orders/quote-1', 403, { role: 'client', client_id: 'client-1' });
  await expectStatus('/ops/orders/quote-1', 200, { role: 'sales', sub: 'sales-1' });
  await expectStatus('/ops/orders/quote-1', 403, { role: 'sales', sub: 'sales-2' });
  await expectStatus('/ops/orders/quote-1/line-items', 403, { role: 'sales', sub: 'sales-1' }, 'PATCH');
  await expectStatus('/ops/orders/quote-1/line-items', 403, { role: 'customs' }, 'PATCH');
  assert.equal(edits, 0);
  await expectStatus('/ops/orders/quote-1/line-items', 200, { role: 'operator' }, 'PATCH');
  await expectStatus('/ops/orders/quote-1/line-items', 200, { role: 'admin' }, 'PATCH');
  assert.equal(edits, 2);
  await expectStatus('/customs/orders', 200, { role: 'customs' });
  await expectStatus('/customs/orders', 403, { role: 'sales', sub: 'sales-1' });

  const operator = { role: 'operator', username: 'shipping-operator' };
  const customer = { role: 'client', client_id: 'client-1' };
  const events = '/ops/orders/quote-1/shipment/events';
  const exception = '/ops/orders/quote-1/shipment/exception';
  await expectStatus(events, 400, operator, 'POST', { stage: 'booked' });
  Object.assign(quote, { status: 'done', deal_status: 'won', shipment: { pol: 'Shanghai', pod: 'Santos', eta: '2026-12-01' } });
  await expectStatus(events, 400, operator, 'POST', { stage: 'departed', lat: '0' });
  const created = await expectStatus(events, 201, operator, 'POST', { stage: 'departed', happened_at: '2026-01-01T15:00:00+08:00' });
  const eventPath = events + '/' + created.event.id;
  const correction = { stage: 'departed', happened_at: '2026-01-01T09:00:00Z', lat: 31, lng: 121, reason: 'Verified sailing record', revision: null };
  await expectStatus(eventPath, 403, customer, 'PATCH', correction);
  await expectStatus(eventPath, 403, { role: 'sales', sub: 'sales-1' }, 'PATCH', correction);
  await expectStatus(eventPath, 400, operator, 'PATCH', { ...correction, reason: '' });
  const corrected = await expectStatus(eventPath, 200, operator, 'PATCH', correction);
  assert.equal(corrected.event.id, created.event.id);
  assert.equal(audit.at(-1).detail.reason, correction.reason);
  assert.equal(audit.at(-1).detail.before.happened_at, '2026-01-01T07:00:00.000Z');
  assert.equal(audit.at(-1).detail.after.happened_at, '2026-01-01T09:00:00.000Z');
  await expectStatus(eventPath, 409, operator, 'PATCH', correction);
  const opened = await expectStatus(exception, 200, operator, 'PUT', { status: 'open', message: 'Port congestion', revision: null });
  assert.equal(opened.shipment.exception.owner, operator.username);
  await expectStatus(exception, 403, { role: 'sales', sub: 'sales-1' }, 'PUT', { status: 'resolved' });
  await expectStatus(exception, 200, { role: 'admin', username: 'shipping-admin' }, 'PUT', {
    status: 'resolved', message: 'Unloading completed', revision: opened.shipment.exception.updated_at
  });
  const detail = await expectStatus('/client/orders/quote-1', 200, customer);
  assert.equal(detail.shipment.exception.status, 'resolved');
  assert.equal(detail.shipment.exception.message, 'Unloading completed');
  assert.equal(detail.shipment.exception.owner, undefined);
  assert.equal(detail.shipment.eta, '2026-12-01');
  assert.equal(detail.shipment.events[0].position_source, 'manual');
  assert.equal(detail.shipment.events[0].corrected_by, undefined);
  assert.equal(detail.ais_position, null);
  const issued = session(operator);
  const stored = users.get('operator-shipping-operator');
  await expectStatus('/ops/orders/quote-1', 200, issued);
  stored.status = 'disabled';
  await expectStatus('/ops/orders/quote-1', 401, issued);
  stored.status = 'active';
  stored.session_revision = 'replacement';
  await expectStatus('/ops/orders/quote-1', 401, issued);
  await expectStatus('/ops/orders/quote-1', 401, jwt.sign({ sub: stored.id }, { secret }));
  await expectStatus('/ops/orders/quote-1', 200, operator);
  stored.session_revision = 'password-reset';
  await expectStatus('/ops/orders/quote-1', 401, jwt.sign({ sub: stored.id, session_revision: 'replacement' }, { secret }));
});

test('AIS returns cached historical positions and rejects out-of-order observations', () => {
  const stream = new AisStreamService({});
  stream.key = '';
  const mmsi = '123456789';
  assert.equal(stream.watch(mmsi), null);
  const oldTime = new Date(Date.now() - 3600_000).toISOString();
  const recentTime = new Date(Date.now() - 60_000).toISOString();
  stream.tracks.set(mmsi, [{ latitude: 4, longitude: 30, observed_at: oldTime, speed_knots: null, course_degrees: null }]);
  assert.equal(stream.watch(mmsi).observed_at, oldTime);
  stream.watched.set(mmsi, Date.now());
  stream.scheduleFlush = () => {};
  function receive(time, latitude) {
    stream.consume(JSON.stringify({
      MessageType: 'PositionReport',
      MetaData: { MMSI: mmsi, time_utc: time, longitude: 30, latitude }
    }));
  }
  receive(recentTime, 5);
  receive(oldTime, 8);
  assert.equal(stream.watch(mmsi).latitude, 5);
  assert.deepEqual(stream.track(mmsi).map(point => point.observed_at), [oldTime, recentTime]);
});

test('order documents enforce roles and ownership throughout review, replacement and download', async t => {
  const root = await isolatedWorkspace(t);
  const quote = { id: randomUUID(), client_id: randomUUID(), quote_no: 'SYNTHETIC', status: 'done' };
  const jwt = new JwtService();
  const users = new Map();
  for (const [name, role, client_id] of [
    ['customer', 'client', quote.client_id], ['outsider', 'client', randomUUID()],
    ['operator', 'operator'], ['broker', 'customs'], ['sales', 'sales']
  ]) {
    users.set(name, { id: name, username: name, role, client_id, status: 'active' });
  }
  let revision = 0;
  let collision = false;
  const audit = [];
  const quotes = {
    async find({ where }) { return where.client_id === quote.client_id ? [quote] : []; },
    async findVersioned(id) { return id === quote.id ? { ...structuredClone(quote), revision } : null; },
    async updateIfUnchanged(_id, current, patch, entry) {
      if (collision || current !== revision) return null;
      revision += 1;
      Object.assign(quote, patch);
      audit.push(entry);
      return quote;
    }
  };
  class DocumentTestModule {}
  Module({
    controllers: [OrderDocumentsController, ClientNotificationsController],
    providers: [
      AuthGuard, RolesGuard, { provide: JwtService, useValue: jwt },
      { provide: 'QuotesRepo', useValue: quotes },
      { provide: 'UserRepo', useValue: { async findOne({ where }) { return users.get(where.id); } } }
    ]
  })(DocumentTestModule);
  const app = await NestFactory.create(DocumentTestModule, { logger: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  async function send(user, path, expected, method = 'GET', payload, binary = false) {
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
    const headers = { Authorization: 'Bearer ' + jwt.sign({ sub: user, session_revision: null }, { secret }) };
    const multipart = payload instanceof FormData;
    if (payload && !multipart) headers['Content-Type'] = 'application/json';
    const body = multipart ? payload : payload ? JSON.stringify(payload) : undefined;
    const response = await fetch(base + path, { headers, method, body });
    assert.equal(response.status, expected, `${method} ${path}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  const documents = portal => `/${portal}/orders/${quote.id}/documents`;
  const request = { type: 'commercial_invoice', instructions: 'Include the invoice number' };
  await send('customer', documents('client'), 403, 'POST', request);
  await send('sales', documents('ops'), 403);
  await send('broker', documents('ops'), 403, 'POST', request);
  await send('operator', documents('ops'), 400, 'POST', { type: 'other' });
  const created = await send('operator', documents('ops'), 201, 'POST', request);
  assert.equal(created.status, 'missing');
  assert.equal((await send('customer', '/client/notifications', 200)).items[0].type, 'document_requested');
  const suffix = '/' + created.id;
  const submitPath = documents('client') + suffix + '/versions';
  const pdf = '%PDF-1.5\nSynthetic test document';
  function submission(revision, content = pdf, name = '商业发票.pdf') {
    const form = new FormData();
    form.set('revision', String(revision));
    form.set('file', new Blob([content], { type: 'application/pdf' }), name);
    return form;
  }
  await send('outsider', submitPath, 404, 'POST', submission(1));
  await send('customer', submitPath, 400, 'POST', submission(1, 'wrong contents'));
  collision = true;
  await send('customer', submitPath, 409, 'POST', submission(1));
  collision = false;
  const fs = require('node:fs/promises');
  assert.deepEqual(await fs.readdir(require('node:path').join(root, 'apps/api/uploads/orderfiles')), []);
  const submitted = await send('customer', submitPath, 201, 'POST', submission(1));
  assert.equal(submitted.status, 'submitted');
  const first = submitted.versions[0];
  assert.equal(first.file_name, '商业发票.pdf');
  assert.equal(first.file_path, undefined);
  const review = documents('customs') + suffix + '/review';
  const rejection = { version_id: first.id, revision: submitted.revision, status: 'rejected', reason: 'Invoice number missing' };
  await send('customer', documents('client') + suffix + '/review', 403, 'PATCH', rejection);
  await send('broker', review, 400, 'PATCH', { ...rejection, reason: '' });
  const rejected = await send('broker', review, 200, 'PATCH', rejection);
  assert.ok((await send('customer', '/client/notifications', 200)).items.some(item =>
    item.type === 'document_rejected' && item.message === rejection.reason));
  const firstDownload = submitPath + '/' + first.id + '/file';
  await send('outsider', firstDownload, 404);
  assert.equal((await send('customer', firstDownload, 200, 'GET', undefined, true)).toString(), pdf);
  const updated = await send('customer', submitPath, 201, 'POST', submission(rejected.revision, pdf + ' 2'));
  await send('broker', review, 409, 'PATCH', rejection);
  const approved = await send('broker', review, 200, 'PATCH', {
    version_id: updated.versions[1].id, revision: updated.revision, status: 'approved'
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.versions[0].review.reason, rejection.reason);
  assert.equal(approved.versions.length, 2);
  assert.equal((await send('broker', documents('customs'), 200))[0].versions.length, 2);
  assert.equal((await send('customer', firstDownload, 200, 'GET', undefined, true)).toString(), pdf);
  assert.equal(audit.length, 5);
});
