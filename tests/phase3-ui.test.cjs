require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const Module = require('node:module');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'ios' };
const alerts = [];
const linkRequests = [];
let linkFailure = false;
let update = async () => {}, permission = true, statusFailure = false, pickerFailure = false, permissionFailure = false;
let pickerAsset = { uri: 'picked.jpg', width: 1000, height: 1000, fileSize: 100 };
let pickerOptions;
let resizedImage = { uri: 'file:///resized-photo.jpg', width: 800, height: 800, base64: 'YWJjZA==' }, resizeFailure = false;
const resizeRequests = [];
let notificationPlan = { plan: [], truncatedCount: 0 }, scheduledCount = 2;
let pickedBackup = null;
const backupRequests = [], sharedBackups = [];
const preparedBackup = { bytes: 1024, embeddedCount: 1, externalCount: 0, json: '{}' };
const data = { foods: [], recipes: [], shoppingItems: [], notificationSettings: { enabled: false, daysBeforeList: [0], time: '18:00' },
  notificationSyncError: null, isNotificationSyncing: false, resyncNotifications: async () => {},
  updateNotificationSettings: (...args) => update(...args), restoreAppData: async () => {} };
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Platform: platform, StyleSheet: { create: (value) => value },
    Text: 'Text', View: 'View', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', TextInput: 'TextInput',
    Linking: { openURL: async url => { linkRequests.push(url); if (linkFailure) throw Error('unavailable'); } } };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === '@react-navigation/native') return { useFocusEffect: (callback) => React.useEffect(callback, [callback]) };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => (...args) => alerts.push(args) };
  if (request.endsWith('/services/notificationService')) return {
    MAX_SCHEDULED_NOTIFICATIONS: 60,
    buildNotificationPlanSummary: (_foods, settings) => settings.enabled ? notificationPlan : { plan: [], truncatedCount: 0 },
    ensureNotificationPermission: async () => permission,
    scheduleTestNotification: async () => {},
    getNotificationStatusSummary: async () => { if (statusFailure) throw Error('unavailable'); return { permission: platform.OS === 'web' ? 'unsupported' : permission ? 'granted' : 'denied', scheduledCount }; },
  };
  if (request.endsWith('/services/backupService')) return {
    prepareBackup: async input => { backupRequests.push(input); return preparedBackup; },
    sharePreparedBackup: async prepared => { sharedBackups.push(prepared); },
    pickBackup: async () => pickedBackup,
  };
  if (request.endsWith('/services/imageResize')) return { resizeImage: async (source) => {
    resizeRequests.push(source);
    if (resizeFailure) throw Error('写真を縮小できませんでした。別の写真を選び直してください。');
    return resizedImage;
  } };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: props => React.createElement(name, props,
      props.header, props.expanded ? props.children : null) };
    return { [name]: (props) => React.createElement(name, props) };
  }
  if (request === 'expo-image-picker') return {
    requestCameraPermissionsAsync: async () => { if (permissionFailure) throw Error('camera failed'); return { granted: permission }; },
    requestMediaLibraryPermissionsAsync: async () => ({ granted: permission }),
    launchCameraAsync: async (options) => { pickerOptions = options; if (pickerFailure) throw Error('picker failed'); return { canceled: false, assets: [pickerAsset] }; },
    launchImageLibraryAsync: async (options) => { pickerOptions = options; return { canceled: false, assets: [pickerAsset] }; },
  };
  return original.call(this, request, ...args);
};
const { SettingsScreen } = require('../src/screens/SettingsScreen.tsx');
const { FoodImage } = require('../src/components/FoodImage.tsx');
const { FoodImagePicker } = require('../src/components/FoodImagePicker.tsx');
const flush = () => new Promise(setImmediate);
const toggleNotificationSettings = renderer => renderer.root.findByProps({ accessibilityLabel: '期限通知の設定' }).props.onPress();
const openNotificationSettings = async renderer => { await act(async () => toggleNotificationSettings(renderer)); };
const reset = () => { alerts.length = 0; platform.OS = 'ios'; permission = true; statusFailure = false; pickerFailure = false; permissionFailure = false; update = async () => {}; notificationPlan = { plan: [], truncatedCount: 0 }; scheduledCount = 2;
  linkRequests.length = 0; linkFailure = false;
  pickedBackup = null; backupRequests.length = 0; sharedBackups.length = 0;
  resizeFailure = false; resizeRequests.length = 0; resizedImage = { uri: 'file:///resized-photo.jpg', width: 800, height: 800, base64: 'YWJjZA==' }; };

