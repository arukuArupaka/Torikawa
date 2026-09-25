const { mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createCatalogServer } = require('./shared-products.cjs');

const databasePath = resolve(process.env.SHARED_DB_PATH || 'server/data/products.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const server = createCatalogServer({
  databasePath,
  allowedOrigins: (process.env.SHARED_ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(',').map((value) => value.trim()),
});
const host = process.env.SHARED_HOST || '127.0.0.1';
const port = Number(process.env.SHARED_PORT || 8787);
server.listen(port, host, () => console.log(`Shared product API: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
