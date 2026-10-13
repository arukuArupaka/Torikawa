const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

test('public web-test server serves only exported files and rejects writes, hidden paths and traversal', async () => {
  const root = path.resolve(__dirname, '..');
  const exportsRoot = path.join(root, 'dist-web-test');
  fs.mkdirSync(exportsRoot, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(exportsRoot, 'site-server-test-'));
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html>test build</html>');
  fs.writeFileSync(path.join(fixture, '.env'), 'never-serve-this');
  const fontDirectory = path.join(fixture, 'assets/node_modules/.pnpm/icons/node_modules/icons');
  fs.mkdirSync(fontDirectory, { recursive: true });
  fs.writeFileSync(path.join(fontDirectory, 'test.ttf'), 'exported-font');
  const child = spawn(process.execPath, [path.join(root, 'scripts/serve-web-test.cjs'), fixture, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const state = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.trim())); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    });
    function request(url, method = 'GET') {
      return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: state.port, path: url, method }, res => {
          let body = '';
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject); req.end();
      });
    }
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<html>test build</html>');
    assert.match(home.headers['x-robots-tag'], /noindex/);
    const head = await request('/', 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body, '');
    assert.equal((await request('/', 'POST')).status, 405);
    const font = await request('/assets/node_modules/.pnpm/icons/node_modules/icons/test.ttf');
    assert.equal(font.status, 200); assert.equal(font.headers['content-type'], 'font/ttf');
    assert.equal(font.body, 'exported-font');
    for (const url of ['/.env', '/%2eenv', '/../package.json', '/%2e%2e/package.json', '/..%5cpackage.json', '/scripts/serve-web-test.cjs']) {
      assert.equal((await request(url)).status, 404, url);
    }
    assert.equal((await request('/%')).status, 400);
    fs.writeFileSync(path.join(fixture, 'added-after-start.json'), 'not-in-export');
    assert.equal((await request('/added-after-start.json')).status, 404);
  } finally {
    child.kill();
    // Keep the small ignored fixture; never recursively delete a computed path.
  }
});
