require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map();
const files = new Map();
const deleted = [];
const alerts = [];
const writes = [];
let failWrite = () => false;
let failRead = () => false;
let beforeWrite = async () => {};
let failImage = false;
let truncateImage = false;
let failDelete = false;
let pickerCanceled = false;
let sharedUri;
const appListeners = new Set();
const notificationSyncs = [];
let failNotifications = false;
class File {
  constructor(...parts) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).reduce((base, part) => base.replace(/\/$/, '') + '/' + part); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  async text() { if (!this.exists) throw new Error('missing file'); return files.get(this.uri).toString(); }
  async base64() { if (!this.exists) throw new Error('missing image'); return files.get(this.uri).toString('base64'); }
  write(value, options) {
    files.set(this.uri, Buffer.from(value, options?.encoding === 'base64' ? 'base64' : 'utf8'));
    if (truncateImage && options?.encoding === 'base64') files.set(this.uri, Buffer.from('x'));
    if (failImage && options?.encoding === 'base64') throw new Error('photo disk full');
  }
  copy(destination) { if (!this.exists) throw new Error('missing source'); files.set(destination.uri, files.get(this.uri)); }
  delete() { if (failDelete) throw new Error('photo busy'); deleted.push(this.uri); files.delete(this.uri); }
}
const adapter = {
  async getAllKeys() { return [...store.keys()]; },
  async getItem(key) { if (failRead(key)) throw new Error('read failed'); return store.get(key) ?? null; },
  async setItem(key, value) {
    writes.push(key);
    await beforeWrite(key, value);
    if (failWrite(key)) throw new Error('disk full');
    store.set(key, value);
  },
};
const native = {
  AppState: { addEventListener: (_event, callback) => { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } },
  Image: { resolveAssetSource: () => ({ uri: 'test-image' }) },
  Alert: { alert: (...args) => alerts.push(args) },
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles) => styles },
  Pressable: 'Pressable', Text: 'Text', ScrollView: 'ScrollView', View: 'View',
};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === '@react-native-async-storage/async-storage') return adapter;
  if (request === 'react-native') return native;
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === 'expo-file-system') return { File, Paths: { document: { uri: 'file:///document/' }, cache: { uri: 'file:///cache/' } } };
  if (request === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: pickerCanceled, assets: [{ uri: 'file:///backup.json' }] }) };
  if (request === 'expo-sharing') return { isAvailableAsync: async () => true, shareAsync: async (uri) => { sharedUri = uri; } };
  if (request.endsWith('/notificationService')) return { queueNotificationSync: async (foods, settings) => {
    notificationSyncs.push(structuredClone({ foods, settings }));
    if (failNotifications) throw Error('OS reservation failed');
  } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const storage = require('../src/services/storage.ts');
const { storageKeys: keys, snapshotKeys, generationKey } = storage;
const { restoreBackup, validatePayload, shareRecoveryData, prepareBackup } = require('../src/services/backupService.ts');
const { saveLearnedProduct, correctLearnedProduct, findLearnedProduct } = require('../src/services/learnedProductService.ts');
const { lookupProductByBarcode } = require('../src/services/productLookupService.ts');
const { AppDataProvider, useAppData, useFoodData } = require('../src/context/AppDataContext.tsx');
const { DataRecoveryPanel } = require('../src/components/DataRecoveryPanel.tsx');
const { validateSnapshot, isCalendarDate } = require('../src/services/dataValidation.ts');
let context;
function Consumer() { context = useAppData(); return null; }
const food = (overrides = {}) => ({
  id: 'food-1', name: '牛乳', productName: null, ingredientName: '牛乳', tags: [], image: 'file:///document/old.jpg',
  category: 'dairy', storage: 'refrigerated', quantity: 100, quantityUnit: 'ml',
  expiryDate: '2026-10-02', purchaseDate: '2026-09-29', createdAt: '2026-09-29T00:00:00.000Z',
  memo: '', status: 'active', usedAt: null, disposedAt: null, ...overrides,
});
const recipe = (overrides = {}) => ({ id: 'recipe-user', name: '牛乳料理', image: '', category: 'main', ingredients: ['牛乳'], ingredientAmounts: { 牛乳: '50ml' }, steps: ['温める'], minutes: 5, servings: 1, isFavorite: false, createdAt: '2026-09-29', ...overrides });
const product = (barcode = '4901234567887', image = '') => ({ barcode, name: '牛乳', ingredientName: '牛乳', image, category: '乳製品', storage: 'refrigerated' });
const data = () => ({ foods: [food()], recipes: [recipe()], shoppingItems: [{ id: 'shop-1', name: '卵', checked: false, createdAt: '2026-09-29' }], notificationSettings: { enabled: false, daysBeforeList: [3], time: '18:00' }, learnedProducts: {} });
const payload = () => ({ format: 'refrigerator-note-backup', version: 1, appVersion: '1.20.0', exportedAt: '2026-09-29T00:00:00Z', data: { ...data(), foods: [food({ id: 'restored', name: '復元した牛乳', image: 'data:image/jpeg;base64,YWJj' })] } });
const entries = (d) => ({ [keys.foods]: d.foods, [keys.recipes]: d.recipes, [keys.shopping]: d.shoppingItems, [keys.notifications]: d.notificationSettings, [keys.learnedProducts]: d.learnedProducts });
async function reset() {
  await storage.loadStoredValues([]); // Drain previously queued maintenance.
  store.clear(); files.clear(); deleted.length = 0; alerts.length = 0; writes.length = 0;
  failWrite = () => false; failRead = () => false; beforeWrite = async () => {}; failImage = false; truncateImage = false; failDelete = false; pickerCanceled = false;
  notificationSyncs.length = 0; failNotifications = false;
  Object.entries(entries(data())).forEach(([key, value]) => store.set(key, JSON.stringify(value)));
  files.set('file:///document/old.jpg', Buffer.from('old photo'));
  await storage.loadStoredValues(snapshotKeys);
}
async function diskSnapshot() {
  // Fresh module simulates process restart: no cached generation/state survives.
  const path = require.resolve('../src/services/storage.ts');
  const cached = require.cache[path];
  delete require.cache[path];
  const fresh = require(path);
  require.cache[path] = cached;
  return Object.fromEntries(await Promise.all(snapshotKeys.map(async (key) => [key, await fresh.loadStoredValue(key)])));
}
async function mount(t, child) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), child)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('phase 3 provider surfaces notification failure, retries on foreground and syncs restored settings before completion', async (t) => {
  await reset(); await mount(t);
  failNotifications = true;
  await act(async () => context.markFoodUsed('food-1'));
  assert.match(context.notificationSyncError, /OS reservation failed/);
  assert.equal(context.isNotificationSyncing, false);
  assert.equal(notificationSyncs.at(-1).foods[0].status, 'used');
  failNotifications = false;
  await act(async () => { for (const callback of appListeners) callback('active'); });
  assert.equal(context.notificationSyncError, null);
  await act(async () => context.restoreAppData(payload()));
  assert.equal(notificationSyncs.at(-1).foods[0].id, 'restored');
  assert.deepEqual(notificationSyncs.at(-1).settings, payload().data.notificationSettings);
  failNotifications = true;
  await act(async () => context.restoreAppData(payload()));
  assert.equal(context.foods[0].id, 'restored');
  assert.match(context.notificationSyncError, /OS reservation failed/);
});

