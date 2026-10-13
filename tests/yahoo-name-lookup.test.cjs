require('./register-typescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { lookupYahooProductByBarcode } = require('../src/services/yahooProductLookupService.ts');
const { getFoodFallbackImage } = require('../src/utils/foodImages.ts');
const { withoutYahooImage } = require('../src/utils/yahooImagePolicy.ts');
const code = '4901234567894';

test('Yahoo lookup sends a barcode to the proxy and ignores every returned image field', async t => {
  const oldFetch = global.fetch, oldUrl = process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL;
  t.after(() => { global.fetch = oldFetch; if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL; else process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL = oldUrl; });
  process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL = '/api/yahoo-product';
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ barcode: code, name: 'テスト牛乳', productUrl: 'https://store.shopping.yahoo.co.jp/test/milk.html',
      image: 'https://item-shopping.c.yimg.jp/unwanted.jpg', exImage: { url: 'https://other.example/unwanted.jpg' } }) };
  };
  const product = await lookupYahooProductByBarcode(code);
  assert.equal(request.url, `/api/yahoo-product?barcode=${code}`);
  assert.equal(request.options.credentials, 'omit');
  assert.equal(product.name, 'テスト牛乳'); assert.equal(product.image, 'food-icon:dairy');
  assert.equal(product.productSource.provider, 'yahoo-shopping');
  assert.equal(product.productSource.image, undefined);
  assert.equal(JSON.stringify(product).includes('unwanted'), false);
  let requests = 0;
  global.fetch = async () => { requests++; return { ok: false, status: 503 }; };
  assert.equal(await lookupYahooProductByBarcode(code), null);
  assert.equal(await lookupYahooProductByBarcode('123'), null);
  assert.equal(requests, 1);
});

test('Yahoo legacy remote images become local icons; selected photos and OFF images survive', () => {
  const source = { provider: 'yahoo-shopping' };
  for (const image of ['https://item-shopping.c.yimg.jp/photo.jpg', 'https://old-shop.example/photo.jpg']) {
    assert.equal(withoutYahooImage({ name: '牛乳', image, productSource: source }).image, 'food-icon:dairy');
  }
  for (const image of ['file:///document/my-photo.jpg', 'content://my-photo', 'data:image/jpeg;base64,abc', 'blob:https://app.example/photo', 'food-icon:dairy']) {
    assert.equal(withoutYahooImage({ name: '牛乳', image, productSource: source }).image, image);
  }
  const off = { name: '牛乳', image: 'https://images.openfoodfacts.org/front.jpg', productSource: { provider: 'open-food-facts' } };
  assert.equal(withoutYahooImage(off), off);
  assert.equal(getFoodFallbackImage({ name: '牛乳' }), 'food-icon:dairy');
});