test('Settings explains the capped saved plan only after successful sync, independent of unsaved settings', async () => {
  reset(); const previousSettings = data.notificationSettings;
  data.notificationSettings = { ...previousSettings, enabled: true };
  notificationPlan = { plan: Array.from({ length: 60 }), truncatedCount: 40 }; scheduledCount = 60;
  let renderer;
  const hasNotice = () => renderer.root.findAllByType('Text').some(node => [node.props.children].flat().join('').includes('直近60件のみ予約しています'));
  const render = async () => { await act(async () => renderer.update(React.createElement(SettingsScreen, { navigation: {} }))); };
  try {
    await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
    assert.equal(hasNotice(), true);
    await openNotificationSettings(renderer);
    await act(async () => renderer.root.findByType('Switch').props.onValueChange(false));
    assert.equal(hasNotice(), true, 'the explanation describes saved settings, not the unsaved switch');
    data.isNotificationSyncing = true; await render(); assert.equal(hasNotice(), false);
    data.isNotificationSyncing = false; data.notificationSyncError = '同期できません'; await render(); assert.equal(hasNotice(), false);
    data.notificationSyncError = null; await render(); assert.equal(hasNotice(), true);
    notificationPlan = { plan: Array.from({ length: 60 }), truncatedCount: 0 };
    await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知状態を更新' }).props.onPress());
    assert.equal(hasNotice(), false, 'exactly 60 without deferred reminders needs no truncation notice');
    notificationPlan = { plan: Array.from({ length: 60 }), truncatedCount: 40 }; scheduledCount = 59;
    await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知状態を更新' }).props.onPress());
    assert.equal(hasNotice(), false, 'a mismatching OS count must not be described as successfully capped');
    scheduledCount = 60; permission = false;
    await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知状態を更新' }).props.onPress());
    assert.equal(hasNotice(), false);
    data.notificationSettings = { ...previousSettings, enabled: false }; await render(); assert.equal(hasNotice(), false);
    data.notificationSettings = { ...previousSettings, enabled: true }; platform.OS = 'web'; await render(); assert.equal(hasNotice(), false);
  } finally {
    data.notificationSettings = previousSettings; data.notificationSyncError = null; data.isNotificationSyncing = false;
    if (renderer) await act(async () => renderer.unmount());
    reset();
  }
});
test('settings waits for persistence and notification sync; double taps cannot submit twice', async () => {
  reset(); let resolve, calls = 0; update = () => { calls++; return new Promise((r) => { resolve = r; }); };
  let renderer; await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  await openNotificationSettings(renderer);
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
    await openNotificationSettings(renderer);
    await act(async () => { renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '通知設定を保存').props.onPress(); await flush(); });
    assert.equal(alerts.at(-1)[0], '通知設定の反映が完了していません');
    assert.equal(alerts.some(([title]) => title === '保存しました'), false);
    await act(async () => renderer.unmount());
  } finally { console.warn = warn; }
});
test('Web replaces unsupported notification controls with a concise explanation', async () => {
  reset(); platform.OS = 'web'; let renderer;
  await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  for (const label of ['通知設定を保存', '3秒後にテスト通知']) assert.equal(renderer.root.findAllByType('PrimaryButton').some((node) => node.props.label === label), false);
  assert.equal(renderer.root.findAllByType('Switch').length, 0);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '通知時刻' }).length, 0);
  assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('Web版では期限通知を利用できません')));
  assert.equal(renderer.root.findByProps({ accessibilityLabel: 'バックアップを書き出す' }).props.accessibilityRole, 'button');
  await act(async () => renderer.unmount());
});

test('Settings keeps notification failure details and manual retry available after the home notice is dismissed', async () => {
  reset(); let renderer, retries = 0;
  const failure = '端末の通知予約が予定と一致しません';
  data.notificationSyncError = failure;
  data.resyncNotifications = async () => { retries++; throw Error(failure); };
  try {
    await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
    assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === failure));
    await openNotificationSettings(renderer);
    await act(async () => {
      renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '通知を再同期').props.onPress();
      await flush();
    });
    assert.equal(retries, 1); assert.equal(data.notificationSyncError, failure);
    assert.equal(alerts.at(-1)[0], '通知を再同期できませんでした');
  } finally {
    data.notificationSyncError = null; data.resyncNotifications = async () => {};
    if (renderer) await act(async () => renderer.unmount());
  }
});