test('phase 3 settings persistence failure leaves the old setting; sync failure exposes retry without reverting saved settings', async (t) => {
  await reset(); await mount(t);
  const updated = { enabled: true, daysBeforeList: [0, 3], time: '09:00' };
  failWrite = (key) => key === keys.notifications;
  await act(async () => { await assert.rejects(context.updateNotificationSettings(updated), /disk full/); });
  assert.equal(context.notificationSettings.enabled, false);
  failWrite = () => false; failNotifications = true;
  await act(async () => { await assert.rejects(context.updateNotificationSettings(updated), /OS reservation failed/); });
  assert.deepEqual(context.notificationSettings, updated);
  assert.deepEqual((await diskSnapshot())[keys.notifications], updated);
  assert.ok(context.notificationSyncError);
  failNotifications = false;
  await act(async () => context.resyncNotifications());
  assert.equal(context.notificationSyncError, null);
});

test('phase 3 portable backup deduplicates image bytes across food, recipes and catalog and restores shared files', async () => {
  await reset();
  files.set('file:///document/copy.jpg', Buffer.from('old photo'));
  const input = data(); input.recipes[0].image = 'file:///document/copy.jpg';
  await saveLearnedProduct(product('4901234567887', 'file:///document/copy.jpg'));
  const prepared = await prepareBackup(input);
  const exported = JSON.parse(prepared.contents);
  assert.equal(exported.version, 2); assert.equal(prepared.embeddedCount, 1);
  assert.equal(exported.data.foods[0].image, exported.data.recipes[0].image);
  assert.equal(exported.data.foods[0].image, exported.data.learnedProducts['4901234567887'].image);
  files.clear(); // No original device paths exist on the receiving device.
  const restored = await restoreBackup(exported);
  assert.equal(files.get(restored.foods[0].image).toString(), 'old photo');
  assert.equal(restored.foods[0].image, restored.recipes[0].image);
  assert.equal((await storage.loadStoredValue(keys.learnedProducts))['4901234567887'].image, restored.foods[0].image);
});

