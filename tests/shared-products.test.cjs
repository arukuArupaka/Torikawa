require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const Module = require('node:module');
const { createCatalogServer, openCatalog } = require('../server/shared-products.cjs');
const { normalizeSharedBarcode } = require('../shared/productContract.js');
const originalLoad = Module._load;
let learned = null;
let yahoo = null;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: () => ({ uri: 'test-image' }) } };
  if (request.endsWith('learnedProductService')) return { findLearnedProduct: async () => learned };
  if (request.endsWith('yahooProductLookupService')) return { lookupYahooProductByBarcode: async () => yahoo };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { shareProduct, lookupSharedProduct } = require('../src/services/sharedProductService.ts');
const { lookupProductByBarcode } = require('../src/services/productLookupService.ts');
const product = { barcode: '4901234567887', name: '共有テスト牛乳', ingredientName: '牛乳', category: 'dairy' };
async function start(options = {}) {
  const server = createCatalogServer({ databasePath: ':memory:', ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  return { server, url, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}
const post = (url, data, headers = {}) => fetch(`${url}/v1/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });

test('one client publishes and another reads only product data, which survives an API restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tabedoki-catalog-'));
  const databasePath = join(dir, 'products.sqlite');
  let api = await start({ databasePath, allowedOrigins: ['https://client-a.example', 'https://client-b.example'] });
  t.after(async () => { await api.close(); rmSync(dir, { recursive: true }); });
  assert.equal((await post(api.url, product, { Origin: 'https://client-a.example' })).status, 201);
  let response = await fetch(`${api.url}/v1/products/${product.barcode}`, { headers: { Origin: 'https://client-b.example' } });
  assert.deepEqual(await response.json(), { product });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://client-b.example');
  await api.close(); api = await start({ databasePath });
  response = await fetch(`${api.url}/v1/products/${product.barcode}`);
  assert.deepEqual(await response.json(), { product });
});

test('server rejects every private field, including photos and personal storage, before persisting', async (t) => {
  const api = await start(); t.after(api.close);
  for (const key of ['quantity', 'quantityUnit', 'expiryDate', 'purchaseDate', 'storage', 'memo', 'image', 'tags', 'userId', 'foods', 'status']) {
    assert.equal((await post(api.url, { ...product, [key]: 'PRIVATE' })).status, 400, key);
  }
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
});

test('duplicate or conflicting posts never overwrite an existing product and hidden products stay hidden', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tabedoki-conflict-'));
  const databasePath = join(dir, 'products.sqlite');
  const api = await start({ databasePath });
  t.after(async () => { await api.close(); rmSync(dir, { recursive: true }); });
  const responses = await Promise.all(Array.from({ length: 5 }, () => post(api.url, product)));
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 200).length, 4);
  assert.equal((await post(api.url, { ...product, name: '上書き' })).status, 409);
  assert.deepEqual((await (await fetch(`${api.url}/v1/products/${product.barcode}`)).json()).product, product);
  const db = openCatalog(databasePath); db.prepare('UPDATE products SET hidden=1 WHERE barcode=?').run(product.barcode); db.close();
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  assert.equal((await post(api.url, product)).status, 409);
});

test('API validates barcode, sizes, CORS and write limits', async (t) => {
  const api = await start({ writeLimit: 3 }); t.after(api.close);
  assert.equal(normalizeSharedBarcode('４９０１２３４５６７８８７'), product.barcode);
  assert.equal(normalizeSharedBarcode('4901234567881'), null);
  assert.equal(normalizeSharedBarcode('00000000'), null);
  assert.equal((await post(api.url, product, { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post(api.url, { ...product, name: 'あ'.repeat(121) })).status, 400);
  assert.equal((await post(api.url, { ...product, barcode: '4901234567881' })).status, 400);
  assert.equal((await post(api.url, { ...product, category: 'wrong' })).status, 400);
  assert.equal((await post(api.url, product)).status, 429);
});

test('malformed, oversized and streamed oversized bodies are rejected without a database write', async (t) => {
  const api = await start(); t.after(api.close);
  const send = (body, extra = {}) => fetch(`${api.url}/v1/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, ...extra });
  assert.equal((await send('{broken')).status, 400);
  assert.equal((await send(JSON.stringify({ ...product, name: 'あ'.repeat(1000) }))).status, 413);
  async function* chunks() { yield ' '.repeat(1500); yield ' '.repeat(1500); }
  assert.equal((await send(chunks(), { duplex: 'half' })).status, 413);
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
});

test('client builds a whitelist payload and a second client retrieves a shared lookup result', async (t) => {
  const api = await start(); t.after(api.close);
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = api.url;
  t.after(() => { delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL; });
  assert.equal(await shareProduct({ ...product, memo: 'private', storage: 'frozen', quantity: 9, expiryDate: 'PRIVATE', image: 'file:///private.jpg' }), 'created');
  const result = await lookupProductByBarcode(product.barcode);
  assert.equal(result.source, 'shared');
  assert.equal(result.product.name, product.name);
  assert.equal(result.product.storage, 'refrigerated', 'uses a local default, never the contributor refrigerator setting');
  assert.deepEqual(result.product.tags, []);
  assert.equal(await shareProduct(product), 'already_shared');
  assert.equal(await shareProduct({ ...product, name: '違う名前' }), 'already_exists');
});

test('shared outages and invalid responses fall back to external providers; no endpoint sends no request', async (t) => {
  const realFetch = global.fetch;
  t.after(() => { global.fetch = realFetch; delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL; yahoo = null; });
  delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('offline'); };
  assert.equal(await lookupSharedProduct(product.barcode), null);
  assert.equal(calls, 0);
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = 'http://localhost:8787';
  yahoo = { ...product, image: 'test', tags: [], storage: 'room' };
  assert.equal((await lookupProductByBarcode(product.barcode)).source, 'yahoo-shopping');
  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ product: { ...product, barcode: '4901234567894' } }) });
  assert.equal((await lookupProductByBarcode(product.barcode)).source, 'yahoo-shopping');
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = 'http://insecure.example';
  calls = 0;
  global.fetch = async () => { calls++; throw new Error('must not fetch'); };
  assert.equal(await lookupSharedProduct(product.barcode), null);
  assert.equal(calls, 0);
});

test('an external product 404 is a missing product, not a connection failure', async (t) => {
  const realFetch = global.fetch;
  t.after(() => { global.fetch = realFetch; });
  yahoo = null;
  delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
  global.fetch = async () => ({ status: 404, ok: false });
  assert.deepEqual(await lookupProductByBarcode('4909999987650'), { product: null, source: 'none' });
});