test('Settings groups backup, records and app information before deletion and keeps all navigation targets', async t => {
  reset(); let renderer;
  const destinations = [];
  await act(async () => { renderer = create(React.createElement(SettingsScreen, {
    navigation: { navigate: (...args) => destinations.push(args) },
  })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const headings = renderer.root.findAllByType('Text').filter(node => node.props.accessibilityRole === 'header');
  assert.deepEqual(headings.map(node => node.props.children), ['使い方・お問い合わせ', '通知', '記録と買い物', 'データ管理', 'このアプリについて', 'データの削除']);
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '期限通知の設定' }).props.accessibilityState.expanded, false);
  assert.equal(renderer.root.findAllByType('Switch').length, 0);
  for (const label of ['食材ロス統計', '買い物リスト', '使い方', 'データの取り扱い', '外部サービス・ライセンス']) {
    const button = renderer.root.findByProps({ accessibilityLabel: label });
    assert.equal(button.props.accessibilityRole, 'button');
    await act(async () => button.props.onPress());
  }
  assert.deepEqual(destinations, [['Statistics'], ['ShoppingList'], ['UsageGuide'], ['AppInformation', { section: 'privacy' }], ['AppInformation', { section: 'services' }]]);
  const content = renderer.root.findAll(node => node.type === 'Text' || node.type === 'EraseDataControl');
  const lastHeading = content.findIndex(node => node.type === 'Text' && node.props.children === 'データの削除');
  assert.ok(content.findIndex(node => node.type === 'EraseDataControl') > lastHeading);
  assert.deepEqual(backupRequests, []); assert.deepEqual(sharedBackups, []);
});

test('Settings opens the configured support form directly on iOS and Web without navigating or appending data', async t => {
  const previous = process.env.EXPO_PUBLIC_SUPPORT_FORM_URL;
  t.after(() => { if (previous === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_FORM_URL; else process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = previous; });
  const url = 'https://example.com/contact?source=app&lang=ja';
  process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = url;
  for (const os of ['ios', 'web']) {
    reset(); platform.OS = os;
    const destinations = []; let renderer;
    try {
      await act(async () => { renderer = create(React.createElement(SettingsScreen, {
        navigation: { navigate: (...args) => destinations.push(args) },
      })); });
      const link = renderer.root.findByProps({ accessibilityLabel: 'お問い合わせ' });
      assert.equal(link.props.accessibilityRole, 'link');
      assert.equal(link.props.disabled, false);
      assert.match(link.props.accessibilityHint, /外部の問い合わせフォーム/);
      await act(async () => { link.props.onPress(); await flush(); });
      assert.deepEqual(linkRequests, [url]);
      assert.deepEqual(destinations, []);
      assert.deepEqual(alerts, []);
    } finally { if (renderer) await act(async () => renderer.unmount()); }
  }
});

test('Settings leaves support visible but unavailable for missing or unsafe form URLs', async t => {
  const previous = process.env.EXPO_PUBLIC_SUPPORT_FORM_URL;
  t.after(() => { if (previous === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_FORM_URL; else process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = previous; });
  for (const url of [undefined, '', 'javascript:alert(1)', 'http://example.com/contact', 'https://user:pass@example.com/contact']) {
    reset();
    if (url === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_FORM_URL; else process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = url;
    let renderer;
    try {
      await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
      const link = renderer.root.findByProps({ accessibilityLabel: 'お問い合わせ' });
      assert.equal(link.props.disabled, true);
      assert.equal(link.props.accessibilityState.disabled, true);
      assert.match(JSON.stringify(link.findAllByType('Text').map(node => node.props.children)), /問い合わせフォームは準備中です/);
      await act(async () => { link.props.onPress(); await flush(); });
      assert.deepEqual(linkRequests, []);
      assert.deepEqual(alerts, []);
    } finally { if (renderer) await act(async () => renderer.unmount()); }
  }
});

test('Settings explains a failed support link and allows retry from the same row', async t => {
  reset();
  const previous = process.env.EXPO_PUBLIC_SUPPORT_FORM_URL;
  t.after(() => { if (previous === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_FORM_URL; else process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = previous; });
  const url = 'https://example.com/contact';
  process.env.EXPO_PUBLIC_SUPPORT_FORM_URL = url;
  linkFailure = true; let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
    const link = renderer.root.findByProps({ accessibilityLabel: 'お問い合わせ' });
    await act(async () => { link.props.onPress(); await flush(); });
    assert.deepEqual(alerts, [['リンクを開けませんでした', '通信環境や、ブラウザーの設定を確認してください。']]);
    linkFailure = false;
    await act(async () => { link.props.onPress(); await flush(); });
    assert.deepEqual(linkRequests, [url, url]);
    assert.equal(alerts.length, 1);
  } finally { if (renderer) await act(async () => renderer.unmount()); reset(); }
});

test('notification drafts survive closing the panel, remain marked unsaved and save only on request', async t => {
  reset(); const previousSettings = data.notificationSettings;
  const updates = [];
  update = async settings => { updates.push(settings); data.notificationSettings = settings; };
  let renderer;
  await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  t.after(async () => { await act(async () => renderer.unmount()); data.notificationSettings = previousSettings; reset(); });
  await openNotificationSettings(renderer);
  await act(async () => renderer.root.findByType('Switch').props.onValueChange(true));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知時刻' }).props.onChangeText('07:30'));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知を何日前に出すか' }).props.onChangeText('7'));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '通知日を追加' }).props.onPress());
  await act(async () => toggleNotificationSettings(renderer));
  assert.equal(renderer.root.findAllByType('Switch').length, 0);
  assert.ok(renderer.root.findAllByType('Text').some(node => String(node.props.children).includes('未保存の変更があります')));
  assert.equal(updates.length, 0);
  assert.strictEqual(data.notificationSettings, previousSettings);
  await openNotificationSettings(renderer);
  assert.equal(renderer.root.findByType('Switch').props.value, true);
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '通知時刻' }).props.value, '07:30');
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '7日前の通知を削除' }));
  await act(async () => renderer.root.findAllByType('PrimaryButton').find(node => node.props.label === '通知設定を保存').props.onPress());
  assert.deepEqual(updates, [{ enabled: true, time: '07:30', daysBeforeList: [0, 7] }]);
  assert.equal(renderer.root.findAllByType('Text').some(node => String(node.props.children).includes('未保存の変更があります')), false);
});

