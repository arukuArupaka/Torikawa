const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createYahooProductServer } = require('../server/yahoo-product-server.cjs');

async function start(t, options) {
  const server = createYahooProductServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  return (target, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: server.address().port, path: target, method, headers }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject); request.end();
  });
}

test('Expo Go Yahoo server serves only the lookup endpoint and survives malformed request targets', async t => {
  const request = await start(t);
  for (const target of ['/', '/index.html', '/.env', '/.git/config', '/src/data/sampleData.ts', '/api/other']) {
    assert.equal((await request(target)).status, 404, target);
  }
  for (const target of ['//[', 'http://[']) {
    assert.equal((await request(target)).status, 400, target);
    assert.equal((await request('/')).status, 404, 'invalid requests do not stop the server');
  }
  assert.equal((await request('/api/yahoo-product?barcode=4901625421798', 'POST')).status, 405);
});

test('Expo Go Yahoo server accepts native lookup requests and returns no images or Client ID', async t => {
  const secret = 'server-only-test-client-id';
  let upstream;
  const request = await start(t, { appId: secret, fetchImpl: async url => {
    upstream = url;
    return { ok: true, json: async () => ({ hits: [{ janCode: '4901625421798', name: 'かむかむレモン',
      url: 'https://store.shopping.yahoo.co.jp/example/lemon.html', image: { medium: 'never-return-this' } }] }) };
  } });
  const result = await request('/api/yahoo-product?barcode=4901625421798');
  assert.equal(result.status, 200);
  assert.equal(upstream.origin, 'https://shopping.yahooapis.jp');
  assert.equal(upstream.searchParams.get('appid'), secret);
  assert.deepEqual(JSON.parse(result.body), { barcode: '4901625421798', name: 'かむかむレモン',
    productUrl: 'https://store.shopping.yahoo.co.jp/example/lemon.html' });
  assert.doesNotMatch(result.body, /server-only-test-client-id|never-return-this/);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.match(result.headers['x-robots-tag'], /noindex/);
  assert.equal((await request('/api/yahoo-product?barcode=4901625421798', 'GET', { origin: 'https://other.example' })).status, 403);
});

test('an unconfigured Expo Go Yahoo server reports unavailable without calling Yahoo', async t => {
  let calls = 0;
  const request = await start(t, { fetchImpl: async () => { calls++; throw Error('unexpected request'); } });
  assert.equal((await request('/api/yahoo-product?barcode=4901625421798')).status, 503);
  assert.equal(calls, 0);
});
