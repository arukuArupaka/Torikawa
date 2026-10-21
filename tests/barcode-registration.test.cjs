require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const product = { barcode: '4901234567887', name: 'テスト牛乳', ingredientName: '牛乳', category: '乳製品',
  storage: 'refrigerated', tags: ['牛乳'], image: 'food-icon:milk',
  productSource: { provider: 'yahoo-shopping', barcode: '4901234567887', productUrl: 'https://shopping.yahoo.co.jp/', fetchedAt: '2026-10-14T00:00:00.000Z' } };
class RateLimitError extends Error {}
let focused, epoch, lookup, lookupCalls, dismissed;
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    Image: { resolveAssetSource: () => ({ uri: 'test' }) }, StyleSheet: { create: value => value },
    Keyboard: { dismiss: () => dismissed++ }, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable',
    Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', View: 'View',
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === '@react-navigation/native') return {
    useIsFocused: () => focused,
    useFocusEffect: callback => React.useEffect(() => focused ? callback() : undefined, [callback, focused]),
  };
  if (request.endsWith('/services/productLookupService')) return {
    lookupProductByBarcode: async barcode => { lookupCalls.push(barcode); return lookup(barcode); },
  };
  if (request.endsWith('/services/storage')) return {
    getStorageEpoch: () => epoch, assertStorageEpoch: expected => { if (epoch !== expected) throw new Error('restored'); },
  };
  if (request.endsWith('/services/openFoodFactsService')) return { ProductLookupRateLimitError: RateLimitError };
  if (request.endsWith('/services/sharedProductService')) return { isSharedProductsConfigured: () => false };
  if (request.endsWith('/services/yahooProductLookupService')) return { isYahooProductLookupConfigured: () => false };
  const name = request.split('/').at(-1);
  if (['PrimaryButton', 'Screen', 'ScreenHeader', 'BarcodeScanner'].includes(name)) return { [name]: props => React.createElement(name, props) };
  return load.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { BarcodeScreen } = require('../src/screens/BarcodeScreen.tsx');

