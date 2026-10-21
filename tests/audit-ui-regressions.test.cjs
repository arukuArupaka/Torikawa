require('./register-typescript.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'ios' };
const data = { foods: [], recipes: [], isReady: true };
let lastResponses, listener, destinations, clears, alerts, permission, requestPermission, openSettings;
let imageFailure, additions, edits;
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return {
    Platform: platform, StyleSheet: { create: value => value },
    View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput',
    KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
    Linking: { openSettings: () => openSettings() },
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === 'expo-camera') return { CameraView: 'CameraView', useCameraPermissions: () => [permission, () => requestPermission()] };
  if (request === 'expo-notifications') return {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    getLastNotificationResponseAsync: () => new Promise(resolve => lastResponses.push(resolve)),
    clearLastNotificationResponseAsync: async () => { clears++; },
    addNotificationResponseReceivedListener: callback => { listener = callback; return { remove() {} }; },
  };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => (...args) => alerts.push(args) };
  if (request.endsWith('/navigation/navigationRef')) return { navigationRef: { isReady: () => true, navigate: (...args) => destinations.push(args) } };
  if (request.endsWith('/services/storage')) return { getStorageEpoch: () => 0, assertStorageEpoch() {} };
  if (request.endsWith('/services/imageStorage')) return { persistFoodImage: uri => { if (imageFailure) throw Error('copy failed'); return uri; } };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    return { [name]: props => React.createElement(name, props) };
  }
  return original.call(this, request, ...args);
};
const { NotificationNavigationHandler } = require('../src/components/NotificationNavigationHandler.tsx');
const { AddRecipeScreen } = require('../src/screens/AddRecipeScreen.tsx');
const { BarcodeScanner } = require('../src/components/BarcodeScanner.tsx');
after(() => { Module._load = original; });

function reset() {
  platform.OS = 'ios'; data.foods = [{ id: 'milk' }]; data.recipes = []; data.isReady = true;
  lastResponses = []; listener = null; destinations = []; clears = 0; alerts = [];
  permission = { granted: false, canAskAgain: true }; requestPermission = async () => ({ granted: true });
  openSettings = async () => {}; imageFailure = false; additions = []; edits = [];
  data.addRecipe = input => { additions.push(input); return { ...input, id: `recipe-${additions.length}` }; };
  data.updateRecipe = (...args) => edits.push(args);
}
const response = (id = 'old') => ({ actionIdentifier: 'default', notification: { request: { identifier: id, content: { data: { foodId: 'milk' } } } } });

test('a notification read from an obsolete food snapshot or an unmounted handler cannot navigate or clear responses', async () => {
  reset(); let renderer;
  const element = () => React.createElement(NotificationNavigationHandler, { navigationReady: true });
  try {
    await act(async () => { renderer = create(element()); });
    const first = lastResponses[0];
    data.foods = [];
    await act(async () => renderer.update(element()));
    await act(async () => first(response()));
    assert.deepEqual(destinations, []); assert.equal(clears, 0);
    await act(async () => lastResponses[1](response('current')));
    assert.deepEqual(destinations, [['MainTabs', { screen: 'Home' }]]); assert.equal(clears, 1);
    data.foods = [{ id: 'milk' }];
    await act(async () => renderer.update(element()));
    const pending = lastResponses.at(-1);
    await act(async () => renderer.unmount()); renderer = null;
    await act(async () => pending(response('after-unmount')));
    assert.equal(destinations.length, 1); assert.equal(clears, 1);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('a notification arriving during hydration waits for current data and the navigator, and duplicate taps are ignored', async () => {
  reset(); data.isReady = false; let renderer;
  const element = ready => React.createElement(NotificationNavigationHandler, { navigationReady: ready });
  try {
    await act(async () => { renderer = create(element(false)); });
    await act(async () => listener(response('pending')));
    assert.equal(destinations.length, 0);
    data.isReady = true;
    await act(async () => renderer.update(element(true)));
    assert.deepEqual(destinations, [['FoodDetail', { foodId: 'milk' }]]);
    await act(async () => listener(response('pending')));
    assert.equal(destinations.length, 1); assert.equal(clears, 1);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

async function recipeForm(t, editing = false) {
  reset();
  if (editing) data.recipes = [{ id: 'recipe-1', name: '卵焼き', image: 'food-icon:eggs', category: 'main',
    ingredients: ['卵'], ingredientAmounts: { 卵: '1個' }, steps: ['焼きます。'], minutes: 5, servings: 1 }];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AddRecipeScreen, {
    navigation: { replace: (...args) => destinations.push(args), goBack: () => destinations.push(['back']) },
    route: { params: editing ? { recipeId: 'recipe-1' } : undefined },
  })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  if (!editing) await act(async () => {
    renderer.root.findAllByType('FormField').find(node => node.props.label === '料理名').props.onChangeText('卵焼き');
    renderer.root.findAllByType('TextInput').find(node => node.props.placeholder === '材料1').props.onChangeText('卵');
    renderer.root.findByProps({ placeholder: '調理手順を入力' }).props.onChangeText('焼きます。');
  });
  return renderer;
}

test('repeated recipe save events in one render save and navigate only once', async t => {
  for (const editing of [false, true]) {
    const renderer = await recipeForm(t, editing);
    const save = renderer.root.findAllByType('PrimaryButton').find(node => node.props.label.includes('保存') || node.props.label.includes('追加')).props.onPress;
    await act(async () => { save(); save(); });
    assert.equal(editing ? edits.length : additions.length, 1);
    assert.equal(destinations.length, 1);
  }
});

test('failed recipe photo persistence releases the save lock for a retry', async t => {
  const renderer = await recipeForm(t); imageFailure = true;
  t.mock.method(console, 'warn', () => {});
  const button = () => renderer.root.findAllByType('PrimaryButton').find(node => node.props.label.includes('保存') || node.props.label.includes('追加'));
  await act(async () => button().props.onPress());
  assert.equal(additions.length, 0); assert.equal(alerts.at(-1)[0], '画像を保存できませんでした');
  imageFailure = false;
  await act(async () => button().props.onPress());
  assert.equal(additions.length, 1); assert.equal(destinations.length, 1);
});

test('camera permission and device-settings failures are handled as Japanese guidance instead of unhandled rejections', async () => {
  for (const canAskAgain of [true, false]) {
    reset(); permission.canAskAgain = canAskAgain;
    requestPermission = openSettings = async () => { throw Error('not available'); };
    let renderer;
    try {
      await act(async () => { renderer = create(React.createElement(BarcodeScanner, { active: true, onScanned() {} })); });
      await act(async () => renderer.root.findByType('Pressable').props.onPress());
      assert.equal(alerts.at(-1)?.[0], 'カメラを利用できませんでした');
    } finally { if (renderer) await act(async () => renderer.unmount()); }
  }
});

test('Web permission denial explains browser settings without calling unsupported native settings', async () => {
  reset(); platform.OS = 'web'; permission.canAskAgain = false;
  let calls = 0, renderer; openSettings = async () => { calls++; };
  try {
    await act(async () => { renderer = create(React.createElement(BarcodeScanner, { active: true, onScanned() {} })); });
    await act(async () => renderer.root.findByType('Pressable').props.onPress());
    assert.equal(calls, 0); assert.match(alerts.at(-1)?.[1] ?? '', /ブラウザー/);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
