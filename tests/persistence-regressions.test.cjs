require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map();
const writes = [];
let readFailure = false;
let writeFailure = false;
let holdNextWrite = false;
let releaseWrite;
const asyncStorage = {
  async getAllKeys() { return [...store.keys()]; },
  async getItem(key) {
    if (readFailure) throw new Error('Temporary read failure');
    return store.get(key) ?? null;
  },
  async setItem(key, value) {
    writes.push({ key, value });
    if (writeFailure) throw new Error('Disk full');
    if (holdNextWrite) {
      holdNextWrite = false;
      await new Promise((resolve) => { releaseWrite = resolve; });
    }
    store.set(key, value);
  },
};
const originalLoad = Module._load;
const alerts = [];
const sharedPayloads = [];
let sharedConfigured = true;
let shareFailure = false;
const productCorrections = [];
const savedProducts = [];
let correctionFailure = false;
const nativeMock = {
  Animated: { View: 'AnimatedView', Value: class { setValue() {} stopAnimation() {} } },
  AppState: { addEventListener: () => ({ remove() {} }) },
  Modal: 'Modal',
  Platform: { OS: 'web' }, KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss() {} },
  Image: { resolveAssetSource: () => ({ uri: 'test-image' }) },
  Alert: { alert: (...args) => alerts.push(args) },
  StyleSheet: { create: (styles) => styles },
  SectionList: require('./native-section-list.cjs'),
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
};
Module._load = function (request, ...args) {
  if (request === '@react-native-async-storage/async-storage') return asyncStorage;
  if (request === 'react-native') return { ...nativeMock, Image: Object.assign((props) => React.createElement('Image', props), nativeMock.Image) };
  if (request === '@expo/vector-icons') return { Ionicons: (props) => React.createElement('Icon', props) };
  if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: (props) => React.createElement(name, props,
      props.header, props.expanded ? props.children : null) };
    return { [name]: (props) => React.createElement(name, props) };
  }
  if (request.endsWith('/services/notificationService')) return { queueNotificationSync: async () => {} };
  if (request.endsWith('/services/imageStorage')) return { deleteStoredFoodImage: () => {}, persistFoodImage: (uri) => uri };
  if (request.endsWith('/services/learnedProductService')) return {
    saveLearnedProduct: async (value) => { savedProducts.push(structuredClone(value)); },
    correctLearnedProduct: async (value) => {
      productCorrections.push(structuredClone(value));
      if (correctionFailure) throw new Error('disk full');
    },
  };
  if (request.endsWith('/services/sharedProductService')) return {
    isSharedProductsConfigured: () => sharedConfigured,
    shareProduct: async (product, rulesVersion) => {
      assert.equal(rulesVersion, require('../shared/productContract.js').SHARED_RULES_VERSION);
      sharedPayloads.push(structuredClone(product));
      if (shareFailure) throw new Error('offline');
      return 'pending';
    },
  };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { AppDataProvider, useAppData } = require('../src/context/AppDataContext.tsx');
const { storageKeys, saveStoredValue } = require('../src/services/storage.ts');
const { RecipeDetailScreen } = require('../src/screens/RecipeDetailScreen.tsx');
const { RecipesScreen } = require('../src/screens/RecipesScreen.tsx');
const { AddFoodScreen } = require('../src/screens/AddFoodScreen.tsx');
const { FoodDetailScreen } = require('../src/screens/FoodDetailScreen.tsx');
const { HomeScreen } = require('../src/screens/HomeScreen.tsx');
const { AppToastProvider, useToastState } = require('../src/context/AppToastContext.tsx');
const { createSampleFoods } = require('../src/data/sampleData.ts');
const { getRecentFoods } = require('../src/utils/recentFoods.ts');
const { AddRecipeScreen } = require('../src/screens/AddRecipeScreen.tsx');
const { ShoppingListScreen } = require('../src/screens/ShoppingListScreen.tsx');
const { AppAlertProvider, useAppAlert, useIsAppAlertVisible } = require('../src/context/AppAlertContext.tsx');
const { CalendarScreen } = require('../src/screens/CalendarScreen.tsx');
const { sampleRecipes } = require('../src/data/sampleData.ts');
const legacyRecipes = require('../src/data/legacySampleRecipes.v1.json');
let context;
function Consumer() { context = useAppData(); return null; }
async function mount() {
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer))); });
  return renderer;
}
test('calendar confirmation changes only the expiry date and keeps stock edited while the dialog was open', async t => {
  reset(); alerts.length = 0;
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 17, 12).getTime() });
  const original = { ...createSampleFoods()[0], expiryDate: '2026-10-17', quantity: 1000, quantityUnit: 'ml', memo: '変更前' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(CalendarScreen, { navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel?.endsWith('の期限日を変更')).props.onPress());
  await act(async () => renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel?.startsWith('10月18日、')).props.onPress());
  const confirm = alerts.at(-1)[2].find(button => button.text === '変更する').onPress;
  await act(async () => context.updateFood(original.id, { ...context.foods[0], quantity: 600, memo: '調理後のメモ' }));
  const current = context.foods[0];
  await act(async () => confirm());
  assert.deepEqual(context.foods[0], { ...current, expiryDate: '2026-10-18', revision: (current.revision ?? 0) + 1 });
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].quantity, 600);
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].memo, '調理後のメモ');
});
function reset() {
  // The interaction regressions intentionally exercise the sample inventory.
  process.env.EXPO_PUBLIC_DEMO_DATA = 'true';
  store.clear(); writes.length = 0;
  readFailure = false; writeFailure = false; holdNextWrite = false;
  sharedPayloads.length = 0; sharedConfigured = true; shareFailure = false;
  productCorrections.length = 0; correctionFailure = false;
  savedProducts.length = 0;
}

test('home used/disposed and detail shopping actions offer undo and restore the saved inventory', async (t) => {
  reset(); alerts.length = 0;
  const original = createSampleFoods()[0];
  store.set(storageKeys.foods, JSON.stringify([original]));
  store.set(storageKeys.shopping, '[]');
  let toastState, renderer;
  const destinations = [];
  function ToastProbe() { toastState = useToastState(); return null; }
  function app(screen) {
    return React.createElement(AppToastProvider, null, React.createElement(AppDataProvider, null,
      React.createElement(Consumer), React.createElement(ToastProbe), screen));
  }
  await act(async () => { renderer = create(app(React.createElement(HomeScreen, { navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  for (const [prop, confirmation, status] of [
    ['onMarkUsed', '記録だけ', 'used'], ['onMarkDisposed', 'OK', 'disposed'],
  ]) {
    const card = renderer.root.findByType('SwipeableFoodCard');
    await act(async () => card.props[prop]());
    assert.equal(context.foods[0].status, 'active', 'confirmation alone does not change stock');
    await act(async () => alerts.at(-1)[2].find((button) => button.text === confirmation).onPress());
    assert.equal(context.foods[0].status, status);
    assert.equal(toastState.toast.action.label, '元に戻す');
    assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 0);
    await act(async () => toastState.runAction(toastState.toast.id));
    assert.equal(context.foods[0].status, 'active');
    assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 1);
    assert.match(toastState.toast.message, /管理中に戻しました/);
    assert.equal(JSON.parse(store.get(storageKeys.foods))[0].status, 'active');
  }
  await act(async () => renderer.update(app(React.createElement(FoodDetailScreen, {
    route: { params: { foodId: original.id } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) },
  }))));
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '使い切った').props.onPress());
  await act(async () => alerts.at(-1)[2].find((button) => button.text === '買い物リストにも追加').onPress());
  assert.equal(context.foods[0].status, 'used');
  assert.deepEqual(destinations.at(-1), ['MainTabs', { screen: 'Home' }]);
  assert.match(toastState.toast.action.hint, /買い物リスト/);
  assert.equal(context.shoppingItems.length, 1);
  await act(async () => toastState.runAction(toastState.toast.id));
  assert.equal(context.foods[0].status, 'active');
  assert.equal(context.shoppingItems.length, 1, 'undo restores the food only');
});

async function mountQuantityDetail(t) {
  reset();
  const original = { ...createSampleFoods()[0], id: 'quantity-milk', name: '牛乳', ingredientName: '牛乳', productName: null,
    category: 'dairy', quantity: 1000, quantityUnit: 'ml', memo: '残すメモ', revision: 3,
    consumptionHistory: [{ operationId: 'old-cooking', recipeId: 'old-recipe', recordedAt: '2026-10-14T00:00:00.000Z',
      amount: 200, before: 1200, after: 1000, unit: 'ml' }] };
  store.set(storageKeys.foods, JSON.stringify([original]));
  let renderer, toastState;
  function ToastProbe() { toastState = useToastState(); return null; }
  await act(async () => { renderer = create(React.createElement(AppToastProvider, null,
    React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(ToastProbe),
      React.createElement(FoodDetailScreen, { navigation: {}, route: { params: { foodId: original.id } } })))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return { renderer, original, toast: () => toastState,
    open: () => renderer.root.findByProps({ accessibilityLabel: '残量を変更' }).props.onPress(),
    input: () => renderer.root.findByProps({ accessibilityLabel: '変更後の残量' }),
    button: label => renderer.root.findAllByType('PrimaryButton').find(node => node.props.label === label),
  };
}

test('the used action follows remaining quantity before product details, and still requires confirmation', async t => {
  const app = await mountQuantityDetail(t);
  alerts.length = 0;
  const longName = '毎日飲みたい牛乳 '.repeat(12).trim();
  await act(async () => context.updateFood(app.original.id, { ...context.foods[0], name: longName, productName: longName }));
  const nodes = app.renderer.root.findAll(node => node.type === 'Text' || node.type === 'PrimaryButton'
    || (node.type === 'Pressable' && node.props.accessibilityLabel === '残量を変更'));
  const quantityIndex = nodes.findIndex(node => node.props.accessibilityLabel === '残量を変更');
  const usedIndex = nodes.findIndex(node => node.type === 'PrimaryButton' && node.props.label === '使い切った');
  const detailsIndex = nodes.findIndex(node => node.type === 'Text' && node.props.children === '商品名');
  assert.ok(quantityIndex >= 0 && quantityIndex < usedIndex && usedIndex < detailsIndex);
  assert.equal(app.renderer.root.findAllByType('PrimaryButton').filter(node => node.props.label === '使い切った').length, 1);
  assert.ok(nodes.some(node => node.type === 'Text' && node.props.children === longName), 'the complete product name remains visible');
  for (const label of ['捨てた', 'この食材を編集', '食材の登録を削除する']) {
    assert.ok(nodes.findIndex(node => node.type === 'PrimaryButton' && node.props.label === label) > detailsIndex);
  }
  const before = context.foods[0];
  const savedWrites = writes.length;
  await act(async () => app.button('使い切った').props.onPress());
  assert.equal(alerts.at(-1)[0], '使い切ったとして記録');
  assert.deepEqual(alerts.at(-1)[2].map(button => button.text), ['キャンセル', '記録だけ', '買い物リストにも追加']);
  const cancel = alerts.at(-1)[2].find(button => button.text === 'キャンセル');
  assert.equal(cancel.style, 'cancel');
  await act(async () => cancel.onPress?.());
  assert.strictEqual(context.foods[0], before);
  assert.equal(writes.length, savedWrites);
});

test('completed food details offer restore instead of the quick used action', async t => {
  const app = await mountQuantityDetail(t);
  for (const record of [() => context.markFoodUsed(app.original.id), () => context.markFoodDisposed(app.original.id)]) {
    await act(async () => record());
    assert.equal(app.button('使い切った'), undefined);
    assert.equal(app.renderer.root.findAllByProps({ accessibilityLabel: '残量を変更' }).length, 0);
    assert.ok(app.button('記録を取り消す'));
    assert.ok(app.button('食材の登録を削除する'));
    await act(async () => context.restoreFood(app.original.id));
    assert.ok(app.button('使い切った'));
  }
});

test('quick quantity editing saves once, keeps other fields and history, and offers saved undo without navigation', async t => {
  const app = await mountQuantityDetail(t);
  const before = context.foods[0];
  await act(async () => app.open());
  assert.equal(app.input().props.value, '1000'); assert.equal(app.input().props.autoFocus, true);
  await act(async () => app.input().props.onChangeText('700'));
  const save = app.button('残量を保存').props.onPress;
  await act(async () => { save(); save(); });
  assert.equal(app.renderer.root.findAllByType('Modal').length, 0);
  assert.deepEqual(context.foods[0], { ...before, quantity: 700, revision: 4 });
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].quantity, 700);
  assert.equal(savedProducts.length, 0); assert.equal(sharedPayloads.length, 0);
  assert.match(app.toast().toast.message, /700ml/); assert.equal(app.toast().toast.action.label, '元に戻す');
  await act(async () => app.toast().runAction(app.toast().toast.id));
  assert.deepEqual(context.foods[0], { ...before, revision: 5 });
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].quantity, 1000);
});

