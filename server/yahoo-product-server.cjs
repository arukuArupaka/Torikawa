'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createYahooProductHandler } = require('./yahoo-product-lookup.cjs');

/** Expo Go uses only this lookup endpoint; no web build or project files are served. */
function createYahooProductServer(options) {
  const handle = createYahooProductHandler(options);
  return http.createServer((request, response) => {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    let url;
    try { url = new URL(request.url, 'http://localhost'); }
    catch { response.writeHead(400).end(); return; }
    if (url.pathname !== '/api/yahoo-product') { response.writeHead(404).end(); return; }
    void handle(request, response).catch(() => {
      // Never return upstream errors or the application's Client ID.
      if (response.headersSent) response.destroy();
      else response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ error: 'lookup_unavailable' }));
    });
  });
}

if (require.main === module) {
  const envFile = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const appId = process.env.YAHOO_SHOPPING_APP_ID || '';
  if (!appId.trim()) throw new Error('Yahoo検索用のClient IDをサーバーの設定に追加してください。');
  const port = Number(process.env.YAHOO_LOOKUP_PORT ?? '8103');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Yahoo検索APIのポート番号を確認してください。');
  const server = createYahooProductServer({ appId });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({
    port: server.address().port, path: '/api/yahoo-product', pid: process.pid,
  })));
}

module.exports = { createYahooProductServer };