test('phase 3 bundled recipe images use stable asset IDs and remote images remain declared references', async () => {
  await reset();
  const assets = require('../src/data/sampleData.ts').sampleRecipeImages;
  const input = data(); input.foods[0].image = 'https://example.test/image.jpg'; input.recipes[0].image = assets['recipe-1'];
  const prepared = await prepareBackup(input); const exported = JSON.parse(prepared.contents);
  assert.equal(prepared.externalCount, 1); assert.equal(prepared.embeddedCount, 0);
  assert.equal(exported.data.recipes[0].image, 'tabedoki-asset:recipe-1');
  const originalAsset = assets['recipe-1']; assets['recipe-1'] = 'another-device-bundle.jpg';
  try { assert.equal((await restoreBackup(exported)).recipes[0].image, 'another-device-bundle.jpg'); }
  finally { assets['recipe-1'] = originalAsset; }
});

test('phase 3 rejects missing image references and oversized photos before committing any restored data', async () => {
  await reset(); const before = await diskSnapshot();
  const broken = payload(); broken.version = 2; broken.images = {}; broken.data.foods[0].image = 'tabedoki-image:missing';
  await assert.rejects(restoreBackup(broken), /参照する写真/);
  assert.deepEqual(await diskSnapshot(), before);
  const tooLarge = payload(); tooLarge.data.foods[0].image = 'data:image/jpeg;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  await assert.rejects(restoreBackup(tooLarge), /5MB/);
  assert.deepEqual(await diskSnapshot(), before);
  const oversizedFile = 'file:///document/large.jpg'; files.set(oversizedFile, Buffer.alloc(5 * 1024 * 1024 + 1));
  await assert.rejects(prepareBackup({ ...data(), foods: [food({ image: oversizedFile })] }), /5MB/);
});

test('phase 3 limits total embedded image bytes and retains version 1 import compatibility', async () => {
  await reset();
  const input = data(); input.foods = [];
  for (let index = 0; index < 3; index++) {
    const path = `file:///document/large-${index}.jpg`; files.set(path, Buffer.alloc(4 * 1024 * 1024, index));
    input.foods.push(food({ id: String(index), image: path }));
  }
  await assert.rejects(prepareBackup(input), /10MB/);
  const restored = await restoreBackup(payload());
  assert.equal(files.get(restored.foods[0].image).toString(), 'abc');
});

test('phase 2 corrected product is the next barcode result, preserving catalog images and unrelated concurrent saves', async () => {
  await reset();
  const original = { ...product(), image: 'https://example.test/catalog.jpg', storage: 'room' };
  await saveLearnedProduct(original);
  await Promise.all([
    correctLearnedProduct({ barcode: original.barcode, name: '訂正した牛乳', ingredientName: '牛乳', category: 'dairy', quantity: 3, memo: 'PRIVATE', expiryDate: 'PRIVATE', image: 'file:///private.jpg', storage: 'frozen' }),
    saveLearnedProduct(product('4901234567894')),
  ]);
  const lookup = await lookupProductByBarcode(original.barcode);
  assert.equal(lookup.source, 'learned');
  assert.equal(lookup.product.name, '訂正した牛乳');
  assert.equal(lookup.product.storage, 'room');
  assert.equal(lookup.product.image, original.image);
  assert.deepEqual(Object.keys(lookup.product).sort(), ['barcode', 'name', 'ingredientName', 'category', 'tags', 'image', 'storage'].sort());
  assert.ok(await findLearnedProduct('4901234567894'));
  const persisted = (await diskSnapshot())[keys.learnedProducts];
  assert.equal(persisted[original.barcode].name, '訂正した牛乳');
  assert.equal(JSON.stringify(persisted).includes('PRIVATE'), false);
});