test('quick quantity editing can cancel, validates zero and decimals, and closes unchanged input without a write', async t => {
  const app = await mountQuantityDetail(t);
  const before = context.foods[0];
  await act(async () => app.open());
  for (const value of ['', '0', '-1', '5.555', '100000', 'abc']) {
    await act(async () => app.input().props.onChangeText(value));
    await act(async () => app.button('残量を保存').props.onPress());
    assert.strictEqual(context.foods[0], before);
    assert.equal(app.renderer.root.findAllByType('Modal').length, 1);
    const error = app.renderer.root.findByProps({ accessibilityRole: 'alert' });
    assert.match(String(error.props.children), value === '0' ? /使い切った/ : /数値/);
  }
  await act(async () => app.button('キャンセル').props.onPress());
  assert.equal(app.renderer.root.findAllByType('Modal').length, 0);
  await act(async () => app.open()); assert.equal(app.input().props.value, '1000');
  const savedWrites = writes.length;
  await act(async () => app.button('残量を保存').props.onPress());
  assert.strictEqual(context.foods[0], before); assert.equal(writes.length, savedWrites);
  assert.equal(app.toast().toast, null);
});

test('a quantity panel rejects stale edits and closes when its food is used or deleted', async t => {
  const app = await mountQuantityDetail(t);
  await act(async () => app.open());
  await act(async () => app.input().props.onChangeText('700'));
  await act(async () => context.updateFood(app.original.id, { ...context.foods[0], memo: '後で編集したメモ' }));
  await act(async () => app.button('残量を保存').props.onPress());
  assert.equal(context.foods[0].quantity, 1000); assert.equal(context.foods[0].memo, '後で編集したメモ');
  assert.match(String(app.renderer.root.findByProps({ accessibilityRole: 'alert' }).props.children), /確認中に/);
  await act(async () => app.renderer.root.findByType('Modal').props.onRequestClose());
  await act(async () => app.open());
  await act(async () => context.markFoodUsed(app.original.id));
  assert.equal(app.renderer.root.findAllByType('Modal').length, 0);
  assert.equal(app.renderer.root.findAllByProps({ accessibilityLabel: '残量を変更' }).length, 0);
  assert.ok(app.renderer.root.findAllByType('Text').some(node => node.props.children === '1000ml'), 'history still shows the last positive quantity');
  await act(async () => context.restoreFood(app.original.id));
  await act(async () => app.open());
  await act(async () => context.deleteFood(app.original.id));
  assert.equal(app.renderer.root.findAllByType('Modal').length, 0);
});

test('an unchanged legacy quantity is preserved by the quick panel instead of rounded on opening', async t => {
  const app = await mountQuantityDetail(t);
  await act(async () => context.updateFood(app.original.id, { ...context.foods[0], quantity: 1.234 }));
  const before = context.foods[0];
  await act(async () => app.open()); assert.equal(app.input().props.value, '1.234');
  await act(async () => app.button('残量を保存').props.onPress());
  assert.strictEqual(context.foods[0], before); assert.equal(app.renderer.root.findAllByType('Modal').length, 0);
});

test('barcode registration carries product attribution into inventory and learned defaults; replacing a photo removes its old image credit', async (t) => {
  reset();
  store.set(storageKeys.foods, '[]');
  const source = { provider: 'open-food-facts', barcode: '4909999900020', productUrl: 'https://world.openfoodfacts.org/product/4909999900020',
    fetchedAt: '2026-10-01T00:00:00.000Z', image: { url: 'https://images.openfoodfacts.org/images/products/test/front_ja.3.200.jpg', author: 'contributor', license: 'CC-BY-SA-3.0' } };
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, {
    navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate() {} }, route: { params: { initialName: 'テスト牛乳', initialProductName: 'テスト牛乳', initialIngredientName: '牛乳',
      initialCategory: '乳製品', initialBarcode: source.barcode, initialImage: source.image.url, initialProductSource: source } },
  }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods[0].productSource.image.author, 'contributor');
  assert.deepEqual(savedProducts[0].productSource, context.foods[0].productSource);
  const id = context.foods[0].id;
  await act(async () => renderer.update(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, {
    navigation: { goBack() {} }, route: { params: { foodId: id } },
  }))));
  await act(async () => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '写真・カテゴリ・購入日・メモを編集')).props.onPress());
  await act(async () => renderer.root.findByType('FoodImagePicker').props.onChange('file:///user-photo.jpg'));
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods[0].productSource.image, undefined);
  assert.equal(context.foods[0].productSource.productUrl, source.productUrl);
});

test('phase 2 cooking displays every lot, allocates by expiry and persists a single operation after double confirmation', async (t) => {
  reset(); alerts.length = 0;
  const milk = { ...createSampleFoods()[0], name: '牛乳', productName: null, ingredientName: '牛乳', quantityUnit: 'ml' };
  store.set(storageKeys.foods, JSON.stringify([
    { ...milk, id: 'later', quantity: 200, expiryDate: '2099-01-02' },
    { ...milk, id: 'early', quantity: 100, expiryDate: '2099-01-01' },
    { ...milk, id: 'spare', quantity: 500, expiryDate: '2099-01-03' },
  ]));
  store.set(storageKeys.recipes, JSON.stringify([{ ...sampleRecipes[0], id: 'milk-recipe', ingredients: ['牛乳'], ingredientAmounts: { 牛乳: '200ml' } }]));
  const destinations = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'milk-recipe' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } }))); });
  const button = (label) => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === label));
  assert.equal(renderer.root.findAllByType('View').filter((node) => node.props.testID?.startsWith('consumption-')).length, 3);
  await act(async () => button('使った分を自動選択').props.onPress());
  assert.equal(renderer.root.findAllByType('TextInput').length, 1);
  assert.equal(renderer.root.findByType('TextInput').props.value, '100');
  const text = renderer.root.findAllByType('Text').map((node) => [node.props.children].flat().join('')).join('\n');
  assert.match(text, /使用後：0ml/); assert.match(text, /使用後：100ml/); assert.match(text, /使用後：500ml/);
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress());
  const confirm = alerts.at(-1)[2].find((item) => item.text === '記録する').onPress;
  await act(async () => { confirm(); confirm(); });
  assert.equal(destinations.length, 1);
  assert.equal(context.foods.find((f) => f.id === 'early').status, 'used');
  assert.equal(context.foods.find((f) => f.id === 'later').quantity, 100);
  assert.equal(context.foods.find((f) => f.id === 'spare').quantity, 500);
  const saved = JSON.parse(store.get(storageKeys.foods));
  assert.equal(saved.find((f) => f.id === 'early').consumptionHistory[0].after, 0);
  assert.equal(saved.find((f) => f.id === 'later').consumptionHistory.length, 1);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.foods, saved);
  await act(async () => renderer.unmount());
});

test('phase 2 confirmation rejects all lots after one has been edited, preserving new metadata', async () => {
  reset(); alerts.length = 0;
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: () => assert.fail('must remain on screen') } }))); });
  const button = renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  await act(async () => button.props.onPress());
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress());
  const confirm = alerts.at(-1)[2].find((item) => item.text === '記録する').onPress;
  const egg = context.foods.find((f) => f.name === '卵');
  await act(async () => context.updateFood(egg.id, { ...egg, memo: '確認中に編集したメモ' }));
  const before = structuredClone(context.foods);
  await act(async () => confirm());
  assert.deepEqual(context.foods, before);
  assert.equal(alerts.at(-1)[0], '在庫を確認してください');
  await act(async () => renderer.unmount());
});

