const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createYahooProductHandler } = require('../server/yahoo-product-lookup.cjs');
const code = '4901234567894';

test('Yahoo proxy exposes only name and source URL, validates requests, throttles and hides secrets on failure', async t => {
  let time = 1000, calls = 0, fail = false, mismatch = false;
  const secret = 'private-server-identifier';
  const handler = createYahooProductHandler({ appId: secret, now: () => time, fetchImpl: async (url, options) => {
    calls++; assert.equal(url.origin, 'https://shopping.yahooapis.jp');
    assert.equal(url.searchParams.get('appid'), secret); assert.equal(url.searchParams.get('jan_code'), code);
    assert.equal(options.redirect, 'error');
    if (fail) throw Error(`upstream failed ${secret}`);
    return { ok: true, json: async () => ({ hits: [{ name: '牛乳', janCode: mismatch ? '4909999900001' : code,
      url: 'https://store.shopping.yahoo.co.jp/test/milk.html', image: { medium: 'https://item-shopping.c.yimg.jp/photo.jpg' }, description: 'not-for-the-client' }] }) };
  } });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (query = `barcode=${code}`, options) => fetch(`${base}/api/yahoo-product?${query}`, options);
  assert.equal((await request('barcode=123')).status, 400);
  assert.equal((await request(`barcode=${code}&url=https://evil.example`)).status, 400);
  assert.equal((await request(`barcode=${code}&barcode=${code}`)).status, 400);
  assert.equal((await request(undefined, { method: 'POST' })).status, 405);
  assert.equal((await request(undefined, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal(calls, 0);
  const result = await request();
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { barcode: code, name: '牛乳', productUrl: 'https://store.shopping.yahoo.co.jp/test/milk.html' });
  assert.equal((await request()).status, 429); assert.equal(calls, 1);
  time += 1000; mismatch = true; assert.equal((await request()).status, 404);
  time += 1000; fail = true;
  const error = await request(); assert.equal(error.status, 502);
  assert.equal((await error.text()).includes(secret), false);
});

test('an unconfigured Yahoo proxy never calls Yahoo', async t => {
  const server = http.createServer(createYahooProductHandler({ fetchImpl: () => { throw Error('must not call'); } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await fetch(`http://127.0.0.1:${server.address().port}/api/yahoo-product?barcode=${code}`);
  assert.equal(result.status, 503); assert.equal((await result.json()).error, 'not_configured');
});
