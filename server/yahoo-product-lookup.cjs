'use strict';
const { normalizeSharedBarcode } = require('../shared/productContract');

/** Fixed upstream, minimal response, no persistent product catalog or image URLs. */
function createYahooProductHandler({ appId = '', fetchImpl = fetch, now = Date.now } = {}) {
  let nextRequestAt = 0;
  let busy = false;
  return async function handle(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => response.writeHead(status).end(JSON.stringify(value));
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); send(405, { error: 'method_not_allowed' }); return; }
    // This web-test endpoint is for its own app, not a cross-origin public proxy.
    const origin = request.headers.origin;
    if (request.headers['sec-fetch-site'] === 'cross-site'
      || (origin && origin !== `https://${request.headers.host}` && origin !== `http://${request.headers.host}`)) {
      send(403, { error: 'origin_not_allowed' }); return;
    }
    const url = new URL(request.url, 'http://localhost');
    const barcode = normalizeSharedBarcode(url.searchParams.get('barcode'));
    if (!barcode || [...url.searchParams.keys()].some(key => key !== 'barcode') || url.searchParams.getAll('barcode').length !== 1) {
      send(400, { error: 'invalid_barcode' }); return;
    }
    if (!appId.trim()) { send(503, { error: 'not_configured' }); return; }
    if (busy || now() < nextRequestAt) {
      response.setHeader('Retry-After', '1'); send(429, { error: 'try_later' }); return;
    }
    nextRequestAt = now() + 1000;
    busy = true;
    try {
      const upstream = new URL('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch');
      upstream.search = new URLSearchParams({ appid: appId, jan_code: barcode, results: '10' }).toString();
      const result = await fetchImpl(upstream, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(6000) });
      if (!result.ok) { send(502, { error: 'lookup_unavailable' }); return; }
      const data = await result.json();
      const hit = Array.isArray(data?.hits) ? data.hits.find(item => item?.janCode === barcode && typeof item.name === 'string' && item.name.trim()) : undefined;
      if (!hit || hit.name.length > 300 || /[\u0000-\u001f\u007f]/.test(hit.name)) { send(404, { error: 'not_found' }); return; }
      let productUrl;
      try {
        const value = new URL(hit.url);
        if (value.protocol !== 'https:' || value.username || value.password
          || !(value.hostname === 'shopping.yahoo.co.jp' || value.hostname.endsWith('.shopping.yahoo.co.jp')) || value.href.length > 2048) throw Error();
        productUrl = value.href;
      } catch { send(404, { error: 'not_found' }); return; }
      send(200, { barcode, name: hit.name.trim(), productUrl });
    } catch {
      // Upstream errors can include the application ID; never echo or log them.
      send(502, { error: 'lookup_unavailable' });
    } finally { busy = false; }
  };
}
module.exports = { createYahooProductHandler };