test('phase 2 product corrections unify display names and send only metadata to the local catalog, with retry', async () => {
  reset(); alerts.length = 0;
  const original = { ...createSampleFoods()[0], barcode: '4901234567887', memo: '個人メモ', storage: 'frozen' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  let renderer; let back = 0;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: { foodId: original.id } }, navigation: { goBack: () => back++ } }))); });
  const field = (label) => renderer.root.findAllByType('FormField').find((node) => node.props.label === label);
  assert.equal(field('食材名・商品名').props.value, original.productName);
  await act(async () => field('食材名・商品名').props.onChangeText('訂正した牛乳'));
  correctionFailure = true;
  const save = () => renderer.root.findByType('PrimaryButton').props.onPress();
  await act(async () => save());
  assert.equal(context.foods[0].name, '訂正した牛乳');
  assert.equal(context.foods[0].productName, '訂正した牛乳');
  assert.equal(context.foods[0].memo, original.memo);
  assert.equal(back, 0);
  assert.equal(renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.accessibilityState.checked, true);
  correctionFailure = false;
  await act(async () => save());
  assert.equal(back, 1);
  assert.deepEqual(productCorrections, Array(2).fill({ barcode: original.barcode, name: '訂正した牛乳', ingredientName: original.ingredientName, category: original.category }));
  assert.equal(sharedPayloads.length, 0);
  assert.equal(context.foods.length, 1);
  await act(async () => renderer.unmount());
});

test('phase 2 product correction can stay on inventory only and uncertain barcode names request classification review', async () => {
  reset();
  const original = { ...createSampleFoods()[0], barcode: '4901234567887' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: { foodId: original.id } }, navigation: { goBack() {} } }))); });
  await act(async () => renderer.root.findAllByType('FormField').find((node) => node.props.label === '食材名・商品名').props.onChangeText('この在庫の名前'));
  await act(async () => renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress());
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(productCorrections.length, 0);
  assert.equal(context.foods[0].productName, 'この在庫の名前');
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(AddFoodScreen, { route: { params: { initialBarcode: '4901234567887', initialProductName: '牛乳とチーズのソース', initialIngredientName: '牛乳とチーズのソース' } }, navigation: {} }))); });
  assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('分類を特定できませんでした')));
  await act(async () => renderer.unmount());
});

test('corrupt stored JSON is preserved; no sample data is written', async () => {
  reset();
  store.set(storageKeys.foods, '[]');
  store.set(storageKeys.recipes, '{broken');
  const renderer = await mount();
  assert.equal(context.isReady, false);
  assert.match(context.loadError, /上書きせず/);
  assert.equal(writes.length, 0);
  assert.equal(store.get(storageKeys.recipes), '{broken');
  await act(async () => renderer.unmount());
});
test('transient read errors can be retried without resetting user data', async () => {
  reset();
  store.set(storageKeys.foods, '[]');
  store.set(storageKeys.recipes, '[]');
  readFailure = true;
  const renderer = await mount();
  assert.equal(writes.length, 0);
  readFailure = false;
  await act(async () => context.retryLoad());
  assert.equal(context.isReady, true);
  assert.equal(context.loadError, null);
  assert.deepEqual(context.foods, []);
  assert.deepEqual(context.recipes, []);
  await act(async () => renderer.unmount());
});
test('invalid stored food shape does not overwrite valid other collections', async () => {
  reset();
  store.set(storageKeys.foods, '{}');
  store.set(storageKeys.recipes, '[]');
  const renderer = await mount();
  assert.equal(context.isReady, false);
  assert.equal(writes.length, 0);
  assert.equal(store.get(storageKeys.recipes), '[]');
  await act(async () => renderer.unmount());
});
test('ordinary first launch persists empty personal inventory', async () => {
  reset();
  delete process.env.EXPO_PUBLIC_DEMO_DATA;
  const renderer = await mount();
  assert.equal(context.isReady, true);
  assert.equal(context.foods.length, 0);
  assert.equal(context.shoppingItems.length, 0);
  assert.equal(context.notificationSettings.enabled, false);
  assert.ok(store.has(storageKeys.foods));
  await act(async () => renderer.unmount());
});

test('hydration persists corrected defaults, preserves edits and never restores deleted recipes', async () => {
  reset();
  const soup = { ...structuredClone(legacyRecipes[2]), isFavorite: true, image: 'file:///my-soup.jpg', createdAt: '2025-01-01' };
  const edited = { ...structuredClone(legacyRecipes[0]), name: '我が家の味噌炒め', image: 'file:///my-pork.jpg', isFavorite: false, createdAt: '2025-02-01' };
  store.set(storageKeys.recipes, JSON.stringify([soup, edited]));
  let renderer = await mount();
  assert.equal(context.recipes.length, 2);
  assert.deepEqual(context.recipes[0].ingredients, sampleRecipes[2].ingredients);
  assert.equal(context.recipes[0].isFavorite, true);
  assert.equal(context.recipes[0].image, soup.image);
  assert.equal(context.recipes[0].createdAt, soup.createdAt);
  assert.deepEqual(context.recipes[1], edited);
  const persisted = JSON.parse(store.get(storageKeys.recipes));
  assert.deepEqual(persisted, context.recipes);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.recipes, persisted, 'a second launch must leave the migrated data intact');
  await act(async () => renderer.unmount());
});

test('adding missing batches preserves an existing 100-recipe collection across restart', async () => {
  reset();
  const saved = structuredClone(sampleRecipes.slice(0, 100));
  saved[0] = { ...saved[0], name: '自分の味噌炒め', isFavorite: true, image: 'file:///my-photo.jpg' };
  store.set(storageKeys.recipes, JSON.stringify(saved));
  let renderer = await mount();
  assert.deepEqual(context.recipes, saved, 'loading does not import new recipes');
  await act(async () => { context.addNewCatalogRecipes(); context.addNewCatalogRecipes(); });
  assert.equal(context.recipes.length, 136);
  assert.deepEqual(context.recipes.slice(0, 100), saved);
  const expected = structuredClone(context.recipes);
  assert.deepEqual(JSON.parse(store.get(storageKeys.recipes)), expected);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.recipes, expected);
  await act(async () => renderer.unmount());
});

test('adding missing classics preserves an existing 120-recipe collection across restart', async () => {
  reset();
  const saved = structuredClone(sampleRecipes.slice(0, 120));
  saved[101] = { ...saved[101], name: '我が家のブロッコリー', image: 'file:///personal.jpg', isFavorite: true };
  store.set(storageKeys.recipes, JSON.stringify(saved));
  let renderer = await mount();
  assert.deepEqual(context.recipes, saved, 'loading does not import the classics');
  await act(async () => { context.addNewCatalogRecipes(); context.addNewCatalogRecipes(); });
  assert.equal(context.recipes.length, 136);
  assert.deepEqual(context.recipes.slice(0, 120), saved);
  assert.deepEqual(context.recipes.slice(120).map(recipe => recipe.id), Array.from({ length: 16 }, (_, i) => `recipe-${121 + i}`));
  const expected = structuredClone(context.recipes);
  assert.deepEqual(JSON.parse(store.get(storageKeys.recipes)), expected);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.recipes, expected);
  await act(async () => renderer.unmount());
});

test('adding nine classic recipes preserves an existing 127-recipe collection across restart', async () => {
  reset();
  const saved = structuredClone(sampleRecipes.slice(0, 127));
  saved[120] = { ...saved[120], name: '我が家のカレー', image: 'file:///my-curry.jpg', isFavorite: true };
  store.set(storageKeys.recipes, JSON.stringify(saved));
  let renderer = await mount();
  assert.deepEqual(context.recipes, saved, 'loading does not import the new classics');
  await act(async () => { context.addNewCatalogRecipes(); context.addNewCatalogRecipes(); });
  assert.equal(context.recipes.length, 136);
  assert.deepEqual(context.recipes.slice(0, 127), saved);
  assert.deepEqual(context.recipes.slice(127).map(recipe => recipe.id), Array.from({ length: 9 }, (_, i) => `recipe-${128 + i}`));
  const expected = structuredClone(context.recipes);
  assert.deepEqual(JSON.parse(store.get(storageKeys.recipes)), expected);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.recipes, expected);
  await act(async () => renderer.unmount());
});

test('explicitly adding the new catalog saves 128 recipes once and keeps personal data across restart', async () => {
  reset();
  const edited = { ...sampleRecipes[0], name: '自分の味噌炒め', isFavorite: true, image: 'file:///my-photo.jpg' };
  store.set(storageKeys.recipes, JSON.stringify([edited]));
  let renderer = await mount();
  assert.equal(context.recipes.length, 1, 'no automatic import during hydration');
  await act(async () => { context.addNewCatalogRecipes(); context.addNewCatalogRecipes(); });
  assert.equal(context.recipes.length, 129);
  assert.deepEqual(context.recipes[0], edited);
  assert.ok(!context.recipes.some(recipe => recipe.id === 'recipe-2'), 'deleted older recipes remain deleted');
  assert.equal(JSON.parse(store.get(storageKeys.recipes)).length, 129);
  await act(async () => context.deleteRecipe('recipe-100'));
  const expected = structuredClone(context.recipes);
  await act(async () => renderer.unmount());
  renderer = await mount();
  assert.deepEqual(context.recipes, expected);
  assert.ok(!context.recipes.some(recipe => recipe.id === 'recipe-100'), 'restart does not reimport a deleted addition');
  await act(async () => renderer.unmount());
});

test('restoring an old backup uses the same conservative recipe migration', async () => {
  reset();
  const renderer = await mount();
  const custom = { ...structuredClone(legacyRecipes[2]), id: 'saved-local-idea', isFavorite: true, image: 'my-image', createdAt: '2025-01-01' };
  await act(async () => context.replaceAppData({
    foods: context.foods, shoppingItems: [], notificationSettings: context.notificationSettings,
    recipes: [{ ...structuredClone(legacyRecipes[2]), image: '', isFavorite: false, createdAt: '2025-01-01' }, custom],
  }));
  assert.deepEqual(context.recipes[0].ingredients, sampleRecipes[2].ingredients);
  assert.deepEqual(context.recipes[1], custom);
  assert.equal(context.recipes.length, 2);
  assert.deepEqual(JSON.parse(store.get(storageKeys.recipes)), context.recipes);
  await act(async () => renderer.unmount());
});

