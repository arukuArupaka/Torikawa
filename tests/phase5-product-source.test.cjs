require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: () => ({ uri: 'bundled-image' }) } };
  return original.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { productFromOpenFoodFacts, lookupOpenFoodFacts, createProductLookupGate } = require('../src/services/openFoodFactsService.ts');
const { validateStoredData } = require('../src/services/dataValidation.ts');
const { normalizeAppData } = require('../src/services/appDataMigration.ts');
const { createInitialData } = require('../src/data/initialData.ts');
const { findProductByBarcode } = require('../src/data/productCatalog.ts');
const { createSampleFoods } = require('../src/data/sampleData.ts');
const code = '4909999900001';
const photo = 'https://images.openfoodfacts.org/images/products/490/999/990/0001/front_ja.3.200.jpg';
const remote = { product_name_ja: 'テスト牛乳', image_front_small_url: photo,
  images: { front_ja: { imgid: '7' }, 7: { uploader: 'test-contributor' }, 8: { uploader: 'different-image-author' } } };

test('OFF attribution uses the displayed image uploader and survives migration and backup-shaped serialization', () => {
  const product = productFromOpenFoodFacts(code, remote);
  assert.equal(product.image, photo);
  assert.equal(product.productSource.image.author, 'test-contributor');
  assert.equal(product.productSource.image.license, 'CC-BY-SA-3.0');
  assert.equal(product.productSource.productUrl, `https://world.openfoodfacts.org/product/${code}`);
  validateStoredData('learnedProducts', { [code]: product });
  const food = { ...createSampleFoods()[0], barcode: code, image: product.image, productSource: product.productSource };
  const snapshot = { ...createInitialData(), foods: [food] };
  const recovered = normalizeAppData(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(recovered.foods[0].productSource, product.productSource);
});

test('missing author or an untrusted image host never uses a product photo without attribution', () => {
  for (const product of [{ ...remote, images: {} }, { ...remote, image_front_small_url: 'https://unknown.example/front_ja.3.200.jpg' }]) {
    const result = productFromOpenFoodFacts(code, product);
    assert.notEqual(result.image, product.image_front_small_url);
    assert.equal(result.productSource.image, undefined);
  }
});

test('invalid source links in saved foods and learned products are rejected', () => {
  const product = productFromOpenFoodFacts(code, remote);
  for (const productUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://world.openfoodfacts.org/product/wrong']) {
    const source = { ...product.productSource, productUrl };
    assert.throws(() => validateStoredData('learnedProducts', { [code]: { ...product, productSource: source } }));
    assert.throws(() => validateStoredData('foods', [{ ...createSampleFoods()[0], productSource: source }]));
  }
});

test('OFF concurrent reads coalesce; cached values are isolated from caller edits and errors are retryable', async (t) => {
  const before = global.fetch;
  t.after(() => { global.fetch = before; });
  let resolve, requests = 0;
  global.fetch = async () => { requests++; await new Promise((r) => resolve = r); return { status: 200, ok: true, json: async () => ({ status: 1, product: remote }) }; };
  const first = lookupOpenFoodFacts('4909999900010');
  const second = lookupOpenFoodFacts('4909999900010');
  resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(requests, 1);
  a.productSource.image.author = 'edited';
  assert.equal(b.productSource.image.author, 'test-contributor');
  assert.equal((await lookupOpenFoodFacts('4909999900010')).productSource.image.author, 'test-contributor');
  let fail = true;
  global.fetch = async () => { requests++; if (fail) throw Error('offline'); return { status: 404, ok: false }; };
  await assert.rejects(lookupOpenFoodFacts('4909999900011'), /offline/);
  fail = false;
  assert.equal(await lookupOpenFoodFacts('4909999900011'), null);
  assert.equal(await lookupOpenFoodFacts('4909999900011'), null);
  assert.equal(requests, 3);
});

test('OFF limiter applies a rolling minute and honors server backoff', () => {
  let now = 0;
  const gate = createProductLookupGate(() => now);
  for (let index = 0; index < 15; index++) gate.take();
  assert.throws(() => gate.take(), /60秒/);
  now = 59_999; assert.throws(() => gate.take());
  now = 60_000; assert.doesNotThrow(() => gate.take());
  gate.block(90_000);
  now = 100_000; assert.throws(() => gate.take(), /50秒/);
  now = 150_000; assert.doesNotThrow(() => gate.take());
});

test('ordinary first launch has no fictional personal stock; demo is explicit and catalog samples are gated', () => {
  const before = process.env.EXPO_PUBLIC_DEMO_DATA;
  try {
    delete process.env.EXPO_PUBLIC_DEMO_DATA;
    const initial = createInitialData();
    assert.deepEqual(initial.foods, []); assert.deepEqual(initial.shoppingItems, []);
    assert.equal(initial.notificationSettings.enabled, false);
    assert.equal(findProductByBarcode('4901234567894'), null);
    process.env.EXPO_PUBLIC_DEMO_DATA = 'true';
    assert.ok(createInitialData().foods.length > 0);
    assert.ok(findProductByBarcode('4901234567894'));
  } finally { if (before === undefined) delete process.env.EXPO_PUBLIC_DEMO_DATA; else process.env.EXPO_PUBLIC_DEMO_DATA = before; }
});
