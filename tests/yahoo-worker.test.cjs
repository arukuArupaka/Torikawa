const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDurableYahooHandler, handleYahooWorkerRequest, RATE_STATE_KEY } = require('../deployment/yahoo-lookup/handler.cjs');

const code = '4901625421798';
const endpoint = `https://lookup.example/api/yahoo-product?barcode=${code}`;
const secret = 'server-only-test-client-id';
const DAY_MS = 86400000;

function fixture() {
  const values = new Map();
  const state = { time: DAY_MS * 20000 + 1000, calls: 0, fail: false };
  const storage = {
    async get(key) { return structuredClone(values.get(key)); },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
  const fetchImpl = async (url, options) => {
    state.calls++;
    assert.equal(url.origin, 'https://shopping.yahooapis.jp');
    assert.equal(url.searchParams.get('appid'), secret);
    assert.equal(url.searchParams.get('jan_code'), code);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    if (state.fail) throw Error(`upstream failed ${secret}`);
    return { ok: true, json: async () => ({ hits: [{ janCode: code, name: 'かむかむレモン',
      url: 'https://store.shopping.yahoo.co.jp/example/lemon.html',
      image: { medium: 'https://example.com/never-return.jpg' }, description: 'never-return-description' }] }) };
  };
  return { values, state, storage, options: { appId: secret, storage, fetchImpl, now: () => state.time } };
}

test('permanent Yahoo lookup shares response filtering and persists only numeric allowance data', async () => {
  const f = fixture();
  const handle = createDurableYahooHandler(f.options);
  const response = await handle(new Request(endpoint));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), { barcode: code, name: 'かむかむレモン',
    productUrl: 'https://store.shopping.yahoo.co.jp/example/lemon.html' });
  assert.equal(f.state.calls, 1);
  assert.deepEqual([...f.values], [[RATE_STATE_KEY, {
    day: 20000, count: 1, nextRequestAt: f.state.time + 1000,
  }]]);
});

test('permanent Yahoo lookup keeps the global second and daily limits after object restarts', async () => {
  const f = fixture();
  const makeHandler = () => createDurableYahooHandler({ ...f.options, dailyLimit: '2' });
  assert.equal((await makeHandler()(new Request(endpoint))).status, 200);
  const tooSoon = await makeHandler()(new Request(endpoint));
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.headers.get('retry-after'), '1');
  assert.equal(f.state.calls, 1);
  f.state.time += 1000;
  assert.equal((await makeHandler()(new Request(endpoint))).status, 200);
  f.state.time += 1000;
  const exhausted = await makeHandler()(new Request(endpoint));
  assert.equal(exhausted.status, 429);
  assert.equal(Number(exhausted.headers.get('retry-after')), (DAY_MS * 20001 - f.state.time) / 1000);
  assert.equal(f.state.calls, 2);
  assert.equal(f.values.get(RATE_STATE_KEY).count, 2);
  f.state.time = DAY_MS * 20001;
  assert.equal((await makeHandler()(new Request(endpoint))).status, 200);
  assert.equal(f.state.calls, 3);
  assert.equal(f.values.get(RATE_STATE_KEY).count, 1);
  assert.equal(f.values.size, 1, 'old daily buckets do not accumulate');
});

test('server secrets copied with surrounding whitespace are normalized before contacting Yahoo', async () => {
  const f = fixture();
  const response = await createDurableYahooHandler({ ...f.options, appId: ` ${secret}\r\n` })(new Request(endpoint));
  assert.equal(response.status, 200);
  assert.equal(f.state.calls, 1);
});

test('Cloudflare lookup rejects upstream redirects without following them or reading their body', async () => {
  const f = fixture();
  let calls = 0;
  const response = await createDurableYahooHandler({ ...f.options, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://shopping.yahooapis.jp');
    assert.equal(options.redirect, 'manual');
    return { ok: false, status: 302, json() { assert.fail('a redirect body must not be used'); } };
  } })(new Request(endpoint));
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { error: 'lookup_unavailable' });
});

test('concurrent lookup cannot bypass the allowance while its storage read is pending', async () => {
  const f = fixture();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  f.storage.get = async () => { await waiting; return undefined; };
  const handle = createDurableYahooHandler(f.options);
  const first = handle(new Request(endpoint));
  const second = await handle(new Request(endpoint));
  assert.equal(second.status, 429);
  assert.equal(f.state.calls, 0);
  release();
  assert.equal((await first).status, 200);
  assert.equal(f.state.calls, 1);
});

test('lookup storage failures and corrupt allowance fail closed without exposing secrets', async () => {
  for (const failure of ['get', 'put', 'corrupt']) {
    const f = fixture();
    if (failure === 'corrupt') f.values.set(RATE_STATE_KEY, { day: 20000, count: 'unknown' });
    else f.storage[failure] = async () => { throw Error(`storage failed ${secret}`); };
    const response = await createDurableYahooHandler(f.options)(new Request(endpoint));
    assert.equal(response.status, 502, failure);
    assert.deepEqual(await response.json(), { error: 'lookup_unavailable' });
    assert.equal(f.state.calls, 0);
  }
});

