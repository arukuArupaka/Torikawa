const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { validatePublicationConfig, createWebTestEnvironment } = require('../scripts/publication-config.cjs');
const { createDataHandlingHtml, renderTestGuide } = require('../scripts/web-data-handling.cjs');

const publication = { operator: 'たべどきテスト運営', supportEmail: 'support@example.com', privacyPolicyUrl: 'https://example.com/privacy' };

test('explicit publication configuration is required; credentials and unsafe destinations cannot enter it', () => {
  for (const value of [null, [], {}, { ...publication, supportEmail: '' }, { ...publication, operator: 'name\nextra' },
    { ...publication, supportEmail: 'support@example.com?subject=secret' },
    { ...publication, privacyPolicyUrl: 'http://example.com/privacy' },
    { ...publication, privacyPolicyUrl: 'javascript:alert(1)' },
    { ...publication, privacyPolicyUrl: 'https://user:secret@example.com/privacy' }]) {
    assert.throws(() => validatePublicationConfig(value));
  }
  const unknown = { ...publication, 'secret-in-key': 'secret-in-value' };
  assert.throws(() => validatePublicationConfig(unknown), error => !/secret-in-(key|value)/.test(error.message));
  assert.deepEqual(validatePublicationConfig({ ...publication, operator: ' たべどきテスト運営 ' }), publication);
});

test('export passes only explicit public settings and never revives local secrets, shared endpoints or demo data', () => {
  const parent = { PATH: 'runtime', YAHOO_SHOPPING_APP_ID: 'server-secret', EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID: 'legacy-secret',
    EXPO_PUBLIC_SHARED_PRODUCTS_URL: 'http://private-server', EXPO_PUBLIC_DEMO_DATA: 'true',
    EXPO_PUBLIC_SUPPORT_EMAIL: 'private-contact@example.com', EXPO_PUBLIC_UNRELATED_SECRET: 'private-value' };
  const before = { ...parent };
  const defaultExport = createWebTestEnvironment(parent);
  assert.equal(defaultExport.EXPO_NO_DOTENV, '1');
  assert.equal(defaultExport.EXPO_PUBLIC_SUPPORT_EMAIL, '');
  assert.equal(defaultExport.EXPO_PUBLIC_YAHOO_LOOKUP_URL, '');
  const configured = createWebTestEnvironment(parent, { publication, basePath: '/Torikawa', yahooEnabled: true });
  assert.equal(configured.EXPO_PUBLIC_OPERATOR_NAME, publication.operator);
  assert.equal(configured.EXPO_PUBLIC_SUPPORT_EMAIL, publication.supportEmail);
  assert.equal(configured.EXPO_PUBLIC_PRIVACY_POLICY_URL, publication.privacyPolicyUrl);
  assert.equal(configured.EXPO_PUBLIC_WEB_BASE_PATH, '/Torikawa');
  assert.equal(configured.EXPO_PUBLIC_YAHOO_LOOKUP_URL, '/api/yahoo-product');
  assert.equal(configured.EXPO_PUBLIC_SHARED_PRODUCTS_URL, '');
  assert.equal(configured.EXPO_PUBLIC_DEMO_DATA, 'false');
  assert.equal(configured.PATH, 'runtime');
  assert.doesNotMatch(JSON.stringify(configured), /server-secret|legacy-secret|private-server|private-contact|private-value/);
  assert.deepEqual(parent, before);
});

test('web explanations match enabled lookup services and escape public contact text', () => {
  const template = fs.readFileSync(require.resolve('../web-test/test-guide.html'), 'utf8');
  const defaultGuide = renderTestGuide(template);
  assert.match(defaultGuide, /Yahoo検索と共有商品DBへの接続は設定していません/);
  assert.match(defaultGuide, /準備中/);
  assert.doesNotMatch(defaultGuide, /mailto:|<!--PRODUCT_SEARCH_DESCRIPTION-->|<!--PUBLICATION_CONTACT-->/);
  const maliciousName = { ...publication, operator: '<script>alert("x")</script>' };
  const enabledGuide = renderTestGuide(template, { yahooEnabled: true, publication: maliciousName });
  const page = createDataHandlingHtml({ yahooEnabled: true, publication: maliciousName });
  for (const html of [enabledGuide, page]) {
    assert.match(html, /Yahooの商品名検索/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /mailto:support@example.com/);
    assert.match(html, /href="https:\/\/example.com\/privacy"/);
  }
  const sections = require('../shared/dataHandlingSections.json');
  for (const section of sections) assert.ok(page.includes(section.title));
  assert.match(page, /正式なプライバシーポリシーとは別/);
  assert.match(page, /個人の在庫・数量・期限・メモ・写真は共有しません/);
  assert.match(page, /Web版は期限通知に対応していません/);
  assert.match(renderTestGuide(template, { publication: { ...publication, operator: '$& $\u0027 $`' } }), /\$&amp; \$&#39; \$`/);
});

test('configuration check fails without printing invalid file contents', () => {
  const result = spawnSync(process.execPath, ['scripts/check-publication.cjs', 'publication.example.json'], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /operator が未設定/);
  assert.equal(result.stdout, '');
});
