// Run on the server host. No public administrative endpoint is exposed.
const { resolve } = require('node:path');
const { openCatalog, reviewProduct } = require('./shared-products.cjs');
const { normalizeSharedBarcode } = require('../shared/productContract.js');
const [action, value] = process.argv.slice(2);
const barcode = normalizeSharedBarcode(value);
const states = ['pending', 'approved', 'rejected', 'hidden'];
if (!(action === 'list' && (!value || states.includes(value)))
  && !(action === 'reports' && (!value || ['open', 'resolved'].includes(value)))
  && !(['approve', 'reject', 'hide', 'restore', 'resolve'].includes(action) && barcode)) {
  throw new Error('Usage: node server/admin.cjs list [pending|approved|rejected|hidden] | reports [open|resolved] | approve|reject|hide|restore|resolve BARCODE');
}
const db = openCatalog(resolve(process.env.SHARED_DB_PATH || 'server/data/products.sqlite'));
try {
  if (action === 'list') {
    const state = value || 'pending';
    const filter = state === 'hidden' ? 'hidden=1' : 'review_status=?';
    const query = db.prepare(`SELECT barcode, name, ingredient_name AS ingredientName, category, review_status, hidden, rules_version, created_at, reviewed_at FROM products WHERE ${filter} ORDER BY created_at, barcode LIMIT 100`);
    console.log(JSON.stringify(state === 'hidden' ? query.all() : query.all(state), null, 2));
  } else if (action === 'reports') {
    const filter = value === 'resolved' ? 'IS NOT NULL' : 'IS NULL';
    console.log(JSON.stringify(db.prepare(`SELECT r.*, p.name, p.ingredient_name AS ingredientName, p.category, p.review_status, p.hidden
      FROM reports r JOIN products p ON p.barcode=r.barcode WHERE r.resolved_at ${filter} ORDER BY r.last_reported_at DESC LIMIT 100`).all(), null, 2));
  } else {
    const result = action === 'resolve'
      ? db.prepare('UPDATE reports SET resolved_at=? WHERE barcode=? AND resolved_at IS NULL').run(new Date().toISOString(), barcode)
      : reviewProduct(db, action, barcode);
    console.log(`Changed records: ${result.changes}`);
  }
} finally { db.close(); }
