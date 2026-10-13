require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map(), files = new Map(), scheduled = new Map(), presented = new Map();
const writes = [], deletions = [], alerts = [];
const platform = { OS: 'ios' };
let failRemove = 0, removals = 0, failMarker = false, failSet = '', failPhoto = false, failNotification = false;
let afterRemoveFailure = false, holdWrite = null, releaseWrite, shared = 0, lastResponse = null;
class Directory {
  constructor(uri) { this.uri = typeof uri === 'string' ? uri : uri.uri; this.uri = this.uri.replace(/\/+$/, '') + '/'; }
  get exists() { return true; }
  list() { return [...files.keys()].filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes('/')).map((uri) => new File(uri)); }
}
class File {
  constructor(...parts) { this.uri = parts.map((value) => typeof value === 'string' ? value : value.uri).reduce((uri, part, index) => index === 0 ? part : uri.replace(/\/$/, '') + '/' + part.replace(/^\//, ''), ''); }
  get name() { return this.uri.split('/').at(-1); }
  get parentDirectory() { return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/') + 1)); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  async base64() { return files.get(this.uri).toString('base64'); }
  copy(target) { files.set(target.uri, files.get(this.uri)); }
  write(contents) { files.set(this.uri, Buffer.from(contents)); }
  delete() { if (failPhoto) throw new Error('photo busy'); deletions.push(this.uri); files.delete(this.uri); }
}
const paths = { get document() { return new Directory('file:///document/'); }, get cache() { return new Directory('file:///cache/'); } };
const adapter = {
  async getAllKeys() { return [...store.keys()]; },
  async getItem(key) { return store.get(key) ?? null; },
  async setItem(key, value) {
    if ((failMarker && key.endsWith('/erasure-pending')) || (failSet && key.endsWith(failSet))) throw new Error('disk full');
    if (holdWrite === key) { holdWrite = null; await new Promise((resolve) => { releaseWrite = resolve; }); }
    writes.push({ key, value }); store.set(key, value);
  },
  async removeItem(key) {
    if (++removals === failRemove) {
      if (afterRemoveFailure) store.delete(key);
      throw new Error('remove failed');
    }
    store.delete(key);
  },
};
const notifications = {
  IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  async setNotificationChannelAsync() {},
  async getPermissionsAsync() { return { granted: true, status: 'granted' }; },
  async getAllScheduledNotificationsAsync() { return [...scheduled.values()]; },
  async getPresentedNotificationsAsync() { return [...presented.values()]; },
  async cancelScheduledNotificationAsync(id) { if (failNotification) throw new Error('OS cancellation failed'); scheduled.delete(id); },
  async dismissNotificationAsync(id) { if (failNotification) throw new Error('OS dismissal failed'); presented.delete(id); },
  getLastNotificationResponse() { return lastResponse; },
  clearLastNotificationResponse() { lastResponse = null; },
  async scheduleNotificationAsync(value) { const id = 'new-' + scheduled.size; scheduled.set(id, { ...value, identifier: id }); return id; },
};
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === '@react-native-async-storage/async-storage') return adapter;
  if (request === 'expo-file-system') return { Directory, File, Paths: paths };
  if (request === 'expo-notifications') return notifications;
  if (request === 'expo-constants') return { __esModule: true, default: { expoVersion: null, manifest2: null } };
  if (request === 'expo-document-picker') return {};
  if (request === 'expo-sharing') return { isAvailableAsync: async () => true, shareAsync: async () => { shared++; } };
  if (request === 'react-native') return {
    Platform: platform, AppState: { addEventListener: () => ({ remove() {} }) },
    Image: { resolveAssetSource: () => ({ uri: 'bundled' }) }, StyleSheet: { create: (value) => value },
    Alert: { alert: (...args) => alerts.push(args) }, ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', TextInput: 'TextInput', Text: 'Text', View: 'View', Pressable: 'Pressable',
  };
  if (request.endsWith('/PrimaryButton')) return { PrimaryButton: (props) => React.createElement('PrimaryButton', props) };
  return load.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const storage = require('../src/services/storage.ts');
const { storageKeys: keys, generationKey, erasureKey, snapshotKeys } = storage;
const { eraseAppStoredData } = require('../src/services/dataErasureService.ts');
const { clearNotificationsForErasure, getNotificationStatusSummary } = require('../src/services/notificationService.ts');
const { prepareBackup, sharePreparedBackup } = require('../src/services/backupService.ts');
const { AppDataProvider, useAppData } = require('../src/context/AppDataContext.tsx');
const { EraseDataControl } = require('../src/components/EraseDataControl.tsx');
const { DataErasurePanel } = require('../src/components/DataErasurePanel.tsx');
const { createInitialData } = require('../src/data/initialData.ts');
let context;
function Consumer() { context = useAppData(); return null; }
const food = { id: 'private-food', name: '牛乳', productName: null, ingredientName: '牛乳', tags: [],
  category: 'dairy', storage: 'refrigerated', quantity: 100, quantityUnit: 'ml', image: 'file:///document/legacy-photo.jpg',
  memo: 'PRIVATE memo', status: 'active', usedAt: null, disposedAt: null, createdAt: '2026-09-01T00:00:00.000Z', purchaseDate: '2026-09-01', expiryDate: '2099-01-01' };
const snapshot = () => ({ ...createInitialData(false), foods: [food], recipes: [{ ...createInitialData(false).recipes[0], id: 'private-recipe', name: '自作', isFavorite: true }],
  shoppingItems: [{ id: 'private-shopping', name: 'PRIVATE買い物', checked: false, createdAt: '2026-09-01' }] });
const request = (id, kind, extra = {}) => ({ identifier: id, content: { data: { kind, ...extra } } });
async function reset() {
  await getNotificationStatusSummary().catch(() => undefined);
  store.clear(); files.clear(); scheduled.clear(); presented.clear(); writes.length = 0; deletions.length = 0; alerts.length = 0;
  failRemove = 0; removals = 0; failMarker = false; failSet = ''; failPhoto = false; failNotification = false; afterRemoveFailure = false; holdWrite = null; shared = 0; lastResponse = null;
  platform.OS = 'ios'; process.env.EXPO_PUBLIC_DEMO_DATA = 'true';
  await storage.hasPendingDataErasure();
  const data = snapshot();
  for (const [key, value] of [[keys.foods, data.foods], [keys.recipes, data.recipes], [keys.shopping, data.shoppingItems], [keys.notifications, data.notificationSettings], [keys.learnedProducts, { code: { name: 'PRIVATE候補', image: 'file:///document/catalog-photo.jpg' } }]]) store.set(key, JSON.stringify(value));
  store.set(keys.learnedProducts, '{}'); // Provider requires a valid catalog; legacy originals below may be corrupt.
  store.set('@food-manager/generation/old/original', JSON.stringify({ [keys.foods]: JSON.stringify([{ ...food, image: 'file:///document/archived-photo.jpg' }]) }));
  store.set('@food-manager/generation/abandoned/foods', '{broken PRIVATE');
  store.set(keys.swipeGuideSeen, 'true'); store.set('unrelated-app/key', 'PRESERVE');
  for (const uri of ['file:///document/legacy-photo.jpg', 'file:///document/archived-photo.jpg', 'file:///document/food-orphan.jpg', 'file:///document/catalog-photo.jpg', 'file:///document/restored-food-orphan.jpg', 'file:///cache/tabedoki-backup-2026.json', 'file:///cache/tabedoki-recovery-123.json', 'file:///document/foreign.pdf', 'file:///document/nested/food-foreign.jpg', 'file:///cache/SDK/photo.jpg', 'file:///outside/food-original.jpg']) files.set(uri, Buffer.from(uri));
  scheduled.set('expiry', request('expiry', 'tabedoki-expiry-v2')); scheduled.set('test', request('test', 'tabedoki-test'));
  scheduled.set('legacy-index', request('legacy-index', 'old-unknown-kind')); store.set(keys.notificationIds, JSON.stringify({ old: ['legacy-index'] }));
  scheduled.set('external', request('external', 'other'));
  presented.set('tray', { request: request('tray', 'tabedoki-expiry-v2') }); presented.set('external-tray', { request: request('external-tray', 'other') });
  lastResponse = { notification: presented.get('tray') };
  await storage.loadStoredValues(snapshotKeys);
}
async function mount(t, extra) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), extra)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}

