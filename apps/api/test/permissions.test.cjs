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

test('quote HTTP routes enforce authentication, customer ownership and staff role permissions', async t => {
  const quote = { id: 'quote-1', client_id: 'client-1', salesperson_id: 'sales-1', status: 'uploaded' };
  const jwt = new JwtService();
  let edits = 0;
  const provider = (provide, useValue) => ({ provide, useValue });
  class TestModule {}
  Module({
    controllers: [ClientOrderController, OpsOrderController, CustomsController],
    providers: [
      AuthGuard, RolesGuard, provider(JwtService, jwt),
      provider('QuotesRepo', { async findById() { return quote; } }),
      provider('AuditRepo', {}), provider('ClientRepo', { async findOne() { return { name: 'Synthetic client' }; } }),
      provider('UserRepo', { async findOne() { return null; } }), provider('ImageRepo', {}),
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
  async function expectStatus(path, expected, user, method = 'GET') {
    const headers = {};
    if (user) {
      const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
      headers.Authorization = 'Bearer ' + jwt.sign(user, { secret });
    }
    const response = await fetch(base + path, { method, headers });
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
});
