// Run on the server host. No public administrative endpoint is exposed.
const { resolve } = require('node:path');
const { openCatalog } = require('./shared-products.cjs');
const { normalizeSharedBarcode } = require('../shared/productContract.js');
const [action, value] = process.argv.slice(2);
const barcode = normalizeSharedBarcode(value);
if (!['hide', 'restore'].includes(action) || !barcode) throw new Error('Usage: node server/admin.cjs hide|restore BARCODE');
const db = openCatalog(resolve(process.env.SHARED_DB_PATH || 'server/data/products.sqlite'));
const result = db.prepare('UPDATE products SET hidden = ? WHERE barcode = ?').run(action === 'hide' ? 1 : 0, barcode);
db.close();
console.log(`Changed records: ${result.changes}`);
