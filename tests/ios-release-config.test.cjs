const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('iPhone distribution keeps the selected bundle identifier and a separate build number', () => {
  const { expo } = require('../app.json');
  const config = require('../app.config.js')({ config: expo });
  assert.equal(config.ios.bundleIdentifier, 'com.arukuarupaka.tabedoki');
  assert.equal(config.ios.supportsTablet, false);
  assert.match(config.ios.buildNumber, /^\d+(?:\.\d+)*$/);
  assert.equal(config.version, require('../package.json').version);
  assert.match(config.extra.eas.projectId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('the production profile makes a signed device store build using production settings and Node 24', () => {
  const config = require('../eas.json');
  const profile = config.build.production;
  assert.equal(profile.distribution, 'store');
  assert.equal(profile.ios.simulator, false);
  assert.notEqual(profile.withoutCredentials, true);
  assert.notEqual(profile.ios.withoutCredentials, true);
  assert.equal(profile.environment, 'production');
  const [major, minor] = profile.node.split('.').map(Number);
  assert.equal(major, 24);
  assert.ok(minor >= 19);
  assert.equal(config.cli.appVersionSource, 'remote');
  assert.equal(profile.ios.autoIncrement, true);
  assert.equal(profile.env.EXPO_NO_DOTENV, '1');
  assert.equal(profile.env.EXPO_PUBLIC_OPERATOR_NAME, 'たべどき!!運営');
  assert.equal(profile.env.EXPO_PUBLIC_SUPPORT_FORM_URL, 'https://forms.gle/Rjoy4xiwzE7uBDf57');
  assert.equal(profile.env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://maeken07.github.io/tabedoki-website/privacy.html');
  assert.equal(profile.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL, '');
  const lookup = new URL(profile.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL);
  assert.equal(lookup.protocol, 'https:');
  assert.equal(lookup.pathname, '/api/yahoo-product');
  assert.equal(lookup.username, '');
  assert.equal(lookup.password, '');
  assert.equal(lookup.search, '');
  assert.doesNotMatch(lookup.hostname, /localhost|127\.0\.0\.1|trycloudflare\.com/);
  assert.equal(profile.env.EXPO_PUBLIC_DEMO_DATA, 'false');
  assert.equal(profile.env.EXPO_PUBLIC_WEB_TEST, 'false');
  assert.equal(Object.hasOwn(profile.env, 'YAHOO_SHOPPING_APP_ID'), false);
  assert.equal(Object.hasOwn(profile.env, 'EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID'), false);
});

test('EAS ignore rules exclude local data and credentials while retaining the application and selected artwork', () => {
  const rules = file => fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const easRules = new Set(rules('.easignore'));
  for (const rule of rules('.gitignore')) assert.ok(easRules.has(rule), `missing git exclusion: ${rule}`);
  const excluded = ['.env', '.env.local', 'publication.local.json', 'credentials.json', 'apple-key.p8',
    '.review/private.log', 'review/private.png', 'output/app-icon-concepts-2026-10-19/01-fresh-moment.png',
    'server/data/shared.sqlite', 'node_modules/react/index.js', 'dist-web-test/site-example/index.html'];
  const included = ['app.json', 'app.config.js', 'eas.json', 'package.json', 'package-lock.json', 'App.tsx',
    'src/services/storage.ts', 'shared/productContract.js', 'assets/branding/fresh-moment.png', 'assets/branding/manifest.json'];
  const result = spawnSync('git', ['-c', `core.excludesFile=${path.join(root, '.easignore')}`, 'check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: [...excluded, ...included].join('\n') + '\n', encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(result.stdout.trim().split(/\r?\n/)), new Set(excluded));
});