test('recipe shopping action adds missing seasonings with quantities and excludes water', async () => {
  reset(); alerts.length = 0;
  store.set(storageKeys.recipes, JSON.stringify([{ ...legacyRecipes[2], image: '', isFavorite: false, createdAt: '2025-01-01' }]));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer), React.createElement(RecipesScreen, { navigation: {} }),
    ));
  });
  const materialToggle = renderer.root.findByProps({ accessibilityLabel: '豆腐とわかめの味噌汁の材料の確認', accessibilityRole: 'button' });
  await act(async () => materialToggle.props.onPress());
  const button = renderer.root.findAllByType('Pressable').find((node) =>
    node.findAllByType('Text').some((text) => /不足食材\d+品を追加/.test(String(text.props.children))));
  assert.ok(button);
  await act(async () => button.props.onPress());
  const confirmation = alerts.at(-1);
  assert.equal(confirmation[0], '不足食材を追加');
  assert.match(confirmation[1], /味噌（大さじ1と1\/2）/);
  assert.doesNotMatch(confirmation[1], /水/);
  await act(async () => confirmation[2].find((option) => option.text === '追加する').onPress());
  for (const name of ['わかめ', '顆粒だし', '味噌']) {
    assert.ok(context.shoppingItems.some((item) => item.name === name));
  }
  assert.ok(!context.shoppingItems.some((item) => item.name === '水'));
  assert.match(context.shoppingItems.find((item) => item.name === '味噌').memo, /大さじ1と1\/2/);
  await act(async () => renderer.unmount());
});

test('preparation water is shown in recipe detail but excluded from consumption controls', async () => {
  reset();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-3' } }, navigation: {} }),
    ));
  });
  await act(async () => context.addFood({
    name: '水', ingredientName: '水', productName: null, tags: [], image: '', category: 'beverages',
    storage: 'room', quantity: 1000, quantityUnit: 'ml', expiryDate: '2099-01-01', purchaseDate: '2026-01-01', memo: '',
  }));
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '調理用に用意'));
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '400ml'));
  const autoSelect = renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  await act(async () => autoSelect.props.onPress());
  const labels = renderer.root.findAllByType('TextInput').map((node) => node.props.accessibilityLabel);
  assert.ok(labels.includes('豆腐の使用量'));
  assert.ok(!labels.includes('水の使用量'));
  assert.equal(context.foods.find((food) => food.name === '水').quantity, 1000);
  await act(async () => renderer.unmount());
});

test('expired inventory is identified in materials but cannot be selected or consumed', async () => {
  reset(); alerts.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-2' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: () => {} } }),
    ));
  });
  const expiredLabel = renderer.root.findAllByType('Text').find((node) =>
    Array.isArray(node.props.children) && node.props.children.join('').includes('期限切れ（使用対象外）'));
  assert.ok(expiredLabel, 'expired milk must not be described as unregistered');
  assert.ok(expiredLabel.props.children.join('').includes('1000ml'));
  const autoSelect = renderer.root.findAllByType('Pressable').find((node) =>
    node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  await act(async () => autoSelect.props.onPress());
  const labels = renderer.root.findAllByType('TextInput').map((node) => node.props.accessibilityLabel);
  assert.ok(labels.includes('卵の使用量'));
  assert.ok(!labels.some((label) => label.includes('牛乳')));
  const submit = renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った');
  await act(async () => submit.props.onPress());
  await act(async () => alerts.at(-1)[2].find((button) => button.text === '記録する').onPress());
  assert.equal(context.foods.find((food) => food.name === '牛乳').quantity, 1000);
  assert.equal(context.foods.find((food) => food.name === '卵').quantity, 8);
  await act(async () => renderer.unmount());
});
test('save failure is visible and retry persists the current changes', async () => {
  reset();
  const renderer = await mount();
  writeFailure = true;
  await act(async () => context.addShoppingItem('テスト用にんじん'));
  assert.match(context.saveError, /保存できません/);
  assert.ok(context.shoppingItems.some((item) => item.name === 'テスト用にんじん'));
  writeFailure = false;
  await act(async () => context.retrySave());
  assert.equal(context.saveError, null);
  assert.ok(JSON.parse(store.get(storageKeys.shopping)).some((item) => item.name === 'テスト用にんじん'));
  await act(async () => renderer.unmount());
});
test('rapid saves cannot finish in reverse order and restore old data', async () => {
  reset();
  holdNextWrite = true;
  const first = saveStoredValue('queue-test', { value: 1 });
  const second = saveStoredValue('queue-test', { value: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);
  releaseWrite();
  await Promise.all([first, second]);
  assert.deepEqual(JSON.parse(store.get('queue-test')), { value: 2 });
});

test('completion callbacks wait for the committed current food, including batched changes', async () => {
  reset(); store.set(storageKeys.foods, '[]');
  const renderer = await mount();
  const confirmed = [];
  holdNextWrite = true;
  let food;
  await act(async () => { food = context.addFood(createSampleFoods()[0], undefined, () => confirmed.push('added')); });
  await new Promise(setImmediate);
  assert.deepEqual(confirmed, []);
  await act(async () => context.updateFood(food.id, { ...food, name: '保存する変更' }, () => confirmed.push('edited')));
  assert.deepEqual(confirmed, []);
  await act(async () => { releaseWrite(); await new Promise(setImmediate); });
  assert.deepEqual(confirmed, ['added', 'edited']);
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].name, '保存する変更');
  await act(async () => context.retrySave());
  assert.deepEqual(confirmed, ['added', 'edited']);
  await act(async () => renderer.unmount());
});

test('failed shopping save produces no completion; retry completes once and duplicate input stays silent', async () => {
  reset(); const renderer = await mount();
  let confirmed = 0; writeFailure = true;
  const warn = console.warn; console.warn = () => {};
  try {
    await act(async () => {
      assert.equal(context.addShoppingItem('完了通知の確認用', undefined, () => confirmed++), true);
      assert.equal(context.addShoppingItem('完了通知の確認用', undefined, () => confirmed++), false);
    });
    assert.equal(confirmed, 0);
    assert.match(context.saveError, /保存できません/);
    writeFailure = false;
    await act(async () => context.retrySave());
    assert.equal(confirmed, 1);
    assert.equal(context.saveError, null);
    await act(async () => context.retrySave());
    assert.equal(confirmed, 1);
  } finally { console.warn = warn; await act(async () => renderer.unmount()); }
});

test('replacing inventory cancels pending completion from the former data', async () => {
  reset(); store.set(storageKeys.foods, '[]');
  const renderer = await mount();
  let confirmed = 0; holdNextWrite = true;
  await act(async () => context.addFood(createSampleFoods()[0], undefined, () => confirmed++));
  await new Promise(setImmediate);
  await act(async () => context.replaceAppData({ foods: [], recipes: context.recipes,
    shoppingItems: context.shoppingItems, notificationSettings: context.notificationSettings }));
  await act(async () => { releaseWrite(); await new Promise(setImmediate); });
  assert.equal(confirmed, 0);
  assert.deepEqual(JSON.parse(store.get(storageKeys.foods)), []);
  await act(async () => renderer.unmount());
});
test('a rejected write does not block the next write for that key', async () => {
  reset(); writeFailure = true;
  await assert.rejects(saveStoredValue('queue-test', 1), /Disk full/);
  writeFailure = false;
  await saveStoredValue('queue-test', 2);
  assert.equal(store.get('queue-test'), '2');
});
test('recording the actual recipe screen keeps remaining cabbage and eggs', async () => {
  reset(); alerts.length = 0;
  let renderer;
  let destination;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => { destination = args; } } }),
    ));
  });
  const autoSelect = renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  await act(async () => autoSelect.props.onPress());
  const cabbageInput = renderer.root.findAllByType('TextInput').find((node) => node.props.accessibilityLabel === 'キャベツの使用量');
  assert.equal(cabbageInput.props.value, '0.25');
  const submit = () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress();
  // A mistyped amount must not remove the stock.
  await act(async () => cabbageInput.props.onChangeText('2'));
  await act(async () => submit());
  assert.equal(alerts.at(-1)[0], '残量より多く入力されています');
  assert.equal(context.foods.find((food) => food.name === 'キャベツ').quantity, 1);
  await act(async () => cabbageInput.props.onChangeText('0.25'));
  await act(async () => submit());
  const buttons = alerts.at(-1)[2];
  await act(async () => buttons.find((button) => button.text === '記録する').onPress());
  const cabbage = context.foods.find((food) => food.name === 'キャベツ');
  assert.equal(cabbage.quantity, 0.75);
  assert.equal(cabbage.status, 'active');
  assert.equal(context.foods.find((food) => food.name === '卵').quantity, 8);
  assert.deepEqual(destination, ['MainTabs', { screen: 'Home' }]);
  assert.equal(JSON.parse(store.get(storageKeys.foods)).find((food) => food.name === 'キャベツ').quantity, 0.75);
  await act(async () => renderer.unmount());
});

test('changing people updates visible quantities and usage, clears stale selections, and records scaled amounts', async (t) => {
  reset(); alerts.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate() {} } }),
    ));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const button = (label) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
  const autoSelect = () => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  const input = (label) => renderer.root.findAllByType('TextInput').find((node) => node.props.accessibilityLabel === label);
  await act(async () => autoSelect().props.onPress());
  assert.equal(input('卵の使用量').props.value, '2');
  await act(async () => button('作る人数を増やす').props.onPress());
  assert.equal(input('卵の使用量'), undefined, 'old selection must not silently use the previous serving count');
  assert.equal(renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.disabled, true);
  await act(async () => button('作る人数を増やす').props.onPress());
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '1/2玉'));
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '小さじ4'));
  await act(async () => autoSelect().props.onPress());
  assert.equal(input('卵の使用量').props.value, '4');
  assert.equal(input('キャベツの使用量').props.value, '0.5');
  assert.equal(context.recipes.find((r) => r.id === 'recipe-4').servings, 2, 'viewing four servings must not overwrite the base');
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress());
  await act(async () => alerts.at(-1)[2].find((option) => option.text === '記録する').onPress());
  assert.equal(context.foods.find((food) => food.name === '卵').quantity, 6);
  assert.equal(context.foods.find((food) => food.name === 'キャベツ').quantity, 0.5);
});

