require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const product = { barcode: '4901234567887', name: '共有テスト牛乳', ingredientName: '牛乳', category: '乳製品', storage: 'refrigerated', tags: [], image: 'test' };
let source = 'shared';
let failure = false;
let release;
let hold = false;
const reports = [];
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    Image: { resolveAssetSource: () => ({ uri: 'test' }) },
    StyleSheet: { create: (value) => value },
    ActivityIndicator: 'ActivityIndicator', TextInput: 'TextInput', ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text', View: 'View',
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === '@react-navigation/native') return { useIsFocused: () => true };
  if (request.endsWith('/services/productLookupService')) return { lookupProductByBarcode: async () => ({ product, source }) };
  if (request.endsWith('/services/openFoodFactsService')) return { ProductLookupRateLimitError: class extends Error {} };
  if (request.endsWith('/services/sharedProductService')) return {
    isSharedProductsConfigured: () => true,
    reportSharedProduct: async (barcode, reason) => {
      reports.push({ barcode, reason });
      if (hold) await new Promise((resolve) => { release = resolve; });
      if (failure) throw new Error('offline');
    },
  };
  const name = request.split('/').at(-1);
  if (['PrimaryButton', 'Screen', 'ScreenHeader', 'BarcodeScanner', 'FoodImage', 'ProductAttribution'].includes(name)) {
    return { [name]: (props) => React.createElement(name, props) };
  }
  return load.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { BarcodeScreen } = require('../src/screens/BarcodeScreen.tsx');
const { SharedProductRules } = require('../src/components/SharedProductRules.tsx');

async function screen(t) {
  reports.length = 0; failure = false; hold = false;
  const destinations = [];
  let renderer;
  await act(async () => { renderer = create(React.createElement(BarcodeScreen, { navigation: { navigate: (...args) => destinations.push(args) } })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.root.findByType('BarcodeScanner').props.onScanned({ data: product.barcode, type: 'ean13' }));
  const button = (label) => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === label);
  const reason = (label) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
  return { renderer, destinations, button, reason };
}

test('a shared lookup can be ignored without copying shared fields or sending a report', async (t) => {
  source = 'shared';
  const { button, destinations } = await screen(t);
  await act(async () => button('共有情報を使わずに手入力').props.onPress());
  assert.equal(reports.length, 0);
  const [route, params] = destinations[0];
  assert.equal(route, 'AddFood'); assert.equal(params.initialBarcode, product.barcode);
  for (const field of ['initialName', 'initialProductName', 'initialIngredientName', 'initialImage', 'initialCategory', 'initialTags', 'initialStorage']) assert.equal(params[field], undefined, field);
  assert.equal(params.allowProductSharing, false, 'a conflict correction is not blindly republished');
});

test('report cancellation sends nothing; a failed report can retry without double submission or registering food', async (t) => {
  source = 'shared';
  const { renderer, destinations, button, reason } = await screen(t);
  await act(async () => button('この商品情報を通報する').props.onPress());
  assert.equal(button('この理由で通報する').props.disabled, true);
  await act(async () => reason('個人情報が含まれている').props.onPress());
  await act(async () => button('通報をやめる').props.onPress());
  assert.equal(reports.length, 0);
  await act(async () => button('この商品情報を通報する').props.onPress());
  failure = true;
  await act(async () => button('この理由で通報する').props.onPress());
  assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('送信できませんでした')));
  failure = false; hold = true;
  const submit = button('この理由で通報する').props.onPress;
  await act(async () => { submit(); submit(); });
  assert.equal(button('送信中...').props.disabled, true);
  assert.equal(reports.length, 2);
  await act(async () => { release(); });
  assert.deepEqual(reports, Array(2).fill({ barcode: product.barcode, reason: 'personal_information' }));
  assert.equal(destinations.length, 0);
  assert.equal(button('この理由で通報する'), undefined);
  assert.ok(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('通報を受け付けました')));
});

test('external provider results do not offer a shared DB report', async (t) => {
  source = 'yahoo-shopping';
  const { button } = await screen(t);
  assert.equal(button('この商品情報を通報する'), undefined);
  assert.equal(button('共有情報を使わずに手入力'), undefined);
});

test('posting rules explain permitted use, moderation and prohibited content', async (t) => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(SharedProductRules)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const text = renderer.root.findAllByType('Text').map((node) => [node.props.children].flat().join('')).join('\n');
  assert.match(text, /検索・登録補助/); assert.match(text, /共有は任意/);
  assert.match(text, /氏名・住所・連絡先/); assert.match(text, /コピーした文章/);
  assert.match(text, /管理者の確認後/); assert.match(text, /2026-10-01/);
});
