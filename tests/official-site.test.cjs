const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PUBLIC_ASSETS, createOfficialSiteFiles, validateSiteConfig, loadOfficialSiteSources, parseArguments } = require('../scripts/build-official-site.cjs');
const { getGalleryState, initMenu, initGallery, initReveal } = require('../website/site.js');

function inputs() {
  return { ...loadOfficialSiteSources(path.resolve(__dirname, '..')),
    sources: { 'privacy-policy.md': '# プライバシーポリシー\n\nテスト用の本文です。',
      'support.md': '# サポート\n\n[問い合わせ](https://forms.gle/Rjoy4xiwzE7uBDf57)' },
    config: { siteUrl: 'https://example.com/tabedoki/', appStoreUrl: null, googlePlayUrl: null } };
}

test('official site exports a fixed public allowlist and links work under a Pages subdirectory', () => {
  const input = inputs();
  const files = createOfficialSiteFiles(input);
  assert.deepEqual(Object.keys(files).sort(), [...PUBLIC_ASSETS, 'index.html', 'privacy.html', 'support.html', 'site.css', 'site.js', 'robots.txt', 'sitemap.xml', '.nojekyll'].sort());
  assert.match(files['index.html'], /iPhone版 公開準備中/);
  assert.match(files['index.html'], /初回公開のiPhone版は、無料・広告なしで提供する予定です/);
  assert.doesNotMatch(files['index.html'], /料金や課金の有無は、まだ確定していません/);
  assert.doesNotMatch(files['index.html'], /apps\.apple\.com|play\.google\.com|<!--[A-Z_]+-->|<iframe|<form[\s>]/);
  for (const html of [files['index.html'], files['privacy.html'], files['support.html']]) {
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1].replace(/&amp;/g, '&').split('?')[0];
      if (target.startsWith('#')) assert.ok(files['index.html'].includes(`id="${target.slice(1)}"`));
      else if (!target.startsWith('https:') && target !== './') assert.ok(Object.hasOwn(files, target), target);
      assert.equal(target.startsWith('/'), false, 'root-relative paths break project Pages sites');
    }
  }
  assert.match(files['index.html'], /開発中のWeb版を撮影した画面/);
  assert.match(files['index.html'], /料理画像はAI生成のイメージ/);
  assert.equal((files['index.html'].match(/class="gallery-slide"/g) || []).length, 5);
  assert.equal((files['index.html'].match(/<details><summary>/g) || []).length, 7);
  assert.match(files['index.html'], /aria-controls="site-nav"/);
  assert.match(files['site.css'], /prefers-reduced-motion/);
  assert.match(files['privacy.html'], /class="legal-page"/);
  assert.doesNotMatch(files['privacy.html'], /<script|<style>/);
  assert.match(files['sitemap.xml'], /https:\/\/example.com\/tabedoki\/privacy.html/);
  for (const asset of PUBLIC_ASSETS) assert.deepEqual(files[asset], input.assets[asset]);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../website/assets/manifest.json'), 'utf8'));
  for (const screen of manifest.screens) {
    const jpeg = files[`assets/${screen.file}`];
    assert.equal(jpeg.readUInt16BE(0), 0xffd8);
    assert.equal(screen.width, 390);
    assert.equal(screen.height, 844);
    assert.equal(createHash('sha256').update(jpeg).digest('hex'), screen.sha256);
  }
  assert.ok(files['assets/app-icon.png'].length < 100_000, 'use the optimized website icon');
  assert.equal(files['assets/app-icon.png'].readUInt32BE(16), 256);
});