test('recipe detail marks generated images and removes the note when the user replaces the photo', async (t) => {
  reset();
  const original = sampleRecipes.find(recipe => recipe.id === 'recipe-9');
  store.set(storageKeys.recipes, JSON.stringify([{ ...original, image: 'food-icon:other' }]));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: original.id } }, navigation: {} })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const note = () => renderer.root.findAllByType('Text').some(node =>
    node.props.children === 'AI生成のイメージです。実際の調理写真ではありません。');
  assert.equal(note(), true);
  assert.equal(renderer.root.findByType('FoodImage').props.accessibilityLabel, `${original.name}のAI生成イメージ`);
  await act(async () => { context.updateRecipe(original.id, { ...original, image: 'file:///my-photo.jpg' }); });
  assert.equal(note(), false);
  assert.equal(renderer.root.findByType('FoodImage').props.accessibilityLabel, `${original.name}の画像`);
  assert.equal(context.recipes[0].image, 'file:///my-photo.jpg');
});

test('recipe editor validates servings and preserves saved or explicitly unset values after reload', async (t) => {
  reset(); alerts.length = 0;
  let renderer;
  function EditorWhenReady() {
    return useAppData().isReady ? React.createElement(AddRecipeScreen, {
      route: { params: { recipeId: 'recipe-4' } }, navigation: { goBack() {} },
    }) : null;
  }
  const mountEditor = async () => {
    await act(async () => {
      renderer = create(React.createElement(AppDataProvider, null,
        React.createElement(Consumer),
        React.createElement(EditorWhenReady),
      ));
    });
  };
  t.after(async () => { await act(async () => renderer?.unmount()); });
  await mountEditor();
  const field = () => renderer.root.findAllByType('FormField').find((node) => node.props.label === '分量の基準（人分・任意）');
  const save = () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '変更を保存');
  assert.equal(field().props.value, '2');
  await act(async () => field().props.onChangeText('0'));
  await act(async () => save().props.onPress());
  assert.equal(alerts.at(-1)[0], '人数を確認してください');
  assert.equal(context.recipes.find((recipe) => recipe.id === 'recipe-4').servings, 2);
  await act(async () => field().props.onChangeText('３'));
  await act(async () => save().props.onPress());
  assert.equal(JSON.parse(store.get(storageKeys.recipes)).find((recipe) => recipe.id === 'recipe-4').servings, 3);
  await act(async () => renderer.unmount());
  await mountEditor();
  assert.equal(field().props.value, '3');
  await act(async () => field().props.onChangeText(''));
  await act(async () => save().props.onPress());
  await act(async () => renderer.unmount());
  await mountEditor();
  assert.equal(field().props.value, '');
  assert.equal(context.recipes.find((recipe) => recipe.id === 'recipe-4').servings, null, 'clearing a built-in base must survive migration');
});

test('old custom recipes remain unset and restoring backups preserves known serving counts', async (t) => {
  reset();
  const { servings, ...custom } = { ...structuredClone(sampleRecipes[3]), id: 'my-recipe' };
  store.set(storageKeys.recipes, JSON.stringify([custom]));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null,
      React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: custom.id } }, navigation: {} }),
    ));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(context.recipes[0].servings, undefined);
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '人数未設定'));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '作る人数を増やす' }).length, 0);
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '1/4玉'));
  await act(async () => context.replaceAppData({
    foods: context.foods, recipes: [{ ...custom, servings: 5 }], shoppingItems: [], notificationSettings: context.notificationSettings,
  }));
  assert.equal(context.recipes[0].servings, 5);
  assert.equal(JSON.parse(store.get(storageKeys.recipes))[0].servings, 5);
  const increase = renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === '作る人数を増やす');
  await act(async () => increase.props.onPress());
  const resetPeople = renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === '登録の人数に戻す');
  await act(async () => resetPeople.props.onPress());
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '1/4玉'));
});

test('detail adds scaled shopping memos directly, prevents duplicate additions and keeps the recipe base', async (t) => {
  reset();
  store.set(storageKeys.shopping, '[]');
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: {} })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const increase = () => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === '作る人数を増やす');
  await act(async () => increase().props.onPress());
  await act(async () => increase().props.onPress());
  const add = renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '材料2品を買い物に追加');
  await act(async () => add.props.onPress());
  assert.deepEqual(context.shoppingItems.map((item) => item.name), ['醤油', '油']);
  assert.ok(context.shoppingItems.every((item) => /4人分.*必要量：小さじ4/.test(item.memo)));
  assert.equal(renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '対象の材料は追加済み').props.disabled, true);
  await act(async () => increase().props.onPress());
  assert.ok(context.shoppingItems.every((item) => /4人分/.test(item.memo)), 'changing servings must not overwrite existing shopping notes');
  assert.equal(context.recipes.find((item) => item.id === 'recipe-4').servings, 2);
  assert.equal(JSON.parse(store.get(storageKeys.shopping)).length, 2);
});

test('shopping check is reversible without navigation, registration carries the memo, deletion requires confirmation', async (t) => {
  reset(); alerts.length = 0;
  store.set(storageKeys.shopping, JSON.stringify([
    { id: 'buy-egg', name: '卵', checked: false, memo: '「卵料理」4人分 / 必要量：4個', createdAt: '2026-09-24' },
    { id: 'buy-milk', name: '牛乳', checked: true, createdAt: '2026-09-24' },
  ]));
  const destinations = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(ShoppingListScreen, { navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const control = (label) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
  assert.equal(control('牛乳を未購入に戻す'), undefined, 'purchased rows start collapsed');
  await act(async () => control('卵を購入済みにする').props.onPress());
  assert.equal(destinations.length, 0);
  assert.equal(context.shoppingItems[0].checked, true);
  assert.equal(JSON.parse(store.get(storageKeys.shopping))[0].checked, true);
  assert.equal(alerts.length, 0, 'a check must work on Web without a native alert');
  await act(async () => control('購入済み2件').props.onPress());
  await act(async () => control('卵を食材として登録').props.onPress());
  assert.deepEqual(destinations[0], ['AddFood', { initialName: '卵', initialMemo: '「卵料理」4人分 / 必要量：4個', shoppingItemId: 'buy-egg' }]);
  await act(async () => control('卵を未購入に戻す').props.onPress());
  assert.equal(context.shoppingItems[0].checked, false);
  await act(async () => control('買うもの1件').props.onPress());
  await act(async () => control('卵を買い物リストから削除').props.onPress());
  assert.equal(context.shoppingItems.length, 2);
  await act(async () => control('卵の削除をキャンセル').props.onPress());
  assert.equal(context.shoppingItems.length, 2);
  await act(async () => control('卵を買い物リストから削除').props.onPress());
  await act(async () => control('卵の削除を確定').props.onPress());
  assert.deepEqual(context.shoppingItems.map((item) => item.id), ['buy-milk']);
});

test('shopping check offers a saved undo action and returns to the original list without losing other items', async (t) => {
  reset(); store.set(storageKeys.shopping, JSON.stringify([
    { id: 'buy-egg', name: '卵', checked: false, memo: 'このメモを残す', createdAt: '2026-10-15' },
    { id: 'buy-milk', name: '牛乳', checked: false, createdAt: '2026-10-15' },
  ]));
  let renderer, toastState;
  function ToastProbe() { toastState = useToastState(); return null; }
  await act(async () => { renderer = create(React.createElement(AppToastProvider, null,
    React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(ToastProbe),
      React.createElement(ShoppingListScreen, { navigation: {} })))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const control = label => renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label);
  await act(async () => control('卵を購入済みにする').props.onPress());
  assert.match(toastState.toast.message, /卵.*購入済み/); assert.equal(toastState.toast.action.label, '元に戻す');
  const firstId = toastState.toast.id;
  await act(async () => control('購入済み1件').props.onPress());
  assert.ok(control('卵を食材として登録'));
  await act(async () => toastState.runAction(firstId));
  assert.ok(control('卵を購入済みにする')); assert.ok(control('牛乳を購入済みにする'));
  assert.equal(context.shoppingItems[0].memo, 'このメモを残す');
  assert.equal(JSON.parse(store.get(storageKeys.shopping))[0].checked, false);
  await act(async () => toastState.runAction(firstId));
  assert.equal(context.shoppingItems[0].checked, false, 'a repeated old undo cannot toggle it again');
});

test('shopping duplicate feedback is visible on Web and does not clear the input or overwrite its memo', async (t) => {
  reset();
  store.set(storageKeys.shopping, JSON.stringify([{ id: 'egg', name: '卵', checked: false, memo: '既存のメモ', createdAt: '2026-09-24' }]));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(ShoppingListScreen, { navigation: {} })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const input = renderer.root.findByType('TextInput');
  await act(async () => input.props.onChangeText(' 卵 '));
  await act(async () => input.props.onSubmitEditing());
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '「卵」はすでに買うものにあります。'));
  assert.equal(input.props.value, ' 卵 ');
  assert.equal(context.shoppingItems.length, 1);
  assert.equal(context.shoppingItems[0].memo, '既存のメモ');
});

test('a cooking confirmation held across midnight cannot consume newly expired food', async (t) => {
  reset(); alerts.length = 0;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 24, 23, 59, 59) });
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate() {} } })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const egg = context.foods.find((item) => item.name === '卵');
  await act(async () => context.updateFood(egg.id, { ...egg, expiryDate: '2026-09-24' }));
  const autoSelect = renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === '使った分を自動選択'));
  await act(async () => autoSelect.props.onPress());
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress());
  const confirm = alerts.at(-1)[2].find((item) => item.text === '記録する');
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '卵の使用量' }).length, 0, 'detail eligibility must refresh at midnight');
  await act(async () => confirm.onPress());
  assert.equal(alerts.at(-1)[0], '期限を確認してください');
  assert.equal(context.foods.find((item) => item.name === '卵').quantity, 10);
  assert.equal(context.foods.find((item) => item.name === 'キャベツ').quantity, 1);
});

