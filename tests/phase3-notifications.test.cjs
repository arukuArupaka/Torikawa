require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const os = new Map();
let ids = {}, count = 0, failSchedule = 0, failCancel = false, failSave = false, acceptedThenFailed = false;
let permission = { granted: true, status: 'granted' };
const constants = { expoVersion: null, manifest2: null };
let staleLists = [], rejectedWithoutError = false;
let presented = [], lastResponse = null;
const platform = { OS: 'ios' };
const calls = [];
const api = {
  IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler() { calls.push('handler'); },
  async setNotificationChannelAsync() { calls.push('channel'); },
  async getPermissionsAsync() { calls.push('permission'); return permission; },
  async requestPermissionsAsync() { return permission; },
  async getAllScheduledNotificationsAsync() { calls.push('list'); return structuredClone(staleLists.length ? staleLists.shift() : [...os.values()]); },
  async cancelScheduledNotificationAsync(id) {
    if (failCancel) throw Error('cancel failed');
    // Expo Go prefixes cancellation with the current scope, even when listing other scopes.
    if (constants.expoVersion && os.get(id)?.content.data.scopeKey !== constants.manifest2.extra.scopeKey) return;
    os.delete(id);
  },
  async getPresentedNotificationsAsync() { return presented; },
  async dismissNotificationAsync(id) { presented = presented.filter((item) => item.request.identifier !== id); },
  getLastNotificationResponse() { return lastResponse; },
  clearLastNotificationResponse() { lastResponse = null; },
  async scheduleNotificationAsync(request) {
    count++; if (count === failSchedule) throw Error('schedule failed');
    const id = `id-${count}`;
    if (constants.expoVersion) request.content.data.scopeKey = constants.manifest2.extra.scopeKey;
    if (!rejectedWithoutError) os.set(id, { ...structuredClone(request), identifier: id });
    if (acceptedThenFailed) { acceptedThenFailed = false; throw Error('response lost'); }
    return id;
  },
};
Module._load = function(request, ...args) {
  if (request === 'expo-notifications') return api;
  if (request === 'expo-constants') return { __esModule: true, default: constants };
  if (request === 'react-native') return { Platform: platform };
  if (request === './storage') return { isDataErasing: () => false, storageKeys: { notificationIds: 'ids' }, loadStoredValue: async () => ids,
    saveStoredValue: async (_key, value) => { if (failSave && os.size) throw Error('disk full'); ids = structuredClone(value); } };
  return original.call(this, request, ...args);
};
const service = require('../src/services/notificationService.ts');
const food = (id = 'milk', extra = {}) => ({ id, name: '牛乳', productName: null, expiryDate: '2099-01-10', status: 'active', ...extra });
const settings = { enabled: true, daysBeforeList: [0, 3], time: '18:00' };
async function reset() {
  await service.getNotificationStatusSummary();
  os.clear(); ids = {}; count = 0; failSchedule = 0; failCancel = false; failSave = false; acceptedThenFailed = false;
  platform.OS = 'ios'; permission = { granted: true, status: 'granted' }; calls.length = 0;
  constants.expoVersion = null; constants.manifest2 = null; staleLists = []; rejectedWithoutError = false;
  presented = []; lastResponse = null;
}
test('a failure at the second reminder retains the first ID and repair creates only the missing reminder', async () => {
  await reset(); failSchedule = 2;
  await assert.rejects(service.queueNotificationSync([food()], settings), /schedule failed/);
  assert.equal(os.size, 1); assert.equal(ids.milk.length, 1);
  failSchedule = 0;
  await service.queueNotificationSync([food()], settings);
  assert.equal(os.size, 2); assert.equal(ids.milk.length, 2);
  const before = [...os.keys()]; await service.queueNotificationSync([food()], settings);
  assert.deepEqual([...os.keys()], before);
});
test('lost schedule replies or failed index writes are recovered from OS metadata without duplicate notifications', async () => {
  for (const failure of ['reply', 'index']) {
    await reset(); acceptedThenFailed = failure === 'reply'; failSave = failure === 'index';
    await assert.rejects(service.queueNotificationSync([food()], settings));
    assert.equal(os.size, 1);
    failSave = false; await service.queueNotificationSync([food()], settings);
    assert.equal(os.size, 2); assert.equal(new Set(ids.milk).size, 2);
  }
});
test('failed cancellation remains tracked; OFF retry removes managed notifications while keeping tests and unrelated reservations', async () => {
  await reset(); await service.queueNotificationSync([food()], settings);
  os.set('external', { identifier: 'external', content: { data: { kind: 'other' } } });
  await service.scheduleTestNotification(food());
  failCancel = true;
  await assert.rejects(service.queueNotificationSync([], { ...settings, enabled: false }), /解除できない/);
  assert.equal(ids.milk.length, 2);
  failCancel = false;
  await service.queueNotificationSync([], { ...settings, enabled: false });
  assert.equal(os.size, 2); assert.deepEqual(ids, {});
  assert.equal((await service.getNotificationStatusSummary()).scheduledCount, 0);
});
test('edits, used/disposed/deleted stock, undo and settings replacement reconcile against current food state', async () => {
  await reset();
  await service.queueNotificationSync([food()], settings);
  await service.queueNotificationSync([food('milk', { name: '訂正後', expiryDate: '2099-02-10' })], settings);
  assert.ok([...os.values()].every((item) => item.content.title.includes('訂正後')));
  for (const status of ['used', 'disposed']) {
    await service.queueNotificationSync([food('milk', { status })], settings); assert.equal(os.size, 0);
    await service.queueNotificationSync([food()], settings); assert.equal(os.size, 2);
  }
  await service.queueNotificationSync([], settings); assert.equal(os.size, 0);
  await service.queueNotificationSync([food('restored')], { ...settings, daysBeforeList: [0], time: '09:30' });
  assert.equal(os.size, 1); assert.ok(ids.restored);
  assert.equal([...os.values()][0].trigger.date.getHours(), 9);
});
test('legacy unindexed reservations and duplicates are repaired, missing OS reservations are recreated', async () => {
  await reset();
  os.set('legacy', { identifier: 'legacy', content: { data: { foodId: 'milk', daysBefore: 3 } } });
  await service.queueNotificationSync([food()], settings);
  assert.equal(os.has('legacy'), false);
  const entry = [...os.values()][0]; os.set('duplicate', { ...entry, identifier: 'duplicate' });
  await service.queueNotificationSync([food()], settings); assert.equal(os.size, 2);
  os.delete([...os.keys()][0]);
  await service.queueNotificationSync([food()], settings); assert.equal(os.size, 2);
});
test('permission revocation clears old reservations, repermission rebuilds them, and provisional permission is accepted', async () => {
  await reset(); await service.queueNotificationSync([food()], settings);
  permission = { granted: false, status: 'denied' };
  await assert.rejects(service.queueNotificationSync([food()], settings), /許可/); assert.equal(os.size, 0);
  permission = { granted: false, status: 'undetermined', ios: { status: 3 } };
  await service.queueNotificationSync([food()], settings); assert.equal(os.size, 2);
});
test('Web performs no native notification calls and reports unsupported instead of loading forever', async () => {
  await reset(); platform.OS = 'web';
  service.initializeNotificationHandling();
  await service.queueNotificationSync([food()], settings);
  assert.equal(await service.ensureNotificationPermission(), false);
  assert.deepEqual(await service.getNotificationStatusSummary(), { permission: 'unsupported', scheduledCount: 0 });
  await assert.rejects(service.scheduleTestNotification(), /Web版/);
  assert.deepEqual(calls, []);
});
test('concurrent updates end in the newest plan and Android initializes its channel', async () => {
  await reset(); platform.OS = 'android';
  await Promise.all([service.queueNotificationSync([food()], settings), service.queueNotificationSync([food('latest')], { ...settings, daysBeforeList: [0] })]);
  assert.equal(os.size, 1); assert.ok(ids.latest); assert.ok(calls.includes('channel'));
});