test('erasure removes all current, archived, corrupt and orphaned app data, owned photos and notifications; other data remains', async () => {
  await reset();
  const empty = await eraseAppStoredData();
  assert.deepEqual(empty.foods, []); assert.deepEqual(empty.shoppingItems, []); assert.equal(empty.notificationSettings.enabled, false);
  assert.ok(empty.recipes.every((recipe) => !recipe.isFavorite)); assert.equal(await storage.hasPendingDataErasure(), false);
  assert.equal(store.get('unrelated-app/key'), 'PRESERVE');
  assert.ok([...store.keys()].filter((key) => key.startsWith('@food-manager/')).every((key) => key === generationKey || key.startsWith('@food-manager/generation/cleared-')));
  assert.ok(![...store.values()].join('').includes('PRIVATE'));
  assert.deepEqual([...files.keys()].sort(), ['file:///document/foreign.pdf', 'file:///document/nested/food-foreign.jpg', 'file:///cache/SDK/photo.jpg', 'file:///outside/food-original.jpg'].sort());
  assert.deepEqual([...scheduled.keys()], ['external']); assert.deepEqual([...presented.keys()], ['external-tray']); assert.equal(lastResponse, null);
  const values = await storage.loadStoredValues(snapshotKeys); assert.deepEqual(values[0], []); assert.deepEqual(values[4], {});
});

