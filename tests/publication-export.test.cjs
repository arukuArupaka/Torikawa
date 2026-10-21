const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { validatePublicationConfig, createWebTestEnvironment } = require('../scripts/publication-config.cjs');
const { createDataHandlingHtml, renderTestGuide } = require('../scripts/web-data-handling.cjs');

const publication = { operator: 'たべどきテスト運営', supportFormUrl: 'https://example.com/contact?source=app&lang=ja', privacyPolicyUrl: 'https://example.com/privacy' };

test('explicit publication configuration is required; credentials and unsafe destinations cannot enter it', () => {
  for (const value of [null, [], {}, { ...publication, supportFormUrl: '' }, { ...publication, operator: 'name\nextra' },
    { ...publication, supportFormUrl: 'mailto:support@example.com' },
    { ...publication, supportFormUrl: 'http://example.com/contact' },
    { ...publication, supportFormUrl: 'javascript:alert(1)' },
    { ...publication, supportFormUrl: 'https://user:secret@example.com/contact' },
    { ...publication, supportFormUrl: 'https://example.com/\ncontact' },
    { ...publication, supportFormUrl: `https://example.com/${'a'.repeat(2048)}` },
    { ...publication, supportEmail: 'legacy@example.com' },
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
    EXPO_PUBLIC_SUPPORT_FORM_URL: 'https://private-form.example/contact',
    EXPO_PUBLIC_SUPPORT_EMAIL: 'private-contact@example.com', EXPO_PUBLIC_UNRELATED_SECRET: 'private-value' };
  const before = { ...parent };
  const defaultExport = createWebTestEnvironment(parent);
  assert.equal(defaultExport.EXPO_NO_DOTENV, '1');
  assert.equal(defaultExport.EXPO_PUBLIC_SUPPORT_EMAIL, '');
  assert.equal(defaultExport.EXPO_PUBLIC_SUPPORT_FORM_URL, '');
  assert.equal(defaultExport.EXPO_PUBLIC_YAHOO_LOOKUP_URL, '');
  const configured = createWebTestEnvironment(parent, { publication, basePath: '/Torikawa', yahooEnabled: true });
  assert.equal(configured.EXPO_PUBLIC_OPERATOR_NAME, publication.operator);
  assert.equal(configured.EXPO_PUBLIC_SUPPORT_FORM_URL, publication.supportFormUrl);
  assert.equal(configured.EXPO_PUBLIC_SUPPORT_EMAIL, '');
  assert.equal(configured.EXPO_PUBLIC_PRIVACY_POLICY_URL, publication.privacyPolicyUrl);
  assert.equal(configured.EXPO_PUBLIC_WEB_BASE_PATH, '/Torikawa');
  assert.equal(configured.EXPO_PUBLIC_YAHOO_LOOKUP_URL, '/api/yahoo-product');
  assert.equal(configured.EXPO_PUBLIC_SHARED_PRODUCTS_URL, '');
  assert.equal(configured.EXPO_PUBLIC_DEMO_DATA, 'false');
  assert.equal(configured.PATH, 'runtime');
  assert.doesNotMatch(JSON.stringify(configured), /server-secret|legacy-secret|private-server|private-contact|private-form|private-value/);
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
    assert.match(html, /href="https:\/\/example.com\/contact\?source=app&amp;lang=ja">問い合わせフォームを開く/);
    assert.doesNotMatch(html, /mailto:|support@example.com/);
    assert.match(html, /在庫や写真を自動で送信することはありません/);
    assert.match(html, /href="https:\/\/example.com\/privacy"/);
  }
  const sections = require('../shared/dataHandlingSections.json');
  for (const section of sections) assert.ok(page.includes(section.title));
  assert.match(page, /正式なプライバシーポリシーとは別/);
  assert.match(page, /個人の在庫・数量・期限・メモ・写真は共有しません/);
  assert.match(page, /Web版は期限通知に対応していません/);
  assert.match(renderTestGuide(template, { publication: { ...publication, operator: '$& $\u0027 $`' } }), /\$&amp; \$&#39; \$`/);
});

test('HTML contact links reject unsafe form destinations even without the config file loader', () => {
  const template = fs.readFileSync(require.resolve('../web-test/test-guide.html'), 'utf8');
  for (const supportFormUrl of ['javascript:alert(1)', 'http://example.com/contact', 'https://user:password@example.com/contact']) {
    const unsafe = { ...publication, supportFormUrl };
    assert.throws(() => createDataHandlingHtml({ publication: unsafe }));
    assert.throws(() => renderTestGuide(template, { publication: unsafe }));
  }
});

test('configuration check fails without printing invalid file contents', () => {
  const result = spawnSync(process.execPath, ['scripts/check-publication.cjs', 'publication.example.json'], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /operator が未設定/);
  assert.equal(result.stdout, '');
});