test('Expo Go ignores old connections and other projects when syncing, counting and disabling reminders', async () => {
  await reset(); constants.expoVersion = '57'; constants.manifest2 = { extra: { scopeKey: 'current-project' } };
  const foreign = { identifier: 'old-id', content: { data: { kind: 'tabedoki-expiry-v2', foodId: 'old-food', scopeKey: 'old-connection' } } };
  os.set('old-id', foreign);
  // Even a stale local index must not claim a notification from another scope.
  ids = { 'old-food': ['old-id'] };
  await service.queueNotificationSync([food()], settings);
  assert.deepEqual(os.get('old-id'), foreign);
  assert.equal(os.size, 3);
  assert.equal((await service.getNotificationStatusSummary()).scheduledCount, 2);
  const currentIds = ids.milk.slice();
  await service.queueNotificationSync([food()], settings);
  assert.deepEqual(ids.milk, currentIds); assert.equal(count, 2);
  await service.queueNotificationSync([], { ...settings, enabled: false });
  assert.equal(os.size, 1); assert.deepEqual(os.get('old-id'), foreign);
  assert.equal((await service.getNotificationStatusSummary()).scheduledCount, 0);
});

test('a delayed OS pending list is rechecked without creating duplicate reminders', async () => {
  await reset(); staleLists = [[], [], []];
  await service.queueNotificationSync([food()], settings);
  assert.equal(os.size, 2); assert.equal(count, 2);
  await service.queueNotificationSync([], { ...settings, enabled: false });
  assert.equal(os.size, 0);
});

test('a permanent OS mismatch still fails and a later retry creates only missing reminders', async () => {
  await reset(); rejectedWithoutError = true;
  await assert.rejects(service.queueNotificationSync([food()], settings), /予定2件/);
  assert.equal(os.size, 0);
  rejectedWithoutError = false;
  await service.queueNotificationSync([food()], settings);
  assert.equal(os.size, 2); assert.equal(ids.milk.length, 2);
});

test('erasure in Expo Go removes current reminders and tests while preserving other scopes', async () => {
  await reset(); constants.expoVersion = '57'; constants.manifest2 = { extra: { scopeKey: 'current-project' } };
  const foreign = { identifier: 'foreign-test', content: { data: { kind: 'tabedoki-test', scopeKey: 'other-project' } } };
  os.set(foreign.identifier, foreign);
  presented = [{ request: foreign }]; lastResponse = { notification: { request: foreign } };
  await service.queueNotificationSync([food()], settings); await service.scheduleTestNotification();
  await service.clearNotificationsForErasure(JSON.stringify(ids));
  assert.deepEqual([...os.values()], [foreign]);
  assert.deepEqual(presented, [{ request: foreign }]);
  assert.deepEqual(lastResponse.notification.request, foreign);
});

test('missing Expo Go scope fails before changing reservations instead of acting on another project', async () => {
  await reset(); constants.expoVersion = '57'; constants.manifest2 = null;
  await assert.rejects(service.queueNotificationSync([food()], settings), /開き直して/);
  assert.equal(os.size, 0); assert.equal(count, 0); assert.deepEqual(calls, []);
  constants.expoVersion = null;
});