test('phase 2 failed catalog correction preserves the previous product and can be retried', async () => {
  await reset();
  const original = product(); await saveLearnedProduct(original);
  failWrite = (key) => key === keys.learnedProducts;
  const correction = { barcode: original.barcode, name: '訂正後', ingredientName: '牛乳', category: 'dairy' };
  await assert.rejects(correctLearnedProduct(correction), /disk full/);
  assert.equal((await findLearnedProduct(original.barcode)).name, original.name);
  failWrite = () => false;
  await correctLearnedProduct(correction);
  assert.equal((await lookupProductByBarcode(original.barcode)).product.name, '訂正後');
});

test('phase 2 consumption history and barcode survive restore, and duplicate operations stay inert after hydration', async (t) => {
  await reset(); await mount(t);
  const pending = { operationId: 'phase2-cook', recipeId: 'recipe-user', items: [{ foodId: 'food-1', amount: 40, unit: 'ml', expectedQuantity: 100, expectedExpiryDate: '2099-01-01', expectedRevision: 1 }] };
  await act(async () => context.updateFood('food-1', { ...context.foods[0], barcode: '4901234567887', expiryDate: '2099-01-01' }));
  await act(async () => { assert.equal(context.recordConsumption(pending), true); assert.equal(context.recordConsumption(pending), false); });
  const cooked = structuredClone(context.foods[0]);
  assert.equal(cooked.quantity, 60);
  const backup = payload(); backup.data.foods = [{ ...cooked, image: '' }];
  await act(async () => context.restoreAppData(backup));
  assert.equal(context.foods[0].barcode, '4901234567887');
  assert.deepEqual(context.foods[0].consumptionHistory, cooked.consumptionHistory);
  await act(async () => { assert.equal(context.recordConsumption(pending), false); });
  assert.equal((await diskSnapshot())[keys.foods][0].quantity, 60);
  const stale = { ...cooked, consumptionHistory: [], status: 'used', usedAt: '2026-09-29' };
  await act(async () => context.updateFood('food-1', stale));
  assert.equal(context.foods[0].status, 'active', 'generic edits cannot replace lifecycle fields');
  assert.deepEqual(context.foods[0].consumptionHistory, cooked.consumptionHistory, 'generic edits cannot erase the operation ledger');
});

test('phase 2 migrates only exact old barcode memos and preserves user classifications', async (t) => {
  await reset();
  store.set(keys.foods, JSON.stringify([
    food({ id: 'exact', memo: 'バーコード: 4901234567887', ingredientName: '手で決めた分類' }),
    food({ id: 'note', memo: 'バーコード: 4901234567894 開封済み' }),
  ]));
  await mount(t);
  assert.equal(context.foods[0].barcode, '4901234567887');
  assert.equal(context.foods[0].ingredientName, '手で決めた分類');
  assert.equal(context.foods[1].barcode, undefined);
});

test('failure at every staging write or the head preserves the complete old snapshot after restart', async () => {
  for (const suffix of ['original', ...snapshotKeys.map((key) => key.split('/').at(-1)), 'active-generation']) {
    await reset();
    const before = await diskSnapshot();
    failWrite = (key) => key.endsWith('/' + suffix);
    await assert.rejects(restoreBackup(payload()), /disk full/);
    failWrite = () => false;
    assert.deepEqual(await diskSnapshot(), before, suffix);
    assert.ok(files.has('file:///document/old.jpg'));
    assert.equal(store.has(generationKey), false);
  }
});

