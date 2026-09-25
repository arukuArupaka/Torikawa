require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const calls = [];
const notifications = {
  addNotificationResponseReceivedListener() {
    calls.push('subscribe');
    return { remove: () => calls.push('remove') };
  },
  async getLastNotificationResponseAsync() { calls.push('lastResponse'); return null; },
};
const data = { foods: [], isReady: true };
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Platform: platform };
  if (request === 'expo-notifications') return notifications;
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/navigation/navigationRef')) return { navigationRef: { isReady: () => true } };
  return originalLoad.call(this, request, ...args);
};
const { NotificationNavigationHandler } = require('../src/components/NotificationNavigationHandler.tsx');

test('Web skips unsupported notification response APIs; native keeps subscription and cleanup', async () => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(NotificationNavigationHandler, { navigationReady: true })); });
  assert.deepEqual(calls, []);
  await act(async () => renderer.unmount());
  platform.OS = 'ios';
  await act(async () => { renderer = create(React.createElement(NotificationNavigationHandler, { navigationReady: true })); });
  assert.deepEqual(calls, ['subscribe', 'lastResponse']);
  await act(async () => renderer.unmount());
  assert.deepEqual(calls, ['subscribe', 'lastResponse', 'remove']);
});