test('an upstream failure consumes an allowance and a subsequent request can recover', async () => {
  const f = fixture();
  f.state.fail = true;
  const handle = createDurableYahooHandler(f.options);
  const failure = await handle(new Request(endpoint));
  assert.equal(failure.status, 502);
  assert.equal((await failure.text()).includes(secret), false);
  assert.equal(f.values.get(RATE_STATE_KEY).count, 1);
  f.state.fail = false;
  f.state.time += 1000;
  assert.equal((await handle(new Request(endpoint))).status, 200);
  assert.equal(f.values.get(RATE_STATE_KEY).count, 2);
});

test('worker rejects unrelated routes, unsafe methods, invalid barcodes and other browser origins before its object', async () => {
  const env = { YAHOO_SHOPPING_APP_ID: secret, YAHOO_LOOKUP_GATE: {
    idFromName() { assert.fail('invalid requests must not reach the object'); },
  } };
  const requests = [
    [new Request('https://lookup.example/.env'), 404],
    [new Request(endpoint, { method: 'POST' }), 405],
    [new Request(endpoint, { method: 'OPTIONS' }), 405],
    [new Request(endpoint.replace(code, '123')), 400],
    [new Request(endpoint + '&url=https://evil.example'), 400],
    [new Request(endpoint + `&barcode=${code}`), 400],
    [new Request(endpoint, { headers: { Origin: 'https://other.example' } }), 403],
    [new Request(endpoint, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403],
  ];
  for (const [request, expected] of requests) {
    const response = await handleYahooWorkerRequest(request, env);
    assert.equal(response.status, expected, request.url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (expected === 405) assert.equal(response.headers.get('allow'), 'GET');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('worker health does not contact Yahoo and native and same-origin requests use one object identity', async () => {
  const f = fixture();
  const handle = createDurableYahooHandler(f.options);
  let objectCalls = 0;
  const env = { YAHOO_SHOPPING_APP_ID: secret, DAILY_LOOKUP_LIMIT: '1000', YAHOO_LOOKUP_GATE: {
    idFromName(name) { assert.equal(name, 'yahoo-product-v1'); return 'fixed-id'; },
    get(id) { assert.equal(id, 'fixed-id'); return { fetch: request => { objectCalls++; return handle(request); } }; },
  } };
  const health = await handleYahooWorkerRequest(new Request('https://lookup.example/healthz'), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ready' });
  assert.equal(objectCalls, 0);
  assert.equal(f.state.calls, 0);
  assert.equal((await handleYahooWorkerRequest(new Request(endpoint), env)).status, 200);
  f.state.time += 1000;
  assert.equal((await handleYahooWorkerRequest(new Request(endpoint, { headers: { Origin: 'https://lookup.example' } }), env)).status, 200);
  assert.equal(objectCalls, 2);
  assert.equal(f.state.calls, 2);
});

test('worker fails safely when configuration or the provider is unavailable', async () => {
  for (const env of [{}, { YAHOO_SHOPPING_APP_ID: secret },
    { YAHOO_SHOPPING_APP_ID: secret, YAHOO_LOOKUP_GATE: {}, DAILY_LOOKUP_LIMIT: '0' },
    { YAHOO_SHOPPING_APP_ID: secret, YAHOO_LOOKUP_GATE: { idFromName() { throw Error(secret); } } }]) {
    const response = await handleYahooWorkerRequest(new Request(endpoint), env);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes(secret), false);
  }
  assert.equal((await handleYahooWorkerRequest(new Request('https://lookup.example/healthz'), {})).status, 503);
  for (const dailyLimit of ['0', '10001', '1.5', '-1', 'invalid', '']) {
    assert.throws(() => createDurableYahooHandler({ ...fixture().options, dailyLimit }), /invalid_daily_limit/);
  }
});

test('worker deployment uses free-compatible SQLite state, has no secrets/assets and disables request logging', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'deployment/yahoo-lookup/wrangler.json'), 'utf8'));
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.observability.enabled, false);
  assert.equal(config.vars.DAILY_LOOKUP_LIMIT, '1000');
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['YahooLookupGate'] }]);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'YAHOO_LOOKUP_GATE', class_name: 'YahooLookupGate' }]);
  assert.equal(config.vars.YAHOO_SHOPPING_APP_ID, undefined);
  assert.equal(config.assets, undefined);
  for (const ignoreFile of ['.gitignore', '.easignore']) {
    const ignore = fs.readFileSync(path.join(root, ignoreFile), 'utf8');
    assert.match(ignore, /^\.dev\.vars\*$/m);
    assert.match(ignore, /^\.wrangler\/$/m);
  }
});