test('successful restore switches all five collections, keeps old originals and routes later saves correctly', async () => {
  await reset();
  const original = new Map(store);
  const next = payload(); next.data.learnedProducts = { '4901234567887': product() };
  const restored = await restoreBackup(next);
  const saved = await diskSnapshot();
  assert.equal(saved[keys.foods][0].id, 'restored');
  assert.deepEqual(saved[keys.learnedProducts], next.data.learnedProducts);
  assert.ok(files.has(restored.foods[0].image));
  for (const [key, value] of original) assert.equal(store.get(key), value);
  await storage.saveStoredValue(keys.shopping, []);
  assert.deepEqual((await diskSnapshot())[keys.shopping], []);
  assert.equal(store.get(keys.shopping), original.get(keys.shopping));
  const archive = [...store.keys()].find((key) => key.endsWith('/original'));
  assert.equal(JSON.parse(store.get(archive))[keys.foods], original.get(keys.foods));
});

test('interrupted preparation never publishes staging; a later restore can succeed', async () => {
  await reset();
  const stopped = deferred(); const resume = deferred();
  beforeWrite = async (key) => { if (key.includes('/generation/') && key.endsWith('/recipes')) { stopped.resolve(); await resume.promise; throw new Error('process stopped'); } };
  const pending = restoreBackup(payload());
  await stopped.promise;
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'food-1');
  await assert.rejects(storage.saveStoredValue(keys.foods, []), /復元中/);
  resume.resolve();
  await assert.rejects(pending, /process stopped/);
  beforeWrite = async () => {};
  await restoreBackup(payload());
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'restored');
});

test('a head write that throws after committing is recognized as success', async () => {
  await reset();
  beforeWrite = async (key, value) => { if (key === generationKey) { store.set(key, value); throw new Error('lost acknowledgement'); } };
  await restoreBackup(payload());
  beforeWrite = async () => {};
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'restored');
});

test('uncertain commit blocks old state writes until complete reload and retains new photos', async (t) => {
  await reset();
  await mount(t);
  beforeWrite = async (key, value) => {
    if (key === generationKey) { store.set(key, value); failRead = (candidate) => candidate === generationKey; throw new Error('lost acknowledgement'); }
  };
  await act(async () => { await assert.rejects(context.restoreAppData(payload()), /再読み込み/); });
  assert.equal(context.isReady, false);
  await assert.rejects(storage.saveStoredValue(keys.foods, []), /復元中/);
  failRead = () => false; beforeWrite = async () => {};
  await act(async () => context.retryLoad());
  assert.equal(context.isReady, true);
  assert.equal(context.foods[0].id, 'restored');
  assert.ok(files.has(context.foods[0].image));
});

test('image write failure removes only new partial files and preserves originals', async () => {
  await reset();
  failImage = true;
  await assert.rejects(restoreBackup(payload()), /photo disk full/);
  assert.deepEqual([...files.keys()], ['file:///document/old.jpg']);
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'food-1');
  const broken = payload(); broken.data.foods[0].image = 'data:image/jpeg;base64,not!base64';
  await assert.rejects(restoreBackup(broken), /画像の形式/);
});

test('missing or truncated photos abort restoration before switching generations', async () => {
  await reset();
  const missing = payload(); missing.data.foods[0].image = 'file:///document/missing.jpg';
  await assert.rejects(restoreBackup(missing), /写真が見つかりません/);
  truncateImage = true;
  await assert.rejects(restoreBackup(payload()), /写真を保存できません/);
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'food-1');
  assert.deepEqual([...files.keys()], ['file:///document/old.jpg']);
});

test('failed second restoration preserves the edited active generation and never falls back to legacy', async () => {
  await reset(); await restoreBackup(payload());
  await storage.saveStoredValue(keys.shopping, []);
  const before = await diskSnapshot();
  const head = store.get(generationKey);
  failWrite = (key) => key.endsWith('/recipes');
  await assert.rejects(restoreBackup(payload()), /disk full/);
  failWrite = () => false;
  assert.equal(store.get(generationKey), head);
  assert.deepEqual(await diskSnapshot(), before);
  const current = JSON.parse(head).id;
  store.delete(`@food-manager/generation/${current}/foods`);
  await assert.rejects(diskSnapshot(), /一部が見つかりません/);
});

test('Web recovery keeps embedded photos intact and rejects nonportable image references', async () => {
  const web = require('../src/services/backupImages.web.ts');
  const image = 'data:image/png;base64,YWJj';
  assert.equal(web.restoreImage(image, 'food', []), image);
  assert.throws(() => web.restoreImage('data:image/png;base64,broken!', 'food', []), /画像の形式/);
  for (const uri of ['file:///other/phone.jpg', 'content://photo', 'blob:old-session']) {
    assert.throws(() => web.restoreImage(uri, 'food', []), /別の環境/);
  }
});

