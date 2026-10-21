const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createYahooProductHandler } = require('../server/yahoo-product-lookup.cjs');
const yahooEnabled = process.argv.includes('--yahoo');
if (yahooEnabled && fs.existsSync(path.resolve(__dirname, '../.env'))) process.loadEnvFile(path.resolve(__dirname, '../.env'));
const yahooHandler = yahooEnabled ? createYahooProductHandler({ appId: process.env.YAHOO_SHOPPING_APP_ID || '' }) : null;

const exportsRoot = fs.realpathSync(path.resolve(__dirname, '../dist-web-test'));
const root = fs.realpathSync(path.resolve(process.argv[2] || ''));
if (!root.startsWith(exportsRoot + path.sep) || !fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('配布用のdist-web-test/site-…フォルダーを指定してください。');
}
const port = Number(process.argv[3] ?? '8103');
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const manifest = new Set();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    // Expo exports package-manager paths inside assets, including .pnpm.
    // Keep those fonts available while excluding ordinary hidden files.
    const exportedPackageDirectory = entry.isDirectory() && entry.name === '.pnpm'
      && path.relative(root, directory).split(path.sep)[0] === 'assets';
    if (entry.name.startsWith('.') && !exportedPackageDirectory) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.isFile() && types[path.extname(file)]) manifest.add(file);
  }
}
collect(root);
const server = http.createServer((request, response) => {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  let url;
  try { url = new URL(request.url, 'http://localhost'); }
  catch { response.writeHead(400).end(); return; }
  if (url.pathname === '/api/yahoo-product' && yahooHandler) {
    void yahooHandler(request, response); return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!manifest.has(file) || !file.startsWith(root + path.sep)) {
    response.writeHead(404).end(); return;
  }
  try {
    const realFile = fs.realpathSync(file);
    if (!realFile.startsWith(root + path.sep) || !fs.statSync(realFile).isFile()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Content-Type', types[path.extname(file)]);
    response.setHeader('Cache-Control', path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
    response.setHeader('Content-Length', fs.statSync(realFile).size);
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(realFile).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end(); }
});
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ port: server.address().port, directory: root, pid: process.pid }));
});