test('grouped backup actions still require preview confirmation before sharing or restoring', async t => {
  reset(); const restored = [], previousRestore = data.restoreAppData;
  data.restoreAppData = async payload => { restored.push(payload); };
  let renderer;
  await act(async () => { renderer = create(React.createElement(SettingsScreen, { navigation: {} })); });
  t.after(async () => { await act(async () => renderer.unmount()); data.restoreAppData = previousRestore; reset(); });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'バックアップを書き出す' }).props.onPress());
  assert.deepEqual(backupRequests, [{ foods: data.foods, recipes: data.recipes, shoppingItems: data.shoppingItems, notificationSettings: data.notificationSettings }]);
  assert.deepEqual(sharedBackups, []);
  assert.equal(alerts.at(-1)[0], 'バックアップの保存内容');
  await act(async () => alerts.at(-1)[2].find(button => button.text === '保存する').onPress());
  assert.deepEqual(sharedBackups, [preparedBackup]);
  pickedBackup = { format: 'refrigerator-note-backup', version: 2, exportedAt: '2026-10-19T00:00:00.000Z',
    data: { foods: [], recipes: [], shoppingItems: [], learnedProducts: {}, notificationSettings: data.notificationSettings } };
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'バックアップから復元' }).props.onPress());
  assert.equal(alerts.at(-1)[0], 'バックアップから復元');
  assert.match(alerts.at(-1)[1], /現在のデータをバックアップ内容へ置き換え/);
  assert.deepEqual(restored, []);
  assert.equal(alerts.at(-1)[2].find(button => button.text === 'キャンセル').style, 'cancel');
  await act(async () => alerts.at(-1)[2].find(button => button.text === '復元する').onPress());
  assert.deepEqual(restored, [pickedBackup]);
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
test('food icons and legacy Yahoo hosts never mount a remote Image; a selected photo still renders', async () => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(FoodImage, { source: { uri: 'food-icon:dairy' } })); });
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.equal(renderer.root.findByType('Icon').props.name, 'water-outline');
  await act(async () => renderer.update(React.createElement(FoodImage, { source: { uri: 'https://item-shopping.c.yimg.jp/photo.jpg' } })));
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  await act(async () => renderer.update(React.createElement(FoodImage, { source: { uri: 'file:///document/my-photo.jpg' } })));
  assert.equal(renderer.root.findByType('Image').props.source.uri, 'file:///document/my-photo.jpg');
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
  pickerAsset.fileSize = 100; await pick(); assert.deepEqual(selected, ['file:///resized-photo.jpg']);
  await act(async () => renderer.unmount());
});