test('shared validation rejects duplicate IDs, invalid dates, quantity, lifecycle and collection shapes', async () => {
  const corruptions = [
    d => d.foods.push({ ...d.foods[0] }), d => d.recipes.push({ ...d.recipes[0] }),
    d => d.shoppingItems.push({ ...d.shoppingItems[0] }), d => d.foods[0].quantity = -5,
    d => d.foods[0].quantity = 0, d => d.foods[0].quantity = 100000,
    d => d.foods[0].expiryDate = '2026-02-31', d => d.foods[0].purchaseDate = '2026-13-01',
    d => d.foods[0].status = 'unknown', d => d.foods[0].status = null,
    d => d.foods[0].status = 'used', d => d.foods[0].usedAt = '2026-09-29',
    d => d.shoppingItems = {}, d => d.recipes = null, d => delete d.notificationSettings,
    d => d.notificationSettings.time = '25:00', d => d.learnedProducts = [],
    d => d.learnedProducts['4901234567887'] = product('12345678'),
  ];
  for (const corrupt of corruptions) {
    await reset(); const next = payload(); corrupt(next.data);
    assert.throws(() => validatePayload(next), /バックアップの内容/);
    await assert.rejects(restoreBackup(next), /バックアップの内容/);
    assert.equal(writes.length, 0);
  }
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2100-02-29'), false);
  const legacy = data();
  for (const key of ['productName', 'ingredientName', 'quantity', 'quantityUnit', 'category', 'tags', 'status', 'usedAt', 'disposedAt']) delete legacy.foods[0][key];
  delete legacy.recipes[0].category; delete legacy.recipes[0].createdAt; delete legacy.recipes[0].isFavorite;
  legacy.notificationSettings = { daysBefore: 3 };
  assert.doesNotThrow(() => validateSnapshot(legacy, true));
});

test('invalid stored shopping, explicit null and duplicate food IDs never trigger writes', async () => {
  for (const [key, value] of [[keys.shopping, '{}'], [keys.foods, 'null'], [keys.foods, JSON.stringify([food(), food()])]]) {
    await reset(); store.set(key, value);
    let renderer;
    await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer))); });
    assert.equal(context.isReady, false);
    assert.equal(writes.length, 0);
    assert.equal(store.get(key), value);
    await act(async () => renderer.unmount());
  }
});

test('deleting food during disk failure keeps its photo; successful retry collects it', async (t) => {
  await reset(); await mount(t);
  failWrite = () => true;
  await act(async () => context.deleteFood('food-1'));
  assert.ok(context.saveError);
  assert.ok(files.has('file:///document/old.jpg'));
  assert.equal(JSON.parse(store.get(keys.foods)).length, 1);
  failWrite = () => false;
  await act(async () => context.retrySave());
  assert.equal(context.saveError, null);
  assert.equal(files.has('file:///document/old.jpg'), false);
});

test('replacing recipe and food photos retains the old files until all collections are saved', async (t) => {
  await reset();
  store.set(keys.recipes, JSON.stringify([recipe({ image: 'file:///document/recipe-old.jpg' })]));
  files.set('file:///document/recipe-old.jpg', Buffer.from('recipe photo'));
  files.set('file:///document/new.jpg', Buffer.from('new photo'));
  await mount(t);
  failWrite = (key) => key === keys.recipes;
  await act(async () => {
    context.updateFood('food-1', { ...context.foods[0], image: 'file:///document/new.jpg' });
    context.updateRecipe('recipe-user', { ...context.recipes[0], image: 'file:///document/new.jpg' });
  });
  assert.ok(files.has('file:///document/old.jpg'));
  assert.ok(files.has('file:///document/recipe-old.jpg'));
  failWrite = () => false;
  await act(async () => context.retrySave());
  assert.equal(files.has('file:///document/old.jpg'), false);
  assert.equal(files.has('file:///document/recipe-old.jpg'), false);
  assert.ok(files.has('file:///document/new.jpg'));
});

