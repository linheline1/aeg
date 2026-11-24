require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseInquiryParams, classifyGoods, estimate, renderEstimateText } = require('../dist/inquiry/quote-estimator');
const { PRICE_TABLE } = require('../dist/inquiry/price-table');

test('price table matches the 2026-09-24 source workbook structure', () => {
  assert.equal(PRICE_TABLE.version, '20260924');
  const codes = PRICE_TABLE.channels.map(channel => channel.code);
  for (const expected of ['AYZL0001', 'AYZL0002', 'AYZL0004', 'AYZL0005', 'AYZL-P01', 'AYZL-P02', 'AYZL-P03', 'AJ-CL', 'AJ-CO', 'AJ-MX', 'AJ-EC', 'AJ-PE']) {
    assert.ok(codes.includes(expected), `missing channel ${expected}`);
  }
  const brSea = PRICE_TABLE.channels.find(channel => channel.code === 'AYZL0001');
  // 报价表原始值：普货一类 820/820/800，十二类 不走
  assert.deepEqual(brSea.classes[0].prices, [820, 820, 800]);
  assert.equal(brSea.classes.find(cls => cls.name === '十二类（不收）').prices[0], 'rejected');
  assert.equal(brSea.rules.cbmKgRatio, 300);
  assert.equal(brSea.rules.minChargeCbm, 1);
});

test('regex extraction parses bilingual weight, volume, country and mode', () => {
  const zh = parseInquiryParams('手机壳 5方 海运到圣保罗');
  assert.equal(zh.volumeCbm, 5);
  assert.equal(zh.country, 'BR');
  assert.equal(zh.mode, 'sea');
  const pt = parseInquiryParams('capinha de celular 120kg aéreo para São Paulo');
  assert.equal(pt.weightKg, 120);
  assert.equal(pt.country, 'BR');
  assert.equal(pt.mode, 'air');
  const dims = parseInquiryParams('60x40x40cm 10kg');
  assert.deepEqual(dims.dimsCm, [60, 40, 40]);
  assert.equal(dims.weightKg, 10);
});

test('longest keyword wins: 手机壳 matches 普货一类, not the forbidden 手机 class', () => {
  const brSea = PRICE_TABLE.channels.find(channel => channel.code === 'AYZL0001');
  const hit = classifyGoods('手机壳', brSea);
  assert.equal(hit.priceClass.name, '普货一类');
  assert.equal(hit.confidence, 'exact');
  const phone = classifyGoods('全新手机', brSea);
  assert.equal(phone.priceClass.name, '十二类（不收）');
});

test('BR sea: chargeable CBM = max(volume, weight/300) with 1CBM minimum', () => {
  const byVolume = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 });
  const quoted = byVolume.estimates.find(item => item.channelCode === 'AYZL0001' && item.status === 'quoted');
  assert.equal(quoted.chargeable, 5);
  assert.equal(quoted.unitPrice, 820);
  assert.equal(quoted.total, 4100);

  const byWeight = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', weightKg: 900 });
  const quoted2 = byWeight.estimates.find(item => item.channelCode === 'AYZL0001' && item.status === 'quoted');
  assert.equal(quoted2.chargeable, 3);
  assert.equal(quoted2.total, 2460);

  const tiny = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 0.4 });
  assert.equal(tiny.estimates.find(item => item.channelCode === 'AYZL0001' && item.status === 'quoted').chargeable, 1);
});

test('BR air: 31KG minimum charge and volumetric divisor 6000', () => {
  const light = estimate({ goods: '数据线', country: 'BR', mode: 'air', weightKg: 20 });
  const quoted = light.estimates.find(item => item.channelCode === 'AYZL0002' && item.status === 'quoted');
  assert.equal(quoted.chargeable, 31);
  assert.equal(quoted.unitPrice, 44);
  assert.equal(quoted.total, 1364);

  const bulky = estimate({ goods: '数据线', country: 'BR', mode: 'air', weightKg: 10, dimsCm: [100, 60, 50] });
  const quoted2 = bulky.estimates.find(item => item.channelCode === 'AYZL0002' && item.status === 'quoted');
  assert.equal(quoted2.chargeable, 50); // 体积重 100*60*50/6000 = 50KG，高于实重 10KG

  const heavy = estimate({ goods: '数据线', country: 'BR', mode: 'air', weightKg: 300 });
  assert.equal(heavy.estimates.find(item => item.channelCode === 'AYZL0002' && item.status === 'quoted').unitPrice, 38);
});

