require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const Module = require('node:module');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'ios' };
const alerts = [];
let update = async () => {}, permission = true, statusFailure = false, pickerFailure = false, permissionFailure = false;
let pickerAsset = { uri: 'picked.jpg', width: 1000, height: 1000, fileSize: 100 };
const data = { foods: [], recipes: [], shoppingItems: [], notificationSettings: { enabled: false, daysBeforeList: [0], time: '18:00' },
  notificationSyncError: null, isNotificationSyncing: false, resyncNotifications: async () => {},
  updateNotificationSettings: (...args) => update(...args), restoreAppData: async () => {} };
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Platform: platform, StyleSheet: { create: (value) => value },
    Text: 'Text', View: 'View', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', TextInput: 'TextInput' };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === '@react-navigation/native') return { useFocusEffect: (callback) => React.useEffect(callback, [callback]) };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => (...args) => alerts.push(args) };
  if (request.endsWith('/services/notificationService')) return {
    ensureNotificationPermission: async () => permission,
    scheduleTestNotification: async () => {},
    getNotificationStatusSummary: async () => { if (statusFailure) throw Error('unavailable'); return { permission: platform.OS === 'web' ? 'unsupported' : 'granted', scheduledCount: 2 }; },
  };
  if (request.endsWith('/services/backupService')) return {};
  if (request.startsWith('../components/')) { const name = request.split('/').at(-1); return { [name]: (props) => React.createElement(name, props) }; }
  if (request === 'expo-image-picker') return {
    requestCameraPermissionsAsync: async () => { if (permissionFailure) throw Error('camera failed'); return { granted: permission }; },
    requestMediaLibraryPermissionsAsync: async () => ({ granted: permission }),
    launchCameraAsync: async () => { if (pickerFailure) throw Error('picker failed'); return { canceled: false, assets: [pickerAsset] }; },
    launchImageLibraryAsync: async () => ({ canceled: false, assets: [pickerAsset] }),
  };
  return original.call(this, request, ...args);
};
const { SettingsScreen } = require('../src/screens/SettingsScreen.tsx');
const { FoodImage } = require('../src/components/FoodImage.tsx');
const { FoodImagePicker } = require('../src/components/FoodImagePicker.tsx');
const flush = () => new Promise(setImmediate);
const reset = () => { alerts.length = 0; platform.OS = 'ios'; permission = true; statusFailure = false; pickerFailure = false; permissionFailure = false; update = async () => {}; };
test('settings waits for persistence and notification sync; double taps cannot submit twice', async () => {
  reset(); let resolve, calls = 0; update = () => { calls++; return new Promise((r) => { resolve = r; }); };
  let renderer; await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  const save = renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '通知設定を保存').props.onPress;
  await act(async () => { save(); save(); await flush(); });
  assert.equal(calls, 1); assert.equal(alerts.length, 0);
  assert.ok(renderer.root.findAllByType('PrimaryButton').some((node) => node.props.label === '保存・同期中...' && node.props.disabled));
  await act(async () => { resolve(); await flush(); });
  assert.equal(alerts.at(-1)[0], '保存しました');
  await act(async () => renderer.unmount());
});
test('failed notification update reports incomplete, while status-query failure exits loading state', async () => {
  reset(); statusFailure = true; update = async () => { throw Error('OS refused'); };
  const warn = console.warn; console.warn = () => {};
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
    assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('状態を取得できませんでした')));
    await act(async () => { renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '通知設定を保存').props.onPress(); await flush(); });
    assert.equal(alerts.at(-1)[0], '通知設定の反映が完了していません');
    assert.equal(alerts.some(([title]) => title === '保存しました'), false);
    await act(async () => renderer.unmount());
  } finally { console.warn = warn; }
});
test('Web explicitly disables notification saving and tests', async () => {
  reset(); platform.OS = 'web'; let renderer;
  await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  for (const label of ['通知設定を保存', '3秒後にテスト通知']) assert.equal(renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === label).props.disabled, true);
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === 'Web版は通知非対応'));
  await act(async () => renderer.unmount());
});
test('image errors display a local placeholder and changing the URI retries the image', async () => {
  reset(); let renderer;
  await act(async () => { renderer = create(React.createElement(FoodImage, { source: { uri: 'missing.jpg' } })); });
  await act(async () => renderer.root.findByType('Image').props.onError({}));
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '写真を表示できません' }));
  await act(async () => renderer.update(React.createElement(FoodImage, { source: { uri: 'another.jpg' } })));
  assert.equal(renderer.root.findByType('Image').props.source.uri, 'another.jpg');
  await act(async () => renderer.unmount());
});
test('photo permission rejection, API failures and oversized assets preserve the original image and allow retry', async () => {
  reset(); let renderer; const selected = [];
  await act(async () => { renderer = create(React.createElement(FoodImagePicker, { image: 'original.jpg', onChange: (uri) => selected.push(uri) })); });
  const pick = async () => {
    await act(async () => renderer.root.findByType('Pressable').props.onPress());
    await act(async () => { alerts.at(-1)[2].find((button) => button.text === '写真を撮る').onPress(); await flush(); });
  };
  permission = false; await pick(); assert.equal(alerts.at(-1)[0], '写真へのアクセスが必要です');
  permission = true; permissionFailure = true; await pick(); assert.equal(alerts.at(-1)[0], '写真を選択できませんでした');
  permissionFailure = false; pickerFailure = true; await pick(); assert.equal(selected.length, 0);
  pickerFailure = false; pickerAsset.fileSize = 6 * 1024 * 1024; await pick(); assert.match(alerts.at(-1)[1], /5MB/);
  pickerAsset.fileSize = 100; await pick(); assert.deepEqual(selected, ['picked.jpg']);
  await act(async () => renderer.unmount());
});
