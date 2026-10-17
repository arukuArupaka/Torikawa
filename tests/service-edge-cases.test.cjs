require('./register-typescript.cjs');
const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { version: installedVersion } = require('../package.json');
const originalLoad = Module._load;
const manifestVersion = `${installedVersion}-version-test`;
Module._load = function(request, ...args) {
  if (request === '../../package.json' && args[0]?.filename.endsWith('backupService.ts')) return { version: manifestVersion };
  if (request === 'expo-document-picker') return {};
  if (request === './backupImages') return { embedImage: async (uri) => uri };
  if (request === './backupFileAccess') return {};
  if (request === '../data/sampleData') return { sampleRecipeImages: {} };
  if (request === './storage') return { getStorageEpoch: () => 0, assertStorageEpoch() {}, loadStoredValue: async () => ({}), storageKeys: { learnedProducts: 'learned' } };
  return originalLoad.call(this, request, ...args);
};
const { prepareBackup, validatePayload } = require('../src/services/backupService.ts');
const { lookupSharedProduct, shareProduct, reportSharedProduct } = require('../src/services/sharedProductService.ts');
const { SHARED_RULES_VERSION } = require('../shared/productContract.js');
const { textBytes, checkBackupSize, MAX_BACKUP_BYTES } = require('../src/services/backupLimits.ts');
const { createId } = require('../src/utils/id.ts');
after(() => { Module._load = originalLoad; });

const product = { barcode: '4901234567887', name: '牛乳', ingredientName: '牛乳', category: 'dairy' };
const snapshot = () => ({ foods: [], recipes: [], shoppingItems: [], notificationSettings: { enabled: false, daysBeforeList: [3], time: '18:00' } });
function mockResponse(t, status, body = '<html>Bad Gateway</html>') {
  const previousUrl = process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
  process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = 'https://catalog.example';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
    else process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL = previousUrl;
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status, headers: { 'Content-Type': 'text/html' } }));
}

test('backup export reads the package version rather than a fixed release number', async () => {
  const prepared = await prepareBackup(snapshot());
  const exported = JSON.parse(prepared.contents);
  assert.equal(exported.appVersion, manifestVersion);
  assert.equal(exported.format, 'refrigerator-note-backup');
  assert.equal(exported.version, 2);
});

test('old and UUID-style IDs coexist in backup versions 1 and 2 without rewriting or relaxing duplicate checks', async (t) => {
  t.mock.method(Date, 'now', () => 1792195200000);
  t.mock.method(Math, 'random', () => 0.123456789);
  const legacyId = createId('shopping');
  assert.match(legacyId, /^shopping-1792195200000-[a-z0-9]+$/);
  const uuidId = 'shopping-550e8400-e29b-41d4-a716-446655440000';
  const data = { ...snapshot(), learnedProducts: {}, shoppingItems: [legacyId, uuidId].map((id) => ({ id, name: '卵', checked: false, createdAt: '2026-10-17' })) };
  for (const version of [1, 2]) {
    const payload = { format: 'refrigerator-note-backup', version, appVersion: '1.20.0', exportedAt: '2026-10-17', data, ...(version === 2 ? { images: {} } : {}) };
    assert.equal(validatePayload(payload), payload);
    const exported = JSON.parse((await prepareBackup(data)).contents);
    assert.deepEqual(exported.data.shoppingItems.map((item) => item.id), [legacyId, uuidId]);
    assert.throws(() => validatePayload({ ...payload, data: { ...data, shoppingItems: [data.shoppingItems[0], data.shoppingItems[0]] } }), /IDの重複/);
  }
});

test('HTML proxy errors use the lookup, sharing and reporting error messages instead of a JSON SyntaxError', async (t) => {
  mockResponse(t, 502);
  await assert.rejects(lookupSharedProduct(product.barcode), { message: '共有商品情報を取得できませんでした。' });
  await assert.rejects(shareProduct(product, SHARED_RULES_VERSION), { message: '商品情報を共有できませんでした。時間をおいてお試しください。' });
  await assert.rejects(reportSharedProduct(product.barcode, 'incorrect'), { message: '通報を送信できませんでした。時間をおいてお試しください。' });
});

test('non-JSON responses retain 404, 409, 428 and 429 handling', async (t) => {
  mockResponse(t, 404);
  assert.equal(await lookupSharedProduct(product.barcode), null);
  await assert.rejects(reportSharedProduct(product.barcode, 'incorrect'), /現在公開されていません/);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 409 }));
  assert.equal(await shareProduct(product, SHARED_RULES_VERSION), 'already_exists');
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Rules updated</html>', { status: 428 }));
  await assert.rejects(shareProduct(product, SHARED_RULES_VERSION), /投稿ルールが更新/);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Too many requests</html>', { status: 429 }));
  await assert.rejects(shareProduct(product, SHARED_RULES_VERSION), /共有回数の上限/);
  await assert.rejects(reportSharedProduct(product.barcode, 'incorrect'), /送信回数の上限/);
});

test('non-JSON successful responses report invalid results and genuine fetch failures are preserved', async (t) => {
  mockResponse(t, 200);
  await assert.rejects(lookupSharedProduct(product.barcode), /共有商品情報の形式が正しくありません/);
  await assert.rejects(shareProduct(product, SHARED_RULES_VERSION), /共有結果を確認できませんでした/);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 202 }));
  await assert.rejects(reportSharedProduct(product.barcode, 'incorrect'), /通報を送信できませんでした/);
  const networkError = new TypeError('network unavailable');
  t.mock.method(globalThis, 'fetch', async () => { throw networkError; });
  await assert.rejects(lookupSharedProduct(product.barcode), (error) => error === networkError);
});

test('TextEncoder and the original fallback count the same UTF-8 bytes for Japanese, emoji and unpaired surrogates', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
  const Encoder = globalThis.TextEncoder;
  t.after(() => Object.defineProperty(globalThis, 'TextEncoder', descriptor));
  let fastPathCalls = 0;
  class RecordingEncoder extends Encoder { encode(value) { fastPathCalls++; return super.encode(value); } }
  const cases = ['', 'milk 123', '牛乳と卵を使い切る', '🥛🍳👩‍🍳', '\0éあ😀\ud800x\udc00', '\udc00\ud800', '\ud800\ud800\udc00', '牛乳🥛'.repeat(10000)];
  for (const value of cases) {
    Object.defineProperty(globalThis, 'TextEncoder', { ...descriptor, value: RecordingEncoder });
    const fast = textBytes(value);
    Object.defineProperty(globalThis, 'TextEncoder', { ...descriptor, value: undefined });
    assert.equal(textBytes(value), fast);
    assert.equal(fast, Buffer.byteLength(value, 'utf8'));
  }
  assert.equal(fastPathCalls, cases.length);
});

test('UTF-8 backup size checks still accept exactly 20MB and reject the next Japanese character', () => {
  const value = '🥛'.repeat(MAX_BACKUP_BYTES / 4);
  assert.equal(textBytes(value), MAX_BACKUP_BYTES);
  assert.doesNotThrow(() => checkBackupSize(textBytes(value)));
  assert.throws(() => checkBackupSize(textBytes(value + 'あ')), /上限は20MB/);
});