async function mount(t) {
  focused = true; epoch = 0; lookupCalls = []; dismissed = 0;
  lookup = async () => ({ product, source: 'learned' });
  const destinations = [];
  const navigation = { navigate: (...args) => destinations.push(args) };
  let renderer;
  await act(async () => { renderer = create(React.createElement(BarcodeScreen, { navigation })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    renderer, destinations,
    scan: (data = product.barcode, type = 'ean13') => renderer.root.findByType('BarcodeScanner').props.onScanned({ data, type }),
    async focus(value) {
      focused = value;
      await act(async () => renderer.update(React.createElement(BarcodeScreen, { navigation })));
    },
  };
}

test('a found barcode opens the editable registration form directly with source and learned defaults', async t => {
  const { scan, destinations } = await mount(t);
  await act(async () => scan());
  assert.equal(destinations.length, 1);
  const [route, params] = destinations[0];
  assert.equal(route, 'AddFood'); assert.equal(params.initialBarcode, product.barcode);
  assert.equal(params.initialProductName, product.name); assert.equal(params.initialIngredientName, '牛乳');
  assert.equal(params.initialImage, product.image); assert.deepEqual(params.initialProductSource, product.productSource);
  assert.equal(params.initialStorage, 'refrigerated'); assert.equal(params.initialLookupSource, 'learned');
  assert.equal(params.allowProductSharing, false); assert.equal(dismissed, 1);
  assert.equal(params.initialExpiryDate, undefined, 'expiry is entered or estimated in the form');
});

test('shared and external results keep their origin but do not carry inventory storage defaults', async t => {
  const app = await mount(t);
  for (const source of ['shared', 'yahoo-shopping', 'open-food-facts']) {
    lookup = async () => ({ product, source });
    await act(async () => app.scan());
    const params = app.destinations.at(-1)[1];
    assert.equal(params.initialLookupSource, source); assert.equal(params.initialStorage, undefined);
    assert.equal(params.allowProductSharing, false);
    await app.focus(false); await app.focus(true);
  }
});

test('a missing product opens manual entry with the barcode retained and sharing limited to JAN/EAN', async t => {
  const app = await mount(t);
  lookup = async () => ({ product: null, source: 'none' });
  await act(async () => app.scan());
  const params = app.destinations[0][1];
  assert.equal(params.initialBarcode, product.barcode); assert.equal(params.initialLookupSource, 'none');
  assert.equal(params.allowProductSharing, true);
  for (const key of ['initialName', 'initialProductName', 'initialIngredientName', 'initialImage', 'initialProductSource']) assert.equal(params[key], undefined, key);
  await app.focus(false); await app.focus(true);
  await act(async () => app.scan('store-private-code', 'code128'));
  assert.equal(app.destinations[1][1].allowProductSharing, false);
});

test('failed and rate-limited searches still open manual entry with an accurate explanation', async t => {
  const app = await mount(t);
  lookup = async () => { throw new Error('offline'); };
  await act(async () => app.scan());
  assert.match(app.destinations[0][1].initialLookupNotice, /検索できませんでした/);
  await app.focus(false); await app.focus(true);
  lookup = async () => { throw new RateLimitError('商品検索が混み合っています。60秒ほど待つか、手入力してください。'); };
  await act(async () => app.scan());
  assert.match(app.destinations[1][1].initialLookupNotice, /60秒/);
});

test('repeated frames open one form, and returning to the scanner enables the next scan', async t => {
  const app = await mount(t);
  let release;
  lookup = () => new Promise(resolve => { release = resolve; });
  await act(async () => { app.scan(); app.scan(); });
  assert.equal(lookupCalls.length, 1); assert.equal(app.renderer.root.findByType('BarcodeScanner').props.active, false);
  await act(async () => release({ product, source: 'learned' }));
  await act(async () => app.scan());
  assert.equal(app.destinations.length, 1); assert.equal(lookupCalls.length, 1);
  await app.focus(false); assert.equal(app.renderer.root.findAllByType('BarcodeScanner').length, 0);
  await app.focus(true); assert.equal(app.renderer.root.findByType('BarcodeScanner').props.active, true);
  lookup = async () => ({ product, source: 'learned' });
  await act(async () => app.scan());
  assert.equal(app.destinations.length, 2);
});

test('leaving and returning during a search discards the old result without interrupting the new search', async t => {
  const app = await mount(t);
  const releases = [];
  lookup = () => new Promise(resolve => releases.push(resolve));
  await act(async () => app.scan());
  await app.focus(false); await app.focus(true);
  await act(async () => app.scan('96385074', 'ean8'));
  await act(async () => releases[0]({ product, source: 'learned' }));
  assert.equal(app.destinations.length, 0); assert.equal(app.renderer.root.findByType('BarcodeScanner').props.active, false);
  await act(async () => releases[1]({ product: null, source: 'none' }));
  assert.equal(app.destinations.length, 1); assert.equal(app.destinations[0][1].initialBarcode, '96385074');
});

test('unmounting or restoring stored data prevents a pending lookup from opening a stale form', async t => {
  const app = await mount(t);
  let release;
  lookup = () => new Promise(resolve => { release = resolve; });
  await act(async () => app.scan()); epoch++;
  await act(async () => release({ product, source: 'learned' }));
  assert.equal(app.destinations.length, 0); assert.equal(app.renderer.root.findByType('BarcodeScanner').props.active, true);
  await act(async () => app.scan());
  await act(async () => app.renderer.unmount());
  await act(async () => release({ product, source: 'learned' }));
  assert.equal(app.destinations.length, 0);
});

test('manual numbers are validated and normalized before opening registration', async t => {
  const app = await mount(t);
  const input = () => app.renderer.root.findByType('TextInput');
  const button = () => app.renderer.root.findAllByType('PrimaryButton').find(node => node.props.label === '番号で検索');
  assert.equal(button().props.disabled, true);
  await act(async () => button().props.onPress()); assert.equal(lookupCalls.length, 0);
  await act(async () => input().props.onChangeText('９６３８５０７４'));
  assert.equal(button().props.disabled, false);
  lookup = async () => ({ product: null, source: 'none' });
  await act(async () => button().props.onPress());
  assert.deepEqual(lookupCalls, ['96385074']);
  assert.equal(app.destinations[0][1].allowProductSharing, true);
});