test('web photo selection stores portable image content and preserves the old photo on invalid or unreadable data', async () => {
  reset(); platform.OS = 'web'; const selected = [], previousAsset = pickerAsset; let renderer;
  const pick = async () => {
    await act(async () => renderer.root.findByType('Pressable').props.onPress());
    await act(async () => { alerts.at(-1)[2].find((button) => button.text === 'ライブラリから選ぶ').onPress(); await flush(); });
  };
  try {
    await act(async () => { renderer = create(React.createElement(FoodImagePicker, { image: 'original.jpg', onChange: (uri) => selected.push(uri) })); });
    pickerAsset = { uri: 'blob:temporary-photo', width: 100, height: 100, fileSize: 4, mimeType: 'image/png', base64: 'YWJjZA==' };
    await pick();
    assert.equal(pickerOptions.base64, false);
    assert.equal(resizeRequests[0].uri, 'blob:temporary-photo');
    assert.deepEqual(selected, ['data:image/jpeg;base64,YWJjZA==']);
    const { validateEmbeddedImage } = require('../src/services/dataValidation.ts');
    assert.deepEqual(validateEmbeddedImage(selected[0]), { mime: 'image/jpeg', base64: 'YWJjZA==', size: 4 });
    assert.equal(JSON.parse(JSON.stringify({ image: selected[0] })).image, 'data:image/jpeg;base64,YWJjZA==');
    resizedImage = { ...resizedImage, base64: undefined }; await pick();
    assert.match(alerts.at(-1)[1], /写真の保存内容を読み込めません/);
    pickerAsset = { ...pickerAsset, mimeType: 'image/heic', base64: 'YWJjZA==' }; await pick();
    assert.match(alerts.at(-1)[1], /JPEG・PNG・WebP・GIF/);
    pickerAsset = { ...pickerAsset, mimeType: 'image/png' }; resizedImage = { ...resizedImage, base64: 'broken' }; await pick();
    assert.equal(selected.length, 1);
    pickerAsset = { ...pickerAsset, fileSize: undefined }; resizedImage = { ...resizedImage, base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }; await pick();
    assert.match(alerts.at(-1)[1], /5MB/); assert.equal(selected.length, 1);
  } finally {
    pickerAsset = previousAsset; reset();
    if (renderer) await act(async () => renderer.unmount());
  }
});

test('camera and library always pass the selected photo through resizing before publishing a native URI or Web JPEG', async () => {
  const previousAsset = pickerAsset;
  for (const system of ['ios', 'android', 'web']) {
    reset(); platform.OS = system;
    pickerAsset = { uri: system === 'web' ? 'blob:original' : 'file:///original.gif', width: 1600, height: 1200,
      fileSize: 1000, mimeType: 'image/gif', base64: 'b3JpZ2luYWw=' };
    resizedImage = { uri: system === 'web' ? 'blob:resized' : 'file:///resized.jpg', width: 800, height: 600, base64: 'anBlZw==' };
    const selected = []; let renderer;
    try {
      await act(async () => { renderer = create(React.createElement(FoodImagePicker, { image: 'original.jpg', onChange: uri => selected.push(uri) })); });
      for (const choice of ['写真を撮る', 'ライブラリから選ぶ']) {
        await act(async () => renderer.root.findByType('Pressable').props.onPress());
        await act(async () => { alerts.at(-1)[2].find(button => button.text === choice).onPress(); await flush(); });
        assert.equal(pickerOptions.base64, false);
        assert.strictEqual(resizeRequests.at(-1), pickerAsset);
      }
      const expected = system === 'web' ? 'data:image/jpeg;base64,anBlZw==' : 'file:///resized.jpg';
      assert.deepEqual(selected, [expected, expected]);
      assert.equal(resizeRequests.length, 2);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
      pickerAsset = previousAsset; reset();
    }
  }
});

test('resizing failure preserves the existing photo, reports the error and releases the picker lock for retry', async () => {
  const previousAsset = pickerAsset;
  for (const system of ['ios', 'web']) {
    reset(); platform.OS = system; resizeFailure = true;
    pickerAsset = { uri: system === 'web' ? 'blob:original' : 'file:///original.jpg', width: 1600, height: 1200, fileSize: 1000, mimeType: 'image/jpeg' };
    const selected = []; let renderer;
    const pick = async () => {
      await act(async () => renderer.root.findByType('Pressable').props.onPress());
      await act(async () => { alerts.at(-1)[2].find(button => button.text === 'ライブラリから選ぶ').onPress(); await flush(); });
    };
    try {
      await act(async () => { renderer = create(React.createElement(FoodImagePicker, { image: 'original.jpg', onChange: uri => selected.push(uri) })); });
      await pick();
      assert.deepEqual(selected, []);
      assert.equal(alerts.at(-1)[0], '写真を選択できませんでした');
      assert.match(alerts.at(-1)[1], /写真を縮小できませんでした/);
      assert.equal(renderer.root.findByType(FoodImage).props.source.uri, 'original.jpg');
      resizeFailure = false; await pick();
      assert.equal(selected.length, 1);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
      pickerAsset = previousAsset;
      reset();
    }
  }
});