test('web alerts support cancellation, queued messages, and execute a choice only once', async (t) => {
  alerts.length = 0;
  let show;
  function DialogConsumer() { show = useAppAlert(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppAlertProvider, null, React.createElement(DialogConsumer))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  let changes = 0;
  const button = (label) => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === label));
  await act(async () => show('削除の確認', '元には戻せません', [
    { text: '削除する', style: 'destructive', onPress: () => { changes++; } },
    { text: 'キャンセル', style: 'cancel' },
  ]));
  assert.equal(alerts.length, 0, 'web must render a dialog rather than call native Alert');
  assert.equal(renderer.root.findAllByType('Pressable')[0], button('キャンセル'), 'safe option receives initial keyboard focus');
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.equal(changes, 0);
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => {
    show('確認', '', [{ text: '実行', onPress: () => { changes++; show('完了しました'); } }]);
    show('先に届いたお知らせ');
  });
  const press = button('実行').props.onPress;
  await act(async () => { press(); press(); });
  assert.equal(changes, 1);
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '先に届いたお知らせ' }));
  await act(async () => button('OK').props.onPress());
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '完了しました' }));
  await act(async () => button('OK').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
});

test('web dismiss respects noncancelable dialogs and never chooses a destructive action', async (t) => {
  let show;
  function DialogConsumer() { show = useAppAlert(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppAlertProvider, null, React.createElement(DialogConsumer))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  let changes = 0;
  let dismissed = 0;
  await act(async () => show('確認', '', [{ text: '確定', style: 'destructive', onPress: () => { changes++; } }], { cancelable: false }));
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.equal(renderer.root.findAllByType('Modal').length, 1);
  assert.equal(changes, 0);
  await act(async () => renderer.root.findByType('Pressable').props.onPress());
  assert.equal(changes, 1);
  await act(async () => show('確認', '', [{ text: '確定', style: 'destructive', onPress: () => { changes++; } }], { onDismiss: () => { dismissed++; } }));
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.equal(changes, 1);
  assert.equal(dismissed, 1);
});

test('device alerts preserve native options and callbacks', async (t) => {
  alerts.length = 0;
  nativeMock.Platform.OS = 'ios';
  t.after(() => { nativeMock.Platform.OS = 'web'; });
  let show, visible;
  function DialogConsumer() { show = useAppAlert(); visible = useIsAppAlertVisible(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppAlertProvider, null, React.createElement(DialogConsumer))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  let pressed = 0;
  const buttons = [{ text: '取消', style: 'cancel', onPress() { pressed++; } }];
  const options = { cancelable: false };
  await act(async () => show('端末の確認', '本文', buttons, options));
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['端末の確認', '本文']);
  assert.equal(alerts.at(-1)[2][0].text, '取消');
  assert.equal(alerts.at(-1)[2][0].style, 'cancel');
  assert.equal(alerts.at(-1)[3].cancelable, false);
  assert.equal(visible, true);
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => { alerts.at(-1)[2][0].onPress(); alerts.at(-1)[2][0].onPress(); });
  assert.equal(visible, false); assert.equal(pressed, 1);
  let dismissed = 0;
  await act(async () => show('キャンセル可能', '本文', undefined, { onDismiss() { dismissed++; } }));
  await act(async () => { alerts.at(-1)[3].onDismiss(); alerts.at(-1)[3].onDismiss(); });
  assert.equal(visible, false); assert.equal(dismissed, 1);
});

test('web cooking dialog cancels without changes and records a partial amount once after confirmation', async (t) => {
  reset(); alerts.length = 0;
  const destinations = [];
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppAlertProvider, null,
      React.createElement(AppDataProvider, null, React.createElement(Consumer),
        React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } }))));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const button = (label) => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === label));
  await act(async () => button('使った分を自動選択').props.onPress());
  const cook = () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'このレシピを作った').props.onPress();
  await act(async () => cook());
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '調理内容を記録' }));
  await act(async () => button('キャンセル').props.onPress());
  assert.equal(context.foods.find((food) => food.name === '卵').quantity, 10);
  assert.equal(destinations.length, 0);
  await act(async () => cook());
  const record = button('記録する').props.onPress;
  await act(async () => { record(); record(); });
  assert.equal(context.foods.find((food) => food.name === '卵').quantity, 8);
  assert.equal(context.foods.find((food) => food.name === 'キャベツ').quantity, 0.75);
  assert.equal(JSON.parse(store.get(storageKeys.foods)).find((food) => food.name === '卵').quantity, 8);
  assert.equal(destinations.length, 1);
  assert.equal(alerts.length, 0);
});

test('calendar refreshes at midnight and today returns from another month without changing stock', async (t) => {
  reset();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 30, 23, 59, 59) });
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(CalendarScreen, { navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const egg = context.foods.find((food) => food.name === '卵');
  await act(async () => context.updateFood(egg.id, { ...egg, expiryDate: '2026-09-30' }));
  const upcomingEgg = () => renderer.root.findAllByType('Text').some((text) => [text.props.children].flat().join('') === '卵の期限');
  assert.equal(upcomingEgg(), true);
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(upcomingEgg(), false, 'expired food leaves upcoming without user interaction');
  const control = (label) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
  await act(async () => control('前の月').props.onPress());
  await act(async () => control('今日の日付を表示').props.onPress());
  const today = renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel?.startsWith('10月1日、'));
  assert.equal(today.props.accessibilityState.selected, true);
  assert.equal(context.foods.find((food) => food.id === egg.id).expiryDate, '2026-09-30');
});

test('detail recalculates shortage with servings and adds a quantity memo without altering stock', async (t) => {
  reset();
  store.set(storageKeys.shopping, JSON.stringify(['醤油', '油'].map((name) => ({ id: name, name, checked: false, createdAt: '2026-09-25' }))));
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
      React.createElement(RecipeDetailScreen, { route: { params: { recipeId: 'recipe-4' } }, navigation: {} })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const egg = context.foods.find((food) => food.name === '卵');
  await act(async () => context.updateFood(egg.id, { ...egg, quantity: 1, expiryDate: '2099-01-01' }));
  const hasText = (value) => renderer.root.findAllByType('Text').some((node) => node.props.children === value);
  assert.ok(hasText('あと1個必要'));
  const increase = renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === '作る人数を増やす');
  await act(async () => increase.props.onPress());
  assert.ok(hasText('あと2個必要'));
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '材料1品を買い物に追加').props.onPress());
  assert.match(context.shoppingItems.find((item) => item.name === '卵').memo, /3人分.*不足分：2個/);
  assert.equal(context.foods.find((food) => food.id === egg.id).quantity, 1);
  await act(async () => increase.props.onPress());
  assert.ok(hasText('あと3個必要'));
  assert.match(context.shoppingItems.find((item) => item.name === '卵').memo, /3人分.*不足分：2個/);
  assert.ok(hasText('追加済みの分量は買い物リストで確認できます。'));
});

test('recipe list distinguishes measured availability from shortages and offers the missing quantity', async (t) => {
  reset(); alerts.length = 0;
  const base = { ...sampleRecipes[3], image: '', ingredients: ['卵'], ingredientAmounts: { 卵: '2個' } };
  store.set(storageKeys.recipes, JSON.stringify([base]));
  store.set(storageKeys.shopping, '[]');
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(RecipesScreen, { navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const egg = context.foods.find((food) => food.name === '卵');
  await act(async () => context.updateFood(egg.id, { ...egg, quantity: 1, expiryDate: '2099-01-01' }));
  const button = (label) => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((text) => text.props.children === label));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: `${base.name}の材料の確認` }).props.onPress());
  await act(async () => button('不足食材1品を追加').props.onPress());
  assert.match(alerts.at(-1)[1], /卵（あと1個必要）/);
  await act(async () => alerts.at(-1)[2].find((item) => item.text === '追加する').onPress());
  assert.match(context.shoppingItems[0].memo, /不足分：1個/);
  await act(async () => button('絞り込み').props.onPress());
  await act(async () => button('分量あり').props.onPress());
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === '条件に合うレシピがありません'));
  await act(async () => context.updateFood(egg.id, { ...egg, quantity: 2, expiryDate: '2099-01-01' }));
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === base.name));
});

test('recent foods keep the newest same-name settings, search products, and include consumed history', () => {
  const base = createSampleFoods()[0];
  const old = { ...base, id: 'old', name: '牛乳', createdAt: '2025-01-01', storage: 'room' };
  const newest = { ...base, id: 'new', name: ' 牛乳 ', createdAt: '2026-01-01', status: 'used', storage: 'refrigerated' };
  const different = { ...base, id: 'different', name: '牛乳', productName: '別メーカーの牛乳', createdAt: '2025-06-01' };
  assert.deepEqual(getRecentFoods([old, newest, different]).map((food) => food.id), ['new', 'different']);
  assert.deepEqual(getRecentFoods([old, newest, different], '別メーカー').map((food) => food.id), ['different']);
  assert.equal(getRecentFoods([old, newest, different], '', 1)[0].storage, 'refrigerated');
  assert.deepEqual(getRecentFoods([old], '見つからない'), []);
});

