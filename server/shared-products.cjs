'use strict';
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHmac } = require('node:crypto');
const { normalizeSharedBarcode, validateSharedProduct, validateProductReport, SHARED_RULES_VERSION } = require('../shared/productContract.js');

function openCatalog(path) {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY, name TEXT NOT NULL, ingredient_name TEXT NOT NULL,
      category TEXT NOT NULL, created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
      rules_version TEXT, reviewed_at TEXT
    ) STRICT;`);
    // Old anonymous posts remain intact, but require review before they become searchable.
    const columns = new Set(db.prepare('PRAGMA table_info(products)').all().map((column) => column.name));
    if (!columns.has('review_status')) db.exec("ALTER TABLE products ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected'))");
    if (!columns.has('rules_version')) db.exec('ALTER TABLE products ADD COLUMN rules_version TEXT');
    if (!columns.has('reviewed_at')) db.exec('ALTER TABLE products ADD COLUMN reviewed_at TEXT');
    db.exec(`CREATE INDEX IF NOT EXISTS products_review ON products(review_status, created_at);
      CREATE TABLE IF NOT EXISTS reports (
        barcode TEXT NOT NULL REFERENCES products(barcode),
        reason TEXT NOT NULL CHECK(reason IN ('incorrect','personal_information','inappropriate','rights')),
        report_count INTEGER NOT NULL DEFAULT 1,
        first_reported_at TEXT NOT NULL, last_reported_at TEXT NOT NULL,
        resolved_at TEXT,
        PRIMARY KEY(barcode, reason)
      ) STRICT;
      COMMIT;`);
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  return db;
}

function reviewProduct(db, action, code) {
  const barcode = normalizeSharedBarcode(code);
  if (!barcode || !['approve', 'reject', 'hide', 'restore'].includes(action)) throw new Error('Invalid review action or barcode');
  if (action === 'approve') {
    const row = db.prepare('SELECT barcode, name, ingredient_name AS ingredientName, category FROM products WHERE barcode=?').get(barcode);
    if (row && !validateSharedProduct(row)) throw new Error('Invalid legacy product; correct it before approval');
  }
  if (action === 'hide') return db.prepare('UPDATE products SET hidden=1 WHERE barcode=?').run(barcode);
  if (action === 'restore') return db.prepare("UPDATE products SET hidden=0 WHERE barcode=? AND review_status='approved'").run(barcode);
  return db.prepare('UPDATE products SET review_status=?, reviewed_at=? WHERE barcode=?')
    .run(action === 'approve' ? 'approved' : 'rejected', new Date().toISOString(), barcode);
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
  const select = db.prepare("SELECT barcode, name, ingredient_name AS ingredientName, category FROM products WHERE barcode = ? AND hidden = 0 AND review_status = 'approved'");
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Shared-Rules-Version');
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
      const reportMatch = url.pathname.match(/^\/v1\/products\/(\d+)\/reports$/);
      const postingProduct = req.method === 'POST' && url.pathname === '/v1/products';
      if (req.method !== 'POST' || (!postingProduct && !reportMatch)) return send(404, { error: 'not_found' });
      if (postingProduct && req.headers['x-shared-rules-version'] !== SHARED_RULES_VERSION) {
        req.resume(); return send(428, { error: 'rules_required', rulesVersion: SHARED_RULES_VERSION });
      }
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
      if (reportMatch) {
        const barcode = normalizeSharedBarcode(reportMatch[1]);
        const report = validateProductReport(parsed);
        if (!barcode || !report) return send(400, { error: 'invalid_report' });
        if (!select.get(barcode)) return send(404, { error: 'not_found' });
        const now = new Date().toISOString();
        // Aggregate by product and reason; never store reporter IDs, IPs, or free-form text.
        db.prepare(`INSERT INTO reports (barcode, reason, first_reported_at, last_reported_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(barcode, reason) DO UPDATE SET report_count=MIN(report_count+1, 1000000), last_reported_at=excluded.last_reported_at, resolved_at=NULL`)
          .run(barcode, report.reason, now, now);
        return send(202, { status: 'report_received' });
      }
      const product = validateSharedProduct(parsed);
      // Reject private/extra fields before writing anything to disk.
      if (!product) return send(400, { error: 'invalid_product' });
      const previous = db.prepare('SELECT * FROM products WHERE barcode = ?').get(product.barcode);
      if (previous) {
        const same = !previous.hidden && previous.review_status !== 'rejected' && previous.name === product.name && previous.ingredient_name === product.ingredientName && previous.category === product.category;
        return send(same ? 200 : 409, { status: same ? (previous.review_status === 'pending' ? 'already_pending' : 'already_shared') : 'already_exists' });
      }
      if (db.prepare('SELECT count(*) AS n FROM products').get().n >= maxProducts) return send(503, { error: 'catalog_full' });
      db.prepare('INSERT INTO products (barcode, name, ingredient_name, category, created_at, rules_version) VALUES (?, ?, ?, ?, ?, ?)')
        .run(product.barcode, product.name, product.ingredientName, product.category, new Date().toISOString(), SHARED_RULES_VERSION);
      return send(201, { status: 'pending' });
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

module.exports = { createCatalogServer, openCatalog, reviewProduct };
