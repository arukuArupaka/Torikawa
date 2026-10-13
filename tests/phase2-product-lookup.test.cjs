require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let learnedFailure = false;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: () => ({ uri: 'test-image' }) } };
  if (request.endsWith('/learnedProductService')) return { findLearnedProduct: async () => {
    if (learnedFailure) throw new Error('catalog unavailable');
    return null;
  } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { lookupProductByBarcode } = require('../src/services/productLookupService.ts');
const { getFoodRegistrationDefaults } = require('../src/utils/foodRegistrationDefaults.ts');
const { normalizeProductToIngredient } = require('../src/utils/ingredientNormalizer.ts');
const barcode = '4909999987650';

test('Yahoo and Open Food Facts use the same classification and storage suggestions as manual registration', async (t) => {
  const originalFetch = global.fetch;
  const previousYahoo = process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL;
  const previousShared = process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
  delete process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL;
  t.after(() => {
    global.fetch = originalFetch;
    for (const [key, value] of [['EXPO_PUBLIC_YAHOO_LOOKUP_URL', previousYahoo], ['EXPO_PUBLIC_SHARED_PRODUCTS_URL', previousShared]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  for (const [index, name] of ['テスト牛乳', '牛乳プリン', '米酢', '焼きそば麺', '炊飯済みご飯'].entries()) {
    const prefix = `49099999876${index}`;
    const sum = [...prefix].reduce((total, digit, position) => total + Number(digit) * (position % 2 ? 3 : 1), 0);
    const testBarcode = prefix + (10 - sum % 10) % 10;
    const info = normalizeProductToIngredient(name);
    const defaults = getFoodRegistrationDefaults({ name, ...info });
    for (const provider of ['yahoo-shopping', 'open-food-facts']) {
      if (provider === 'yahoo-shopping') process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL = '/api/yahoo-product';
      else delete process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL;
      global.fetch = async () => ({ status: 200, ok: true, json: async () => provider === 'yahoo-shopping'
        ? { name, barcode: testBarcode, productUrl: 'https://store.shopping.yahoo.co.jp/test/item.html' }
        : { status: 1, product: { product_name_ja: name, categories: 'milk' } } });
      const result = await lookupProductByBarcode(testBarcode);
      assert.equal(result.source, provider);
      assert.equal(result.product.ingredientName, info.ingredientName, name);
      assert.equal(result.product.category, info.categoryLabel, name);
      assert.equal(result.product.storage, defaults.storage, name);
    }
  }
});

test('unreadable learned catalog still permits external lookup', async (t) => {
  const originalFetch = global.fetch;
  learnedFailure = true;
  t.after(() => { global.fetch = originalFetch; learnedFailure = false; });
  t.mock.method(console, 'warn', () => {});
  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ status: 1, product: { product_name_ja: '外部の牛乳' } }) });
  assert.equal((await lookupProductByBarcode('4909999987699')).product.ingredientName, '牛乳');
});