test('repeat registration carries settings but starts fresh quantity, dates, memo, image and lifecycle', async (t) => {
  reset();
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 25, 12) });
  const original = { ...createSampleFoods()[0], id: 'previous', quantity: 150, quantityUnit: 'ml', storage: 'frozen', expiryDate: '2025-01-02', purchaseDate: '2025-01-01', memo: '開封済み', image: 'file:///private/old-food.jpg', tags: ['牛乳', 'いつもの商品'], status: 'used', usedAt: '2025-01-02' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  const navigation = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: { reuseFoodId: original.id } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => navigation.push(args) } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const quantity = renderer.root.findByProps({ accessibilityLabel: '今回の購入量' });
  assert.equal(quantity.props.value, '');
  assert.equal(renderer.root.findAllByType('FoodImagePicker').length, 0);
  await act(async () => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((label) => label.props.children === '写真・カテゴリ・購入日・メモを編集')).props.onPress());
  assert.equal(renderer.root.findAllByType('DatePickerField').find((node) => node.props.label === '購入日').props.value, '2026-09-25');
  assert.notEqual(renderer.root.findAllByType('DatePickerField').find((node) => node.props.label === '期限日').props.value, original.expiryDate);
  assert.equal(renderer.root.findAllByType('FormField').find((node) => node.props.label === 'メモ（任意）').props.value, '');
  const save = () => renderer.root.findByType('PrimaryButton').props.onPress();
  await act(async () => save());
  assert.equal(context.foods.length, 1, 'old remaining quantity must not silently become a new purchase');
  await act(async () => quantity.props.onChangeText('1000'));
  await act(async () => renderer.root.findAllByType('DatePickerField').find((node) => node.props.label === '期限日').props.onChange('2026-10-01'));
  await act(async () => save());
  assert.equal(context.foods.length, 2);
  const added = context.foods.find((food) => food.id !== original.id);
  assert.equal(added.quantity, 1000);
  assert.equal(added.quantityUnit, 'ml');
  assert.equal(added.storage, 'frozen');
  assert.equal(added.name, original.productName || original.name);
  assert.equal(added.productName, original.productName);
  assert.equal(added.ingredientName, original.ingredientName);
  assert.equal(added.category, original.category);
  assert.ok(added.tags.includes('いつもの商品'));
  assert.notEqual(added.image, original.image, 'new record must not share a deletable local photo with history');
  assert.equal(added.expiryDate, '2026-10-01');
  assert.equal(added.purchaseDate, '2026-09-25');
  assert.equal(added.status, 'active');
  assert.equal(added.usedAt, null);
  assert.deepEqual(context.foods.find((food) => food.id === original.id), original);
  assert.equal(JSON.parse(store.get(storageKeys.foods)).length, 2);
  assert.equal(navigation.length, 1);
});

test('choosing a previous registration retains incoming shopping memo and calendar date', async (t) => {
  reset();
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: { initialName: '卵', initialMemo: '買い物のメモ', initialExpiryDate: '2026-12-01' } }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const press = (text) => renderer.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').some((label) => label.props.children === text));
  await act(async () => press('前の登録から選ぶ').props.onPress());
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '前の登録を検索' }).props.value, '卵');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '前の登録を検索' }).props.onChangeText('牛乳'));
  await act(async () => press('前の登録から選ぶ').props.onPress());
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '前の登録を検索' }).length, 0);
  await act(async () => press('前の登録から選ぶ').props.onPress());
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '前の登録を検索' }).props.value, '牛乳');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '前の登録を検索' }).props.onChangeText('卵'));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '卵の前回の設定を使う' }).props.onPress());
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '今回の購入量' }).props.value, '');
  assert.equal(renderer.root.findAllByType('DatePickerField').find((node) => node.props.label === '期限日').props.value, '2026-12-01');
  assert.equal(renderer.root.findAllByType('FormField').filter((node) => node.props.label === 'メモ（任意）').length, 0);
  await act(async () => press('写真・カテゴリ・購入日・メモを編集').props.onPress());
  assert.equal(renderer.root.findAllByType('FormField').find((node) => node.props.label === 'メモ（任意）').props.value, '買い物のメモ');
  await act(async () => renderer.root.findAllByType('FormField').find((node) => node.props.label === 'メモ（任意）').props.onChangeText('追記した買い物のメモ'));
  await act(async () => press('その他の項目を閉じる').props.onPress());
  assert.equal(renderer.root.findAllByType('FormField').filter((node) => node.props.label === 'メモ（任意）').length, 0);
  await act(async () => press('写真・カテゴリ・購入日・メモを編集').props.onPress());
  assert.equal(renderer.root.findAllByType('FormField').find((node) => node.props.label === 'メモ（任意）').props.value, '追記した買い物のメモ');
  assert.equal(renderer.root.findByType('StorageSelector').props.value, 'refrigerated');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '数量の単位を変更（個）' }).props.onPress());
  assert.equal(renderer.root.findByType('QuantityUnitSelector').props.value, 'piece');
});

test('a long barcode product name expands fully, follows edits and saves without truncation', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  const oldPlatform = nativeMock.Platform.OS;
  nativeMock.Platform.OS = 'ios';
  t.after(() => { nativeMock.Platform.OS = oldPlatform; });
  const initialName = 'テストレモン お菓子のまとめ買いセット 商品名の最後まで確認';
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {
      initialBarcode: '4901625421798', initialProductName: initialName, initialLookupSource: 'yahoo-shopping',
    } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate() {} } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const field = () => renderer.root.findAllByType('FormField').find(node => node.props.label === '食材名・商品名');
  const preview = () => renderer.root.findAllByProps({ testID: 'food-name-full-text' });
  assert.equal(preview().length, 0);
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '食材名・商品名の全文を見る' }).props.accessibilityState.expanded, false);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '食材名・商品名の全文を見る' }).props.onPress());
  assert.equal(preview()[0].props.children, initialName);
  assert.equal(preview()[0].props.numberOfLines, undefined);
  assert.equal(preview()[0].props.selectable, true);
  const editedName = initialName + ' 名前を編集しました';
  await act(async () => field().props.onChangeText(editedName));
  assert.equal(preview()[0].props.children, editedName);
  assert.equal(context.foods.length, 0, 'previewing and editing must not register food');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '食材名・商品名の全文を閉じる' }).props.onPress());
  assert.equal(preview().length, 0);
  assert.equal(field().props.value, editedName);
  await act(async () => renderer.root.findAllByType('PrimaryButton').find(node => node.props.label === '保存する').props.onPress());
  assert.equal(context.foods.length, 1);
  assert.equal(context.foods[0].name, editedName);
  assert.equal(JSON.parse(store.get(storageKeys.foods))[0].name, editedName);
});

test('short or empty food names keep the compact form, and manually entered long names can expand', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {} }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const field = () => renderer.root.findAllByType('FormField').find(node => node.props.label === '食材名・商品名');
  const toggles = () => renderer.root.findAllByType('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('食材名・商品名の全文'));
  assert.equal(toggles().length, 0);
  await act(async () => field().props.onChangeText('牛乳'));
  assert.equal(toggles().length, 0);
  const longName = '自分で入力した食材の商品名も最後の一文字まで確認します';
  await act(async () => field().props.onChangeText(longName));
  await act(async () => toggles()[0].props.onPress());
  assert.equal(renderer.root.findByProps({ testID: 'food-name-full-text' }).props.children, longName);
  await act(async () => field().props.onChangeText('  '));
  assert.equal(toggles().length, 0);
  assert.equal(renderer.root.findAllByProps({ testID: 'food-name-full-text' }).length, 0);
  assert.equal(context.foods.length, 0);
});

test('quick food registration preserves chosen dates and quantities while changing units and saves once', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 14, 12) });
  const destinations = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {} }, navigation: {
      getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args),
    } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const name = () => renderer.root.findAllByType('FormField').find(node => node.props.label === '食材名・商品名');
  const control = label => renderer.root.findByProps({ accessibilityLabel: label });
  await act(async () => name().props.onChangeText('牛乳'));
  assert.equal(control('残量').props.value, '1000');
  assert.equal(renderer.root.findAllByType('FormField').some(node => node.props.label === 'レシピ用分類'), false);
  assert.ok(control('レシピ用分類を変更'));
  await act(async () => control('期限を明日にする').props.onPress());
  assert.equal(renderer.root.findAllByType('DatePickerField').find(node => node.props.label === '期限日').props.value, '2026-10-15');
  await act(async () => control('数量の単位を変更（ml）').props.onPress());
  await act(async () => renderer.root.findByType('QuantityUnitSelector').props.onChange('pack'));
  assert.equal(renderer.root.findAllByType('QuantityUnitSelector').length, 0, 'unit choices close after selection');
  await act(async () => control('残量').props.onChangeText('2'));
  await act(async () => name().props.onChangeText('豆腐'));
  assert.equal(control('残量').props.value, '2');
  assert.ok(control('数量の単位を変更（パック）'));
  const save = renderer.root.findByType('PrimaryButton').props.onPress;
  await act(async () => { await save(); await save(); });
  assert.equal(context.foods.length, 1);
  assert.equal(context.foods[0].name, '豆腐');
  assert.equal(context.foods[0].quantity, 2);
  assert.equal(context.foods[0].quantityUnit, 'pack');
  assert.equal(context.foods[0].expiryDate, '2026-10-15');
  assert.equal(JSON.parse(store.get(storageKeys.foods)).length, 1);
  assert.equal(destinations.length, 1);
});

test('unknown classifications and cleared classification errors remain visible in the shorter form', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {} }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const field = label => renderer.root.findAllByType('FormField').find(node => node.props.label === label);
  await act(async () => field('食材名・商品名').props.onChangeText('未知の調理品XYZ'));
  assert.ok(field('レシピ用分類'), 'uncertain automatic classifications must not be hidden');
  await act(async () => field('レシピ用分類').props.onChangeText('調'));
  assert.equal(field('レシピ用分類').props.value, '調', 'classification editor must stay open while typing');
  await act(async () => field('レシピ用分類').props.onChangeText(''));
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods.length, 0);
  assert.equal(field('レシピ用分類').props.error, 'レシピ用分類を入力してください。');
  await act(async () => field('レシピ用分類').props.onChangeText('調理品'));
  await act(async () => field('食材名・商品名').props.onChangeText('別の商品名'));
  assert.equal(field('レシピ用分類').props.value, '調理品', 'explicit classification must survive a product-name edit');
});

test('recent food shortcuts are immediately available and never carry a previous purchase quantity', async (t) => {
  reset();
  const previous = { ...createSampleFoods()[0], id: 'recent-milk', quantity: 150, expiryDate: '2000-01-01' };
  store.set(storageKeys.foods, JSON.stringify([previous]));
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {} }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '前の登録を検索' }).length, 0);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: `${previous.productName || previous.name}の前回の設定を使う` }).props.onPress());
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '今回の購入量' }).props.value, '');
  assert.notEqual(renderer.root.findAllByType('DatePickerField').find(node => node.props.label === '期限日').props.value, previous.expiryDate);
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods.length, 1, 'a blank new purchase quantity must not be saved');
});

