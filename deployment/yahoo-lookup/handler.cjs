'use strict';
const { createYahooProductHandler, validateYahooProductRequest } = require('../../server/yahoo-product-lookup.cjs');

const RATE_STATE_KEY = 'allowance-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 1000;

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  } });
}

function asNodeRequest(request) {
  const url = new URL(request.url);
  return { method: request.method, url: url.pathname + url.search,
    headers: { ...Object.fromEntries(request.headers), host: url.host } };
}

function readDailyLimit(value = String(DEFAULT_DAILY_LIMIT)) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw Error('invalid_daily_limit');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw Error('invalid_daily_limit');
  return limit;
}

function createDurableYahooHandler({ appId = '', storage, dailyLimit, fetchImpl = fetch, now = Date.now }) {
  const limit = readDailyLimit(dailyLimit);
  // Workers rejects Fetch's redirect:"error" with TypeError. Use manual instead;
  // the shared handler rejects every non-2xx response without following its Location.
  const handle = createYahooProductHandler({ appId, now,
    fetchImpl: (url, options) => fetchImpl(url, { ...options, redirect: 'manual' }),
    reserveLookup: async () => {
    const time = now();
    const day = Math.floor(time / DAY_MS);
    const saved = await storage.get(RATE_STATE_KEY);
    // An unreadable allowance must not silently reset a daily limit.
    if (saved !== undefined && (!saved || !Number.isSafeInteger(saved.day) || saved.day < 0
      || !Number.isSafeInteger(saved.count) || saved.count < 0
      || !Number.isSafeInteger(saved.nextRequestAt) || saved.nextRequestAt < 0)) throw Error('invalid_allowance');
    const count = saved?.day === day ? saved.count : 0;
    if (count >= limit) return ((day + 1) * DAY_MS - time) / 1000;
    if (saved?.nextRequestAt > time) return (saved.nextRequestAt - time) / 1000;
    // Only these three numbers are stored, never a barcode, name, IP or photo.
    // Persist before fetch: restarts and upstream failures do not bypass the allowance.
    await storage.put(RATE_STATE_KEY, { day, count: count + 1, nextRequestAt: time + 1000 });
    return 0;
  } });
  return async request => {
    const headers = {};
    let status = 200;
    let result;
    // Adapt the existing Node handler, keeping validation and Yahoo response filtering shared.
    const response = {
      setHeader(name, value) { headers[name] = value; },
      writeHead(value) { status = value; return response; },
      end(body) { result = new Response(body, { status, headers: {
        'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer', ...headers,
      } }); },
    };
    try {
      await handle(asNodeRequest(request), response);
      return result || jsonResponse(502, { error: 'lookup_unavailable' });
    } catch { return jsonResponse(502, { error: 'lookup_unavailable' }); }
  };
}

async function handleYahooWorkerRequest(request, env) {
  try {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET' && !url.search) {
      const configured = typeof env.YAHOO_SHOPPING_APP_ID === 'string' && Boolean(env.YAHOO_SHOPPING_APP_ID.trim())
        && Boolean(env.YAHOO_LOOKUP_GATE);
      readDailyLimit(env.DAILY_LOOKUP_LIMIT);
      return jsonResponse(configured ? 200 : 503, { status: configured ? 'ready' : 'not_configured' });
    }
    if (url.pathname !== '/api/yahoo-product') return jsonResponse(404, { error: 'not_found' });
    const validation = validateYahooProductRequest(asNodeRequest(request));
    if (validation.error) return jsonResponse(validation.status, { error: validation.error },
      validation.status === 405 ? { Allow: 'GET' } : {});
    readDailyLimit(env.DAILY_LOOKUP_LIMIT);
    if (typeof env.YAHOO_SHOPPING_APP_ID !== 'string' || !env.YAHOO_SHOPPING_APP_ID.trim()
      || !env.YAHOO_LOOKUP_GATE) return jsonResponse(503, { error: 'not_configured' });
    // All regions share one object. Per-isolate counters cannot enforce a global quota.
    const id = env.YAHOO_LOOKUP_GATE.idFromName('yahoo-product-v1');
    return await env.YAHOO_LOOKUP_GATE.get(id).fetch(request);
  } catch {
    // Provider and storage exceptions may contain secrets; neither log nor return them.
    return jsonResponse(503, { error: 'lookup_unavailable' });
  }
}

module.exports = { createDurableYahooHandler, handleYahooWorkerRequest, RATE_STATE_KEY };