test('BR air surcharge: branded goods add 2 USD/KG on class 1', () => {
  // 100KG 落在 100KG+ 分段，一类单价 36 USD/KG
  const plain = estimate({ goods: '保温杯', country: 'BR', mode: 'air', weightKg: 100 });
  const plainQuoted = plain.estimates.find(item => item.channelCode === 'AYZL0002' && item.status === 'quoted');
  assert.equal(plainQuoted.subtotal, 3600); // 36 * 100
  assert.equal(plainQuoted.surcharges.length, 0);

  const branded = estimate({ goods: '保温杯', country: 'BR', mode: 'air', weightKg: 100, brand: true });
  const brandedQuoted = branded.estimates.find(item => item.channelCode === 'AYZL0002' && item.status === 'quoted');
  assert.equal(brandedQuoted.total, 3800); // 3600 + 2*100
});

test('anti-dumping warning fires for 保温杯 to Brazil', () => {
  const out = estimate({ goods: '保温杯', country: 'BR', mode: 'sea', volumeCbm: 3 });
  assert.ok(out.warningsZh.some(warning => warning.includes('反倾销')));
});

test('rejected categories: 食品 not accepted on BR air and AR air', () => {
  const br = estimate({ goods: '食品', country: 'BR', mode: 'air', weightKg: 50 });
  assert.equal(br.estimates.find(item => item.channelCode === 'AYZL0002').status, 'rejected');
  const ar = estimate({ goods: 'alimento', country: 'AR', mode: 'air', weightKg: 50 });
  assert.equal(ar.estimates.find(item => item.channelCode === 'AYZL0005').status, 'rejected');
});

test('AR sea and AR air quote base prices from the table', () => {
  const sea = estimate({ goods: '木制家具', country: 'AR', mode: 'sea', volumeCbm: 8 });
  const seaQuoted = sea.estimates.find(item => item.channelCode === 'AYZL0004' && item.status === 'quoted');
  assert.equal(seaQuoted.unitPrice, 1000);
  assert.equal(seaQuoted.total, 8000);

  const air = estimate({ goods: '服装', country: 'AR', mode: 'air', weightKg: 40 });
  const airQuoted = air.estimates.find(item => item.channelCode === 'AYZL0005' && item.status === 'quoted');
  assert.equal(airQuoted.unitPrice, 67);
  assert.equal(airQuoted.chargeable, 40);
  assert.equal(airQuoted.total, 2680);
});

test('BR parcel: per-kg price plus operation fee, 3kg overflow adds 5.6 per 0.5kg', () => {
  const two = estimate({ goods: '袜子', country: 'BR', mode: 'parcel', weightKg: 2 });
  const twoQuoted = two.estimates.find(item => item.channelCode === 'AYZL-P01' && item.status === 'quoted');
  assert.equal(twoQuoted.total, 254); // 93*2 + 68

  const four = estimate({ goods: '袜子', country: 'BR', mode: 'parcel', weightKg: 4 });
  const fourQuoted = four.estimates.find(item => item.channelCode === 'AYZL-P01' && item.status === 'quoted');
  assert.equal(fourQuoted.total, 93 * 4 + 79 + 5.6 * 2); // 79 + 2 steps of 5.6

  const battery = estimate({ goods: '充电宝', country: 'BR', mode: 'parcel', weightKg: 2 });
  const plain = battery.estimates.find(item => item.channelCode === 'AYZL-P01');
  assert.equal(plain.status, 'rejected'); // 普货小包渠道不收带电
  const builtin = battery.estimates.find(item => item.channelCode === 'AYZL-P02' && item.status === 'quoted');
  assert.equal(builtin.total, 96 * 2 + 68);
  const pureQuoted = battery.estimates.find(item => item.channelCode === 'AYZL-P03' && item.status === 'quoted');
  assert.equal(pureQuoted.total, 114 * 2 + 68);
});

test('agent parcel channels: Mexico weight tiers and Ecuador limit', () => {
  const mx = estimate({ goods: '手机壳', country: 'MX', mode: 'parcel', weightKg: 0.3 });
  const mxQuoted = mx.estimates.find(item => item.channelCode === 'AJ-MX' && item.status === 'quoted');
  assert.equal(mxQuoted.unitPrice, 114);
  assert.ok(Math.abs(mxQuoted.total - (114 * 0.3 + 26)) < 0.01); // 34.2 + 26

  const ec = estimate({ goods: '手机壳', country: 'EC', mode: 'parcel', weightKg: 5 });
  const ecRejected = ec.estimates.find(item => item.channelCode === 'AJ-EC');
  assert.equal(ecRejected.status, 'rejected'); // 3.9kg limit
});