test('a failed intent write changes neither records, photos nor notifications and does not claim completion', async () => {
  await reset(); const before = new Map(store), originalFiles = new Map(files), originalNotifications = new Map(scheduled);
  failMarker = true;
  await assert.rejects(eraseAppStoredData(), /disk full/);
  assert.deepEqual(store, before); assert.deepEqual(files, originalFiles); assert.deepEqual(scheduled, originalNotifications);
  assert.equal(await storage.hasPendingDataErasure(), false);
});

test('notification or photo failures preserve the durable intent; writes and restore remain blocked until retry', async () => {
  for (const failure of ['notifications', 'photos']) {
    await reset(); failNotification = failure === 'notifications'; failPhoto = failure === 'photos';
    await assert.rejects(eraseAppStoredData());
    assert.equal(await storage.hasPendingDataErasure(), true);
    await assert.rejects(storage.loadStoredValues(snapshotKeys), storage.DataErasurePendingError);
    await assert.rejects(storage.saveStoredValue(keys.foods, [food]), storage.DataErasurePendingError);
    await assert.rejects(storage.commitRestoredValues(async () => ({})), storage.DataErasurePendingError);
    assert.ok(store.has(keys.foods), 'records are retained until file and notification cleanup succeeds');
    failNotification = false; failPhoto = false; await eraseAppStoredData();
    assert.equal(await storage.hasPendingDataErasure(), false); assert.deepEqual((await storage.loadStoredValues(snapshotKeys))[0], []);
  }
});

test('a partial key deletion is not loaded as initial sample data; restart shows recovery and explicit retry completes', async (t) => {
  await reset(); failRemove = 3;
  await assert.rejects(eraseAppStoredData(), /remove failed/);
  assert.ok(store.has(erasureKey));
  const storagePath = require.resolve('../src/services/storage.ts');
  const originalModule = require.cache[storagePath];
  delete require.cache[storagePath];
  try {
    const coldStorage = require(storagePath);
    await assert.rejects(coldStorage.loadStoredValues(snapshotKeys), coldStorage.DataErasurePendingError);
  } finally { require.cache[storagePath] = originalModule; }
  const renderer = await mount(t, React.createElement(DataErasurePanel));
  assert.equal(context.isReady, false); assert.equal(context.erasurePending, true);
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '削除が完了していません'));
  failRemove = 0;
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.isReady, true); assert.deepEqual(context.foods, []); assert.deepEqual(context.shoppingItems, []);
  assert.equal(context.notificationSettings.enabled, false); assert.equal(context.erasurePending, false);
});