test('expiry shortcuts follow local midnight and do not silently replace an explicitly chosen date', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 9, 14, 23, 59, 59) });
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: { initialName: '卵' } }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const date = () => renderer.root.findAllByType('DatePickerField').find(node => node.props.label === '期限日').props.value;
  const today = () => renderer.root.findByProps({ accessibilityLabel: '期限を今日にする' });
  await act(async () => today().props.onPress());
  assert.equal(date(), '2026-10-14');
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(date(), '2026-10-14');
  assert.equal(today().props.accessibilityState.selected, false);
  await act(async () => today().props.onPress());
  assert.equal(date(), '2026-10-15');
});

test('editing a food retains its values and manual entry does not get replaced by previous registrations', async (t) => {
  reset();
  const original = createSampleFoods()[0];
  store.set(storageKeys.foods, JSON.stringify([original]));
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: { foodId: original.id, reuseFoodId: original.id } }, navigation: {} }))); });
  assert.equal(renderer.root.findByProps({ accessibilityLabel: '残量' }).props.value, String(original.quantity));
  assert.equal(renderer.root.findAllByType('DatePickerField').find((node) => node.props.label === '期限日').props.value, original.expiryDate);
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(AddFoodScreen, { route: { params: {} }, navigation: {} }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.root.findAllByType('FormField').find((node) => node.props.label === '食材名・商品名').props.onChangeText('手入力の食材'));
  assert.equal(renderer.root.findAllByType('Text').filter((node) => node.props.children === '前の登録から選ぶ').length, 0);
  assert.equal(renderer.root.findAllByType('FormField').find((node) => node.props.label === '食材名・商品名').props.value, '手入力の食材');
});

test('food detail reopens used history as a separate new registration', async (t) => {
  reset();
  const original = { ...createSampleFoods()[0], status: 'used', usedAt: '2026-09-24' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  const destinations = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(FoodDetailScreen, { route: { params: { foodId: original.id } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === 'もう一度登録する').props.onPress());
  assert.deepEqual(destinations, [['AddFood', { reuseFoodId: original.id }]]);
  assert.deepEqual(context.foods, [original]);
});

async function mountSharedForm(t, params = {}) {
  reset();
  store.set(storageKeys.foods, '[]');
  const destinations = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { route: { params: {
      initialBarcode: '4901234567887', allowProductSharing: true,
      initialName: '共有テスト牛乳', initialIngredientName: '牛乳', initialCategory: '乳製品',
      initialMemo: 'PRIVATE memo', initialStorage: 'frozen', ...params,
    } }, navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } })));
  });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return { renderer, destinations, save: () => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '保存する').props.onPress() };
}

test('sharing is opt-in; saving without consent never publishes a product', async (t) => {
  const { renderer, save, destinations } = await mountSharedForm(t);
  const choice = renderer.root.findByProps({ accessibilityRole: 'checkbox' });
  assert.equal(choice.props.accessibilityState.checked, false);
  assert.match(choice.props.accessibilityLabel, /投稿ルールに同意/);
  assert.equal(renderer.root.findAllByType('SharedProductRules').length, 1);
  await act(async () => save());
  assert.equal(sharedPayloads.length, 0);
  assert.equal(context.foods.length, 1);
  assert.equal(context.foods[0].memo, 'PRIVATE memo');
  assert.equal(destinations.length, 1);
});

test('failed sharing keeps food saved; retry and double taps never duplicate the inventory', async (t) => {
  const { renderer, save } = await mountSharedForm(t);
  await act(async () => renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress());
  shareFailure = true;
  await act(async () => { await Promise.all([save(), save()]); });
  assert.equal(context.foods.length, 1);
  assert.equal(JSON.parse(store.get(storageKeys.foods)).length, 1);
  assert.deepEqual(sharedPayloads, [{ barcode: '4901234567887', name: '共有テスト牛乳', ingredientName: '牛乳', category: 'dairy' }]);
  assert.equal(context.foods[0].storage, 'frozen');
  const retry = renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === '商品情報の共有を再試行').props.onPress;
  shareFailure = false;
  await act(async () => { retry(); retry(); });
  assert.equal(sharedPayloads.length, 2);
  assert.deepEqual(sharedPayloads[0], sharedPayloads[1]);
  assert.equal(context.foods.length, 1);
  assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('管理者の確認後に公開')));
});

test('external product registration does not offer to republish provider data', async (t) => {
  const { renderer, save } = await mountSharedForm(t, { allowProductSharing: false });
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: 'checkbox' }).length, 0);
  await act(async () => save());
  assert.equal(sharedPayloads.length, 0);
  assert.equal(context.foods.length, 1);
});

test('invalid public product text is checked before any local save or publication', async (t) => {
  const { renderer, save } = await mountSharedForm(t, { initialName: 'あ'.repeat(121) });
  await act(async () => renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress());
  await act(async () => save());
  assert.equal(context.foods.length, 0);
  assert.equal(sharedPayloads.length, 0);
  assert.equal(alerts.at(-1)[0], '共有する商品情報を確認してください');
  await act(async () => renderer.root.findByProps({ accessibilityRole: 'checkbox' }).props.onPress());
  await act(async () => save());
  assert.equal(context.foods.length, 1, 'opting out still allows private names');
});

test('barcode manual entry focuses the empty name, keeps the lookup notice and can return to scanning without saving', async (t) => {
  reset();
  store.set(storageKeys.foods, JSON.stringify([createSampleFoods()[0]]));
  let renderer, returned = 0;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { navigation: { goBack: () => returned++ }, route: { params: {
      initialBarcode: '4901234567887', initialLookupSource: 'none',
      initialLookupNotice: '商品検索が混み合っています。60秒ほど待つか、手入力してください。',
    } } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const name = renderer.root.findAllByType('FormField').find(node => node.props.label === '食材名・商品名');
  assert.equal(name.props.autoFocus, true); assert.equal(name.props.value, '');
  assert.ok(renderer.root.findAllByType('Text').some(node => String(node.props.children).includes('60秒')));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'バーコードを読み取り直す' }).props.onPress());
  assert.equal(returned, 1); assert.equal(context.foods.length, 1); assert.equal(savedProducts.length, 0);
});

test('ignoring shared information clears its fields in the same form while preserving the barcode and requiring manual input', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate() {} }, route: { params: {
      initialBarcode: '4901234567887', initialLookupSource: 'shared', initialName: '共有テスト牛乳', initialProductName: '共有テスト牛乳',
      initialIngredientName: '牛乳', initialCategory: '乳製品', initialTags: ['共有テスト'], initialImage: 'https://example.com/shared-image.jpg',
      initialMemo: 'バーコード: 4901234567887', allowProductSharing: false,
    } } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const field = label => renderer.root.findAllByType('FormField').find(node => node.props.label === label);
  assert.equal(context.foods.length, 0, 'lookup alone does not save');
  assert.equal(field('食材名・商品名').props.value, '共有テスト牛乳');
  await act(async () => renderer.root.findByType('SharedProductReport').props.onIgnore());
  assert.equal(field('食材名・商品名').props.value, ''); assert.equal(field('食材名・商品名').props.autoFocus, true);
  assert.equal(renderer.root.findAllByType('SharedProductReport').length, 0);
  assert.equal(renderer.root.findAllByType('ProductAttribution').length, 0);
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods.length, 0, 'blank ignored fields cannot be saved');
  await act(async () => field('食材名・商品名').props.onChangeText('卵'));
  await act(async () => renderer.root.findByType('PrimaryButton').props.onPress());
  assert.equal(context.foods.length, 1); assert.equal(context.foods[0].barcode, '4901234567887');
  assert.equal(context.foods[0].ingredientName, '卵'); assert.ok(!context.foods[0].tags.includes('共有テスト'));
  assert.notEqual(context.foods[0].image, 'https://example.com/shared-image.jpg');
  assert.equal(sharedPayloads.length, 0, 'ignored metadata is not republished');
});

test('external lookup attribution is available in registration without a shared DB report or automatic save', async (t) => {
  reset(); store.set(storageKeys.foods, '[]');
  const source = { provider: 'yahoo-shopping', barcode: '4901234567887', productUrl: 'https://shopping.yahoo.co.jp/', fetchedAt: '2026-10-14T00:00:00.000Z' };
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer),
    React.createElement(AddFoodScreen, { navigation: {}, route: { params: { initialBarcode: source.barcode,
      initialLookupSource: 'yahoo-shopping', initialProductName: '牛乳', initialIngredientName: '牛乳', initialProductSource: source,
    } } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(context.foods.length, 0); assert.equal(savedProducts.length, 0);
  assert.equal(renderer.root.findAllByType('SharedProductReport').length, 0);
  assert.deepEqual(renderer.root.findByType('ProductAttribution').props.source, source);
  assert.equal(renderer.root.findAllByType('FormField').find(node => node.props.label === '食材名・商品名').props.autoFocus, false);
});

test('phase 4 shopping registration shows its linked food and prevents repeating the same purchase in the UI', async (t) => {
  reset();
  store.set(storageKeys.shopping, JSON.stringify([{ id: 'purchase-1', name: '卵', checked: true, createdAt: '2026-09-30' }]));
  const original = { ...createSampleFoods()[0], id: 'linked-food', sourceShoppingItemId: 'purchase-1' };
  store.set(storageKeys.foods, JSON.stringify([original]));
  const destinations = []; let renderer;
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Consumer), React.createElement(ShoppingListScreen, { navigation: { getState: () => ({ index: 1 }), popToTop() {}, navigate: (...args) => destinations.push(args) } }))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const control = (label) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
  await act(async () => control('購入済み1件').props.onPress());
  assert.equal(control('卵を食材として登録'), undefined);
  assert.equal(control('卵は食材に登録済み').props.disabled, true);
  await act(async () => control('卵の登録済み食材を確認').props.onPress());
  assert.deepEqual(destinations, [['FoodDetail', { foodId: 'linked-food' }]]);
});