test('photo cleanup protects references from recipes, learned products and retained restore originals', async (t) => {
  await reset();
  store.set(keys.recipes, JSON.stringify([recipe({ image: 'file:///document/old.jpg' })]));
  store.set(keys.learnedProducts, JSON.stringify({ '4901234567887': product(undefined, 'file:///document/old.jpg') }));
  await mount(t);
  await act(async () => context.deleteFood('food-1'));
  assert.ok(files.has('file:///document/old.jpg'));
  await act(async () => context.deleteRecipe('recipe-user'));
  assert.ok(files.has('file:///document/old.jpg'));
  await storage.saveStoredValue(keys.learnedProducts, {});
  // Retain a referenced photo in the original generation of this restore.
  await act(async () => context.addFood({ ...food(), id: undefined }));
  await act(async () => context.restoreAppData(payload()));
  await act(async () => context.deleteFood('restored'));
  assert.ok(files.has('file:///document/old.jpg'));
});

test('photo deletion errors do not turn a durable save into failure and are retried', async (t) => {
  await reset(); await mount(t); failDelete = true;
  await act(async () => context.deleteFood('food-1'));
  assert.equal(context.saveError, null);
  assert.ok(files.has('file:///document/old.jpg'));
  failDelete = false;
  await act(async () => context.retrySave());
  assert.equal(files.has('file:///document/old.jpg'), false);
});

test('ordinary pending writes finish before restore; UI mutations are locked and old effects cannot overwrite it', async (t) => {
  await reset(); await mount(t);
  const stopped = deferred(); const resume = deferred();
  beforeWrite = async (key) => { if (key === keys.foods) { stopped.resolve(); await resume.promise; } };
  await act(async () => { context.updateFood('food-1', { ...context.foods[0], memo: 'before restore' }); });
  await stopped.promise;
  let restoring;
  await act(async () => { restoring = context.restoreAppData(payload()); });
  assert.equal(context.isRestoring, true);
  assert.throws(() => context.deleteFood('food-1'), /準備中/);
  beforeWrite = async () => {}; resume.resolve();
  await act(async () => { await restoring; });
  assert.equal(context.isRestoring, false);
  assert.equal(context.foods[0].id, 'restored');
  assert.equal((await diskSnapshot())[keys.foods][0].id, 'restored');
});

test('learned product read-modify-write is serialized and cannot cross a restore', async () => {
  await reset();
  await Promise.all([saveLearnedProduct(product('4901234567887')), saveLearnedProduct(product('12345678'))]);
  assert.equal(Object.keys(await storage.loadStoredValue(keys.learnedProducts)).length, 2);
  const stopped = deferred(); const resume = deferred();
  beforeWrite = async (key) => { if (key.endsWith('/original')) { stopped.resolve(); await resume.promise; } };
  const pending = restoreBackup(payload()); await stopped.promise;
  await assert.rejects(saveLearnedProduct(product()), /復元中/);
  resume.resolve(); await pending;
  assert.deepEqual(await storage.loadStoredValue(keys.learnedProducts), {});
});

test('recovery exports corrupt raw JSON unchanged and restores from the error screen without initialization', async (t) => {
  await reset(); store.set(keys.shopping, '{broken');
  const renderer = await mount(t, React.createElement(DataRecoveryPanel));
  assert.equal(context.isReady, false); assert.equal(writes.length, 0);
  await shareRecoveryData();
  const exported = JSON.parse(files.get(sharedUri).toString());
  assert.equal(exported.raw[keys.shopping], '{broken');
  files.set('file:///backup.json', Buffer.from(JSON.stringify(payload())));
  const choose = () => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === 'バックアップから復元'));
  await act(async () => choose().props.onPress());
  await act(async () => alerts.at(-1)[2].find((button) => button.text === 'キャンセル').onPress());
  assert.equal(writes.length, 0);
  await act(async () => choose().props.onPress());
  await act(async () => { alerts.at(-1)[2].find((button) => button.text === '復元する').onPress(); await new Promise(setImmediate); });
  assert.equal(context.isReady, true);
  assert.equal(context.foods[0].id, 'restored');
  const archive = [...store.keys()].find((key) => key.endsWith('/original'));
  assert.equal(JSON.parse(store.get(archive))[keys.shopping], '{broken');
  assert.equal(store.get(keys.shopping), '{broken');
});