test('insufficient params yield missing list instead of quotes', () => {
  const out = estimate({ goods: '手机壳' });
  assert.equal(out.estimates.length, 0);
  assert.ok(out.missingZh.includes('目的国家'));
  assert.ok(out.missingZh.includes('重量或体积'));
});

test('unknown goods fall back to enquiry status, never a fabricated number', () => {
  const out = estimate({ goods: '量子纠缠发生器', country: 'BR', mode: 'sea', volumeCbm: 4 });
  const sea = out.estimates.find(item => item.channelCode === 'AYZL0001');
  assert.equal(sea.status, 'enquiry');
  assert.ok(sea.reasonZh.includes('需人工确认'));
});

test('renderEstimateText carries amounts and the formal-quotation disclaimer in both languages', () => {
  const out = estimate({ goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 });
  const zh = renderEstimateText(out, { goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 }, 'zh');
  assert.ok(zh.includes('820'));
  assert.ok(zh.includes('4,100'));
  assert.ok(zh.includes('报价表'));
  assert.ok(zh.includes('正式报价单'));
  const pt = renderEstimateText(out, { goods: '手机壳', country: 'BR', mode: 'sea', volumeCbm: 5 }, 'pt');
  assert.ok(pt.includes('Marítimo Brasil DDP'));
  assert.ok(pt.includes('proposta formal'));
});

test('no mode given: both sea and air channels are offered for BR', () => {
  const out = estimate({ goods: '手机壳', country: 'BR', weightKg: 600, volumeCbm: 2 });
  const modes = new Set(out.estimates.filter(item => item.status === 'quoted').map(item => item.mode));
  assert.ok(modes.has('sea') && modes.has('air'));
});

test('Brazilian measurements and CNY amounts retain the entered value and currency', () => {
  const parsed = parseInquiryParams('Brasil, 2,5 kg, 1,80 m³, 12,5 x 30 x 40,5 cm');
  assert.equal(parsed.weightKg, 2.5);
  assert.equal(parsed.volumeCbm, 1.8);
  assert.deepEqual(parsed.dimsCm, [12.5, 30, 40.5]);
  assert.equal(parseInquiryParams('Brasil, 1.200,5 kg').weightKg, 1200.5);
  assert.equal(parseInquiryParams('Brasil, 1.200 kg, 1.000 caixas').weightKg, 1200);
  assert.equal(parseInquiryParams('Brasil, 1.200 kg, 1.000 caixas').quantity, 1000);
  assert.equal(parseInquiryParams('Brasil, -2,5 kg').weightKg, undefined);
  const params = { goods: '手机壳', country: 'BR', mode: 'parcel', weightKg: 3 };
  const text = renderEstimateText(estimate(params), params, 'pt');
  assert.match(text, /\d(?:[.,]\d+)? CNY/);
  assert.doesNotMatch(text, /R\$/);
});

test('estimates keep engine values and support a long answer in the next chat turn', async () => {
  const { InquiryController } = require('../dist/inquiry/inquiry.controller');
  const markup = 'Tabela ' + 'x'.repeat(1100);
  const controller = new InquiryController({ async resolve() { return { apiKey: 'fixture' }; } }, {
    async activePriceTable() { return { table: PRICE_TABLE, version: 'fixture', title: markup }; }
  });
  let calls = 0;
  controller.chat = async () => {
    calls++;
    return JSON.stringify({ goods_zh: '手机壳', country: 'BR', mode: 'sea', volume_cbm: 80 });
  };
  const req = { socket: { remoteAddress: 'test' }, headers: {} };
  const input = { role: 'user', content: 'Enviar para o Brasil por navio, marítimo, volume 1,80 m³' };
  const first = await controller.reply(req, { messages: [input] });
  assert.ok(first.reply.length > 1000);
  assert.match(first.reply, /× 1\.8/);
  assert.equal(calls, 1);
  await controller.reply(req, { messages: [input, { role: 'assistant', content: first.reply }, input] });
  assert.equal(calls, 2);
});