test('unfinished policies block publication while all preview pages and robots discourage indexing', () => {
  const input = inputs();
  input.sources['privacy-policy.md'] += '\n【公開前に設定：保存期間】';
  assert.throws(() => createOfficialSiteFiles(input), /未確定/);
  const files = createOfficialSiteFiles({ ...input, config: {} }, { preview: true });
  assert.match(files['index.html'], /確認用サイトです/);
  for (const file of ['index.html', 'privacy.html', 'support.html']) assert.match(files[file], /noindex, nofollow, noarchive/);
  assert.match(files['robots.txt'], /Disallow: \//);
  assert.equal(Object.hasOwn(files, 'sitemap.xml'), false);
  assert.doesNotMatch(files['index.html'], /rel="canonical"|property="og:url"/);
  const ready = inputs();
  assert.throws(() => createOfficialSiteFiles({ ...ready, config: {} }), /siteUrl/);
  assert.throws(() => createOfficialSiteFiles({ ...ready, html: ready.html.replace('<!--PREVIEW_NOTICE-->', '') }), /テンプレート/);
  assert.throws(() => createOfficialSiteFiles({ ...ready, assets: { ...ready.assets, '.env': 'secret' } }), /公開素材/);
});

test('official site keeps the Yahoo attribution snippet and its normal link appearance', () => {
  const files = createOfficialSiteFiles(inputs());
  const snippet = '<!-- Begin Yahoo! JAPAN Web Services Attribution Snippet -->\n'
    + '<span style="margin:15px 15px 15px 15px"><a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a></span>\n'
    + '<!-- End Yahoo! JAPAN Web Services Attribution Snippet -->';
  assert.ok(files['index.html'].includes(snippet));
  const marginHash = createHash('sha256').update('margin:15px 15px 15px 15px').digest('base64');
  assert.ok(files['index.html'].includes(`style-src-attr 'unsafe-hashes' 'sha256-${marginHash}'`));
  assert.equal(files['index.html'].split('Webサービス by Yahoo! JAPAN').length - 1, 1);
  assert.ok(files['index.html'].indexOf(snippet) > files['index.html'].indexOf('<footer'));
  assert.match(files['site.css'], /a:not\(\[href="https:\/\/developer\.yahoo\.co\.jp\/sitemap\/"\]\)/);
  assert.match(files['site.css'], /\.yahoo-attribution \{ grid-column: 1\/-1; padding-block: 15px; \}/);
});

test('public announcement uses the web notice and excludes unfinished app policy without weakening normal publication checks', () => {
  const input = inputs();
  input.sources['privacy-policy.md'] += '\n【公開前に設定：保存期間】\nUNAPPROVED_APP_POLICY_MUST_NOT_SHIP';
  input.sources['website-privacy.md'] = fs.readFileSync(path.join(__dirname, '../docs/website-privacy.md'), 'utf8');
  const files = createOfficialSiteFiles(input, { announcement: true });
  for (const file of ['index.html', 'privacy.html', 'support.html']) {
    assert.doesNotMatch(files[file], /UNAPPROVED_APP_POLICY_MUST_NOT_SHIP|【公開前に設定|掲載用原稿・未施行|確認用プレビュー|noindex/);
  }
  assert.match(files['index.html'], /class="release-notice"/);
  assert.match(files['index.html'], /iPhoneアプリは公開準備中/);
  assert.match(files['privacy.html'], /Webサイトのデータの取り扱い/);
  assert.match(files['privacy.html'], /GitHub Pages/);
  assert.match(files['privacy.html'], /アプリの正式なプライバシーポリシーは、アプリの配信開始前に掲載/);
  assert.match(files['support.html'], />プライバシーについて<\/a>/);
  assert.match(files['robots.txt'], /Allow: \//);
  assert.ok(Object.hasOwn(files, 'sitemap.xml'));
  assert.throws(() => createOfficialSiteFiles(input), /未確定/);
  assert.throws(() => createOfficialSiteFiles(input, { preview: true, announcement: true }), /同時/);
  delete input.sources['website-privacy.md'];
  assert.throws(() => createOfficialSiteFiles(input, { announcement: true }), /原稿/);
});

test('an announcement cannot be used to publish a store release without its final app policy', () => {
  const input = inputs();
  input.sources['website-privacy.md'] = '# Webサイトのデータの取り扱い\n\nアプリの公開準備中です。';
  input.config.appStoreUrl = 'https://apps.apple.com/jp/app/id123456789';
  assert.throws(() => createOfficialSiteFiles(input, { announcement: true }), /正式なアプリ用ポリシー/);
  assert.deepEqual(parseArguments(['--announcement']), { preview: false, serve: false, port: 8105, announcement: true });
  assert.throws(() => parseArguments(['--announcement', '--preview']), /同時/);
});

test('publishing the real final policy keeps the iPhone release pending and its public links connected', () => {
  const input = loadOfficialSiteSources(path.resolve(__dirname, '..'));
  const files = createOfficialSiteFiles(input);
  assert.match(files['privacy.html'], /制定日・最終更新日：2026年10月26日/);
  assert.match(files['index.html'], /iPhone版 公開準備中/);
  assert.doesNotMatch(files['index.html'], /iPhone版をApp Storeで配信中|apps\.apple\.com|正式なアプリ用プライバシーポリシーは、配信開始前に掲載します/);
  for (const file of ['index.html', 'privacy.html', 'support.html']) {
    assert.match(files[file], /href="privacy.html"/);
    assert.doesNotMatch(files[file], /【公開前に設定：|掲載用原稿・未施行/);
  }
  assert.match(files['sitemap.xml'], /https:\/\/maeken07\.github\.io\/tabedoki-website\/privacy.html/);
});

test('returning visitors get new asset URLs when styles, scripts or screenshots change', () => {
  const input = inputs();
  const before = createOfficialSiteFiles(input);
  const changed = { ...input, css: input.css + '\n/* revised style */', script: input.script + '\n// revised interaction',
    assets: { ...input.assets, 'assets/screens/home.jpg': Buffer.from('revised-image') } };
  const after = createOfficialSiteFiles(changed);
  const reference = (files, name) => files['index.html'].match(new RegExp(`${name.replaceAll('.', '\\.')}\\?v=[a-f0-9]+`))[0];
  for (const name of ['site.css', 'site.js', 'assets/screens/home.jpg']) assert.notEqual(reference(before, name), reference(after, name));
  assert.match(after['privacy.html'], /site\.css\?v=[a-f0-9]{12}/);
  assert.match(after['site.css'], /assets\/feather\.ttf\?v=[a-f0-9]{12}/);
});

test('release links are optional and accept only HTTPS official store pages without changing the iPhone plan', () => {
  const defaults = validateSiteConfig();
  assert.deepEqual(defaults, { siteUrl: null, appStoreUrl: null, googlePlayUrl: null });
  assert.equal(validateSiteConfig({ siteUrl: 'https://example.com/app' }).siteUrl, 'https://example.com/app/');
  for (const config of [null, [], { secret: 'key' }, { siteUrl: 'http://example.com' }, { siteUrl: 'https://user:secret@example.com' },
    { siteUrl: 'https://example.com/?token=x' }, { siteUrl: 'https://example.com/#x' }, { siteUrl: 'https://example.com/\n' },
    { appStoreUrl: 'https://apps.apple.com.evil.test/jp/app/id1234' }, { appStoreUrl: 'javascript:alert(1)' },
    { appStoreUrl: 'https://apps.apple.com/jp/app/no-id' }, { googlePlayUrl: 'https://example.com/store/apps/details?id=app' },
    { googlePlayUrl: 'https://play.google.com/store/apps/details' }]) assert.throws(() => validateSiteConfig(config));
  const input = inputs();
  input.config.appStoreUrl = 'https://apps.apple.com/jp/app/id123456789?pt=123&ct=site';
  const ios = createOfficialSiteFiles(input)['index.html'];
  assert.match(ios, /href="https:\/\/apps.apple.com\/jp\/app\/id123456789\?pt=123&amp;ct=site"/);
  assert.match(ios, /App Storeで見る/);
  assert.match(ios, /iPhone版をApp Storeで配信中/);
  assert.doesNotMatch(ios, /iPhone版 公開準備中|現在はiPhone版の公開準備中/);
  assert.match(ios, /Android版の配信は未定/);
  input.config.googlePlayUrl = 'https://play.google.com/store/apps/details?id=com.example.app';
  assert.match(createOfficialSiteFiles(input)['index.html'], /Google Playで見る/);
  input.config.appStoreUrl = null;
  const android = createOfficialSiteFiles(input)['index.html'];
  assert.match(android, /iPhone版 公開準備中/);
  assert.match(android, /Android版を配信中/);
});

test('local preview arguments validate ports and never enable a public listener or product API', () => {
  assert.deepEqual(parseArguments(['--preview', '--serve']), { preview: true, serve: true, port: 8105 });
  assert.equal(parseArguments(['--preview', '--serve', '--port=8107']).port, 8107);
  for (const args of [['--yahoo'], ['--host=0.0.0.0'], ['--preview', '--preview'], ['--port=8107'],
    ['--serve', '--port=0'], ['--serve', '--port=65536'], ['--serve', '--port=8107', '--port=8108']]) assert.throws(() => parseArguments(args));
});

class Element {
  constructor() {
    this.hidden = false; this.disabled = false; this.attributes = {}; this.handlers = {}; this.textContent = ''; this.focused = false;
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) };
  }
  addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
  emit(name, event = {}) { for (const handler of this.handlers[name] || []) handler(event); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  focus() { this.focused = true; }
  querySelector() { return null; }
}

test('mobile menu closes on navigation, Escape and outside click, and desktop links remain available after resizing', () => {
  const header = new Element(), button = new Element(), nav = new Element(), label = new Element(), icon = new Element();
  const links = [new Element(), new Element()];
  nav.querySelectorAll = () => links;
  button.querySelector = () => icon;
  header.contains = target => [header, button, nav, ...links].includes(target);
  const document = new Element();
  document.querySelector = selector => ({ '#site-header': header, '#menu-toggle': button, '#menu-label': label, '#site-nav': nav })[selector];
  const media = new Element(); media.matches = true;
  initMenu(document, { matchMedia: () => media });
  assert.equal(button.hidden, false); assert.equal(nav.hidden, true);
  button.emit('click');
  assert.equal(nav.hidden, false); assert.equal(button.getAttribute('aria-expanded'), 'true'); assert.equal(label.textContent, '閉じる');
  document.emit('keydown', { key: 'Escape' });
  assert.equal(nav.hidden, true); assert.equal(button.focused, true);
  button.emit('click'); links[0].emit('click'); assert.equal(nav.hidden, true);
  button.emit('click'); document.emit('click', { target: {} }); assert.equal(nav.hidden, true);
  media.matches = false; media.emit('change');
  assert.equal(button.hidden, true); assert.equal(nav.hidden, false);
  media.matches = true; media.emit('change'); assert.equal(nav.hidden, true);
});

test('gallery controls reflect visible screens at mobile, desktop, end positions and high zoom', () => {
  const slides = Array.from({ length: 5 }, (_, index) => ({ left: index * 280, width: 248 }));
  const state = (left, width) => getGalleryState({ scrollLeft: left, clientWidth: width, scrollWidth: 1368, slides });
  assert.deepEqual(state(0, 350), { previousDisabled: true, nextDisabled: false, label: '1 / 5' });
  assert.equal(state(280, 350).label, '2 / 5');
  assert.equal(state(0, 1160).label, '1〜4 / 5');
  assert.deepEqual(state(208, 1160), { previousDisabled: false, nextDisabled: true, label: '2〜5 / 5' });
  assert.equal(state(300, 100).label, '2 / 5');
  assert.equal(state(-10, 350).previousDisabled, true);
});

test('gallery buttons, arrow keys, touch scroll and reduced motion update the same scroll position', () => {
  const track = new Element(), navigation = new Element(), previous = new Element(), next = new Element(), status = new Element();
  track.scrollLeft = 0; track.clientWidth = 350; track.scrollWidth = 1344;
  track.getBoundingClientRect = () => ({ left: 20 });
  const slides = Array.from({ length: 5 }, (_, index) => ({ getBoundingClientRect: () => ({ left: 20 + index * 274 - track.scrollLeft, width: 248 }) }));
  track.querySelectorAll = () => slides;
  let scrollOptions;
  track.scrollTo = options => { scrollOptions = options; track.scrollLeft = options.left; track.emit('scroll'); };
  const document = { querySelector: selector => ({ '#gallery-track': track, '#gallery-navigation': navigation,
    '#gallery-prev': previous, '#gallery-next': next, '#gallery-status': status })[selector] };
  const media = { matches: true };
  initGallery(document, { matchMedia: () => media, requestAnimationFrame: callback => callback(), addEventListener() {} });
  assert.equal(navigation.hidden, false); assert.equal(previous.disabled, true); assert.equal(status.textContent, '1 / 5');
  next.emit('click'); assert.equal(track.scrollLeft, 274); assert.equal(scrollOptions.behavior, 'auto'); assert.equal(status.textContent, '2 / 5');
  let prevented = false;
  track.emit('keydown', { key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(track.scrollLeft, 548);
  track.scrollLeft = 994; track.emit('scroll'); assert.equal(next.disabled, true); assert.equal(status.textContent, '5 / 5');
  previous.emit('click'); assert.equal(track.scrollLeft, 720);
  media.matches = false; next.emit('click'); assert.equal(scrollOptions.behavior, 'smooth');
});

test('scroll reveal progressively enhances content and stops hiding it when reduced motion is selected', () => {
  const elements = [new Element(), new Element()];
  const root = new Element();
  const document = { querySelectorAll: () => elements, documentElement: root };
  const media = new Element(); media.matches = true;
  let calls = 0, observerCallback, disconnected = false;
  class Observer { constructor(callback) { calls++; observerCallback = callback; } observe() {} unobserve() {} disconnect() { disconnected = true; } }
  const window = { matchMedia: () => media, IntersectionObserver: Observer };
  initReveal(document, window); assert.equal(calls, 0); assert.equal(root.classList.contains('reveal-ready'), false);
  media.matches = false; initReveal(document, window);
  assert.equal(elements[0].classList.contains('is-pending'), true);
  observerCallback([{ target: elements[0], isIntersecting: true }]); assert.equal(elements[0].classList.contains('is-pending'), false);
  media.emit('change', { matches: true });
  assert.equal(disconnected, true); assert.ok(elements.every(element => !element.classList.contains('is-pending')));
  assert.doesNotThrow(() => initReveal(document, {}));
});
