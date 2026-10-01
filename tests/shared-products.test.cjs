require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const { createCatalogServer, openCatalog, reviewProduct } = require('../server/shared-products.cjs');
const { normalizeSharedBarcode, SHARED_RULES_VERSION } = require('../shared/productContract.js');
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
const { shareProduct, lookupSharedProduct, reportSharedProduct } = require('../src/services/sharedProductService.ts');
const { lookupProductByBarcode } = require('../src/services/productLookupService.ts');
const product = { barcode: '4901234567887', name: '共有テスト牛乳', ingredientName: '牛乳', category: 'dairy' };
async function start(options = {}) {
  const temporary = options.databasePath ? null : mkdtempSync(join(tmpdir(), 'tabedoki-api-'));
  const databasePath = options.databasePath || join(temporary, 'products.sqlite');
  const server = createCatalogServer({ ...options, databasePath });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  return { server, url, databasePath,
    review(action = 'approve') { const db = openCatalog(databasePath); try { return reviewProduct(db, action, product.barcode); } finally { db.close(); } },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => { if (temporary) rmSync(temporary, { recursive: true }); resolve(); }); }) };
}
const post = (url, data, headers = {}) => fetch(`${url}/v1/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shared-Rules-Version': SHARED_RULES_VERSION, ...headers }, body: JSON.stringify(data) });
const report = (url, data, barcode = product.barcode) => fetch(`${url}/v1/products/${barcode}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

test('a post stays private until approval; another client reads only product data after approval and restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tabedoki-catalog-'));
  const databasePath = join(dir, 'products.sqlite');
  let api = await start({ databasePath, allowedOrigins: ['https://client-a.example', 'https://client-b.example'] });
  t.after(async () => { await api.close(); rmSync(dir, { recursive: true }); });
  const posted = await post(api.url, product, { Origin: 'https://client-a.example' });
  assert.equal(posted.status, 201); assert.deepEqual(await posted.json(), { status: 'pending' });
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  await api.close(); api = await start({ databasePath, allowedOrigins: ['https://client-b.example'] });
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404, 'pending remains pending after restart');
  api.review();
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
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  assert.deepEqual(await (await post(api.url, product)).json(), { status: 'already_pending' });
  api.review();
  assert.deepEqual(await (await post(api.url, product)).json(), { status: 'already_shared' });
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
  const send = (body, extra = {}) => fetch(`${api.url}/v1/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shared-Rules-Version': SHARED_RULES_VERSION }, body, ...extra });
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
  assert.equal(await shareProduct({ ...product, memo: 'private', storage: 'frozen', quantity: 9, expiryDate: 'PRIVATE', image: 'file:///private.jpg' }, SHARED_RULES_VERSION), 'pending');
  assert.equal(await lookupSharedProduct(product.barcode), null);
  api.review();
  const result = await lookupProductByBarcode(product.barcode);
  assert.equal(result.source, 'shared');
  assert.equal(result.product.name, product.name);
  assert.equal(result.product.storage, 'refrigerated', 'uses a local default, never the contributor refrigerator setting');
  assert.deepEqual(result.product.tags, []);
  assert.equal(await shareProduct(product, SHARED_RULES_VERSION), 'already_shared');
  assert.equal(await shareProduct({ ...product, name: '違う名前' }, SHARED_RULES_VERSION), 'already_exists');
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

test('current rule consent is required by client and server; preflight allows the explicit consent header', async (t) => {
  const api = await start(); t.after(api.close);
  for (const version of [undefined, 'old-rules']) {
    const headers = { 'Content-Type': 'application/json' };
    if (version) headers['X-Shared-Rules-Version'] = version;
    const response = await fetch(`${api.url}/v1/products`, { method: 'POST', headers, body: JSON.stringify(product) });
    assert.equal(response.status, 428);
    assert.equal((await response.json()).rulesVersion, SHARED_RULES_VERSION);
  }
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = api.url;
  t.after(() => { delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL; });
  await assert.rejects(shareProduct(product, undefined), /同意/);
  const db = openCatalog(api.databasePath);
  assert.equal(db.prepare('SELECT count(*) AS n FROM products').get().n, 0); db.close();
  const preflight = await fetch(`${api.url}/v1/products`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Shared-Rules-Version/);
});

test('legacy database migration preserves all products and hidden state without auto-approving or inventing consent', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'tabedoki-legacy-'));
  const databasePath = join(directory, 'products.sqlite');
  let db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE products (barcode TEXT PRIMARY KEY, name TEXT NOT NULL, ingredient_name TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0) STRICT');
  db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)').run(product.barcode, product.name, product.ingredientName, product.category, '2026-09-01', 1); db.close();
  const api = await start({ databasePath });
  t.after(async () => { await api.close(); rmSync(directory, { recursive: true }); });
  db = openCatalog(databasePath);
  const row = db.prepare('SELECT * FROM products').get();
  assert.equal(row.name, product.name); assert.equal(row.created_at, '2026-09-01');
  assert.equal(row.hidden, 1); assert.equal(row.review_status, 'pending'); assert.equal(row.rules_version, null);
  assert.equal(reviewProduct(db, 'restore', product.barcode).changes, 0);
  db.close();
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  api.review();
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404, 'approval alone does not undo an existing hide');
  api.review('restore');
  assert.deepEqual((await (await fetch(`${api.url}/v1/products/${product.barcode}`)).json()).product, product);
});

test('rejected and hidden products cannot be restored by a public post or by restore without approval', async (t) => {
  const api = await start(); t.after(api.close);
  await post(api.url, product); api.review('reject');
  assert.equal(api.review('restore').changes, 0);
  assert.equal((await post(api.url, product)).status, 409);
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  api.review(); api.review('hide');
  assert.equal((await post(api.url, product)).status, 409);
  api.review('restore');
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 200);
});

test('reports accept only a fixed reason for public products, aggregate safely and survive restart; admin can resolve and hide', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'tabedoki-reports-'));
  const databasePath = join(directory, 'products.sqlite');
  let api = await start({ databasePath });
  t.after(async () => { await api.close(); rmSync(directory, { recursive: true }); });
  await post(api.url, product);
  assert.equal((await report(api.url, { reason: 'incorrect' })).status, 404, 'pending content is not reportable');
  api.review();
  for (const body of [{}, { reason: 'custom text' }, { reason: 'incorrect', memo: 'PRIVATE' }, { reason: 'rights', image: 'file:///private.jpg' }]) {
    assert.equal((await report(api.url, body)).status, 400);
  }
  assert.equal((await report(api.url, { reason: 'incorrect' }, '4901234567881')).status, 400);
  for (let i = 0; i < 2; i++) {
    const response = await report(api.url, { reason: 'incorrect' });
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { status: 'report_received' });
  }
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 200, 'reports cannot force an automatic takedown');
  await api.close(); api = await start({ databasePath });
  const admin = (...args) => execFileSync(process.execPath, ['server/admin.cjs', ...args], { cwd: join(__dirname, '..'), env: { ...process.env, SHARED_DB_PATH: databasePath }, encoding: 'utf8' });
  const reports = JSON.parse(admin('reports'));
  assert.equal(reports.length, 1); assert.equal(reports[0].report_count, 2);
  assert.deepEqual(Object.keys(reports[0]).sort(), ['barcode', 'reason', 'report_count', 'first_reported_at', 'last_reported_at', 'resolved_at', 'name', 'ingredientName', 'category', 'review_status', 'hidden'].sort());
  admin('resolve', product.barcode); assert.deepEqual(JSON.parse(admin('reports')), []);
  await report(api.url, { reason: 'incorrect' });
  assert.equal(JSON.parse(admin('reports'))[0].report_count, 3, 'a new report reopens the reason');
  admin('hide', product.barcode);
  assert.equal((await fetch(`${api.url}/v1/products/${product.barcode}`)).status, 404);
  assert.equal((await report(api.url, { reason: 'incorrect' })).status, 404);
  assert.equal((await fetch(`${api.url}/v1/admin/approve`)).status, 404);
  assert.equal(JSON.parse(admin('list', 'hidden'))[0].barcode, product.barcode);
});

test('client report transmits only barcode and an enumerated reason, and reports share the write limit', async (t) => {
  const api = await start({ writeLimit: 2 }); t.after(api.close);
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = api.url;
  t.after(() => { delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL; });
  await shareProduct(product, SHARED_RULES_VERSION); api.review();
  await reportSharedProduct(product.barcode, 'personal_information');
  await assert.rejects(reportSharedProduct(product.barcode, 'inappropriate'), /上限/);
  await assert.rejects(reportSharedProduct(product.barcode, 'PRIVATE custom text'), /確認/);
  const db = openCatalog(api.databasePath);
  assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get().n, 1);
  assert.equal(db.prepare('SELECT reason FROM reports').get().reason, 'personal_information');
  assert.equal(db.prepare('SELECT rules_version FROM products').get().rules_version, SHARED_RULES_VERSION);
  db.close();
});