test('failure writing empty defaults or committing the head can retry without retained private records', async () => {
  for (const suffix of ['/recipes', '/active-generation']) {
    await reset(); failSet = suffix;
    await assert.rejects(eraseAppStoredData(), /disk full/);
    assert.ok(store.has(erasureKey)); assert.ok(![...store.values()].join('').includes('PRIVATE'));
    failSet = ''; await eraseAppStoredData();
    assert.equal(await storage.hasPendingDataErasure(), false);
  }
});

test('an adapter that throws after removing the completion marker is confirmed by readback', async () => {
  await reset();
  failRemove = [...store.keys()].filter((key) => key.startsWith('@food-manager/')).length + 1;
  afterRemoveFailure = true;
  await eraseAppStoredData();
  assert.equal(await storage.hasPendingDataErasure(), false);
  assert.deepEqual((await storage.loadStoredValues(snapshotKeys))[0], []);
});

test('queued old writes, old editing callbacks and prepared private backup exports cannot resurrect data', async (t) => {
  await reset();
  const renderer = await mount(t);
  const staleAdd = context.addFood;
  const staleRestore = context.restoreAppData;
  const prepared = await prepareBackup(snapshot());
  holdWrite = keys.swipeGuideSeen;
  const oldWrite = storage.saveStoredValue(keys.swipeGuideSeen, true);
  await new Promise((resolve) => setImmediate(resolve));
  const queued = storage.saveStoredValue(keys.foods, [food]);
  const queuedRejected = assert.rejects(queued);
  let erasing;
  await act(async () => { erasing = context.eraseAppData(); });
  await act(async () => { releaseWrite(); await oldWrite; await erasing; });
  await queuedRejected;
  assert.throws(() => staleAdd(food), /復元前|準備中/);
  await assert.rejects(staleRestore({}), /変更/);
  await assert.rejects(sharePreparedBackup(prepared), /変更/); assert.equal(shared, 0);
  assert.deepEqual(context.foods, []); assert.deepEqual((await storage.loadStoredValues(snapshotKeys))[0], []);
});

test('a different browser generation cannot receive stale writes until a complete reload', async () => {
  await reset();
  const fresh = 'cleared-other-tab';
  for (const key of snapshotKeys) store.set(`@food-manager/generation/${fresh}/${key.split('/').at(-1)}`, JSON.stringify(key === keys.learnedProducts ? {} : key === keys.notifications ? createInitialData(false).notificationSettings : []));
  store.set(generationKey, JSON.stringify({ version: 1, id: fresh }));
  await assert.rejects(storage.saveStoredValue(keys.foods, [food]), storage.RestoreNeedsReloadError);
  await assert.rejects(storage.loadStoredValue(keys.learnedProducts), storage.RestoreNeedsReloadError);
  assert.equal(store.get(`@food-manager/generation/${fresh}/foods`), '[]');
  await storage.loadStoredValues(snapshotKeys);
  await storage.saveStoredValue(keys.foods, []);
});

test('opening or cancelling the deletion explanation performs no removal; typed confirmation and double taps execute once', async (t) => {
  await reset();
  const renderer = await mount(t, React.createElement(EraseDataControl));
  const button = (name) => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === name);
  const before = new Map(store);
  await act(async () => button('削除する内容を確認').props.onPress());
  assert.equal(button('この端末の保存データを削除する').props.disabled, true);
  await act(async () => button('削除をやめる').props.onPress());
  assert.equal(removals, 0); assert.equal(deletions.length, 0); assert.deepEqual(store, before);
  await act(async () => button('削除する内容を確認').props.onPress());
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('削除'));
  const execute = button('この端末の保存データを削除する').props.onPress;
  await act(async () => { execute(); execute(); });
  assert.deepEqual(context.foods, []); assert.equal(alerts.filter(([title]) => title === '保存データを削除しました').length, 1);
});

test('Web erasure touches the current site storage and performs no native file or notification operations', async () => {
  await reset(); platform.OS = 'web';
  const originalFiles = new Map(files), originalNotifications = new Map(scheduled);
  await eraseAppStoredData();
  assert.deepEqual(files, originalFiles); assert.deepEqual(scheduled, originalNotifications);
  assert.equal(store.get('unrelated-app/key'), 'PRESERVE'); assert.deepEqual((await storage.loadStoredValues(snapshotKeys))[0], []);
});
