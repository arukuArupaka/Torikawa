'use strict';
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHmac } = require('node:crypto');
const { normalizeSharedBarcode, validateSharedProduct } = require('../shared/productContract.js');

function openCatalog(path) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY, name TEXT NOT NULL, ingredient_name TEXT NOT NULL,
      category TEXT NOT NULL, created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
    ) STRICT;`);
  return db;
}

function createCatalogServer({ databasePath, allowedOrigins = ['http://localhost:8081'], writeLimit = 20, readLimit = 300, maxProducts = 50000 } = {}) {
  if (!databasePath) throw new Error('databasePath is required');
  const db = openCatalog(databasePath);
  const salt = randomBytes(32);
  const buckets = new Map();
  const rateLimit = (req, write) => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const key = createHmac('sha256', salt).update(`${req.socket.remoteAddress}:${write}`).digest('hex');
    if (!buckets.has(key)) {
      if (buckets.size >= 10000) return false;
      buckets.set(key, { count: 0, until: now + (write ? 3600000 : 60000) });
    }
    return ++buckets.get(key).count <= (write ? writeLimit : readLimit);
  };
  const select = db.prepare('SELECT barcode, name, ingredient_name AS ingredientName, category FROM products WHERE barcode = ? AND hidden = 0');
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return send(403, { error: 'origin_not_allowed' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204); res.end(); return;
    }
    if (!rateLimit(req, req.method !== 'GET')) return send(429, { error: 'rate_limited' });
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok' });
      const match = url.pathname.match(/^\/v1\/products\/(\d+)$/);
      if (req.method === 'GET' && match) {
        const barcode = normalizeSharedBarcode(match[1]);
        if (!barcode) return send(400, { error: 'invalid_barcode' });
        const product = select.get(barcode);
        return product ? send(200, { product }) : send(404, { error: 'not_found' });
      }
      if (req.method !== 'POST' || url.pathname !== '/v1/products') return send(404, { error: 'not_found' });
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'json_required' });
      if (Number(req.headers['content-length']) > 2048) { req.resume(); return send(413, { error: 'body_too_large' }); }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > 2048) { send(413, { error: 'body_too_large' }); req.resume(); return; }
        chunks.push(chunk);
      }
      let parsed;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'invalid_json' }); }
      const product = validateSharedProduct(parsed);
      // Reject private/extra fields before writing anything to disk.
      if (!product) return send(400, { error: 'invalid_product' });
      const previous = db.prepare('SELECT * FROM products WHERE barcode = ?').get(product.barcode);
      if (previous) {
        const same = !previous.hidden && previous.name === product.name && previous.ingredient_name === product.ingredientName && previous.category === product.category;
        return send(same ? 200 : 409, { status: same ? 'already_shared' : 'already_exists' });
      }
      if (db.prepare('SELECT count(*) AS n FROM products').get().n >= maxProducts) return send(503, { error: 'catalog_full' });
      db.prepare('INSERT INTO products (barcode, name, ingredient_name, category, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(barcode) DO NOTHING')
        .run(product.barcode, product.name, product.ingredientName, product.category, new Date().toISOString());
      return send(201, { status: 'created' });
    } catch {
      if (!res.headersSent) send(500, { error: 'server_error' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  server.on('close', () => db.close());
  return server;
}

module.exports = { createCatalogServer, openCatalog };
