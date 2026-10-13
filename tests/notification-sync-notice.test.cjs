require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { StyleSheet: { create: (styles) => styles }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
  return original.call(this, request, ...args);
};
const { NotificationSyncNotice } = require('../src/components/NotificationSyncNotice.tsx');

test('closing the notice leaves the same ongoing error dismissed across retries and brings back a new error', async () => {
  const error = '予約が一致しません'; let renderer;
  await act(async () => { renderer = create(React.createElement(NotificationSyncNotice, { error })); });
  assert.ok(renderer.root.findByProps({ accessibilityRole: 'alert' }));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知の案内を閉じる' }).props.onPress());
  assert.equal(renderer.toJSON(), null);
  await act(async () => renderer.update(React.createElement(NotificationSyncNotice, { error })));
  assert.equal(renderer.toJSON(), null);
  await act(async () => renderer.update(React.createElement(NotificationSyncNotice, { error: '許可されていません' })));
  assert.ok(renderer.root.findByProps({ accessibilityRole: 'alert' }));
  await act(async () => renderer.root.findByType('Pressable').props.onPress());
  await act(async () => renderer.update(React.createElement(NotificationSyncNotice, { error: null })));
  assert.equal(renderer.toJSON(), null);
  await act(async () => renderer.update(React.createElement(NotificationSyncNotice, { error: '許可されていません' })));
  assert.ok(renderer.root.findByProps({ accessibilityRole: 'alert' }));
  await act(async () => renderer.unmount());
});