test('phase 4 saves only changed collections and keeps food subscribers quiet for shopping changes', async (t) => {
  await reset(); let renders = 0; let foodContext;
  function FoodConsumer() { foodContext = useFoodData(); renders++; return null; }
  await mount(t, React.createElement(FoodConsumer));
  const before = renders; writes.length = 0; notificationSyncs.length = 0;
  await act(async () => {
    assert.equal(foodContext.addShoppingItem('たまご'), false);
    assert.equal(foodContext.addShoppingItem('にんじん'), true);
    assert.equal(foodContext.addShoppingItem('人参'), false);
  });
  assert.deepEqual(writes, [keys.shopping]);
  assert.equal(renders, before);
  assert.equal(notificationSyncs.length, 0);
  writes.length = 0;
  await act(async () => context.updateFood('food-1', { ...context.foods[0], quantity: 80 }));
  assert.deepEqual(writes, [keys.foods]);
  assert.equal(notificationSyncs.length, 0, 'quantity alone must not reschedule expiry alerts');
  await act(async () => context.updateFood('food-1', { ...context.foods[0], expiryDate: '2026-11-01' }));
  assert.equal(notificationSyncs.length, 1);
});

test('phase 4 failed collection saves survive unrelated changes and retry without rewriting unchanged recipes', async (t) => {
  await reset(); await mount(t);
  failWrite = (key) => key === keys.foods;
  await act(async () => context.updateFood('food-1', { ...context.foods[0], quantity: 80 }));
  assert.ok(context.saveError);
  writes.length = 0;
  await act(async () => context.addShoppingItem('塩'));
  assert.ok(context.saveError);
  assert.ok(!writes.includes(keys.recipes));
  assert.ok(!writes.includes(keys.notifications));
  failWrite = () => false; writes.length = 0;
  await act(async () => context.retrySave());
  assert.equal(context.saveError, null);
  assert.deepEqual(writes, [keys.foods]);
  assert.equal((await diskSnapshot())[keys.foods][0].quantity, 80);
});

test('phase 4 one purchase creates one food, preserves its link after edits/use/restore and in backups', async (t) => {
  await reset(); await mount(t);
  assert.throws(() => context.addFood(food(), 'shop-1'), /購入状態/);
  await act(async () => context.toggleShoppingItem('shop-1'));
  let added;
  await act(async () => {
    const submit = context.addFood;
    added = submit(food({ name: '卵', ingredientName: '卵', image: '', quantityUnit: 'piece' }), 'shop-1');
    assert.throws(() => submit(food(), 'shop-1'), /登録済み/);
  });
  assert.equal(context.foods.filter((item) => item.sourceShoppingItemId === 'shop-1').length, 1);
  await act(async () => context.toggleShoppingItem('shop-1'));
  assert.equal(context.shoppingItems[0].checked, true);
  await act(async () => context.updateFood(added.id, { ...added, name: '新しい表示名' }));
  await act(async () => context.markFoodUsed(added.id));
  assert.equal(context.foods.find((item) => item.id === added.id).sourceShoppingItemId, 'shop-1');
  const backup = JSON.parse((await prepareBackup(context)).contents);
  await act(async () => context.restoreAppData(backup));
  assert.throws(() => context.addFood(food(), 'shop-1'), /登録済み/);
  assert.equal((await diskSnapshot())[keys.foods].find((item) => item.id === added.id).sourceShoppingItemId, 'shop-1');
  await act(async () => context.deleteShoppingItem('shop-1'));
  assert.ok(context.foods.some((item) => item.id === added.id), 'deleting a shopping row must not delete its food');
});

test('phase 4 registration rejects stale purchase state and malformed duplicate purchase links', async (t) => {
  await reset(); await mount(t);
  await act(async () => context.toggleShoppingItem('shop-1'));
  const register = context.addFood;
  await act(async () => context.deleteShoppingItem('shop-1'));
  assert.throws(() => register(food(), 'shop-1'), /購入状態/);
  const invalid = payload();
  invalid.data.foods[0].sourceShoppingItemId = 'same';
  invalid.data.foods.push({ ...invalid.data.foods[0], id: 'second' });
  assert.throws(() => validatePayload(invalid), /同じ購入分/);
  invalid.data.foods.pop(); invalid.data.foods[0].sourceShoppingItemId = 123;
  assert.throws(() => validatePayload(invalid));
});
