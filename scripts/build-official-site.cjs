'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createPolicyPages } = require('./build-policy-site.cjs');

// Only reviewed public assets enter the output. Never bundle local settings,
// support responses, backups, the Expo application or its inventory database.
const PUBLIC_ASSETS = [
  'assets/app-icon.png', 'assets/feather.ttf', 'assets/licenses.txt',
  ...['home', 'register', 'calendar', 'storage', 'recipes'].map(name => `assets/screens/${name}.jpg`),
];
const escapeHtml = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function validateSiteConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !['siteUrl', 'appStoreUrl', 'googlePlayUrl'].includes(key))) {
    throw new Error('公式サイトの設定項目を確認してください。');
  }
  const result = {};
  for (const key of ['siteUrl', 'appStoreUrl', 'googlePlayUrl']) {
    const value = config[key];
    if (value === undefined || value === null || value === '') { result[key] = null; continue; }
    try {
      if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f\\]/u.test(value)) throw Error();
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error();
      if (key === 'siteUrl') {
        if (url.search) throw Error();
        if (!url.pathname.endsWith('/')) url.pathname += '/';
      } else if (key === 'appStoreUrl') {
        if (url.hostname !== 'apps.apple.com' || !/\/(?:[^/]+\/)*id\d+\/?$/.test(url.pathname)) throw Error();
      } else if (url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details' || !url.searchParams.get('id')) throw Error();
      result[key] = url.href;
    } catch { throw new Error(`${key} には公開先の正しいHTTPS URLを設定してください。`); }
  }
  return result;
}

function releaseContent(config) {
  const ios = config.appStoreUrl, android = config.googlePlayUrl;
  const storeLink = (url, label) => `<a class="button primary store-link" href="${escapeHtml(url)}">${label}<span class="icon icon-arrow-up-right" aria-hidden="true"></span></a>`;
  const actions = [ios ? storeLink(ios, 'App Storeで見る')
    : '<span class="store-pending"><span class="icon icon-smartphone" aria-hidden="true"></span>iPhone版 公開準備中</span>'];
  if (android) actions.push(storeLink(android, 'Google Playで見る'));
  return {
    label: ios ? 'iPhone版をApp Storeで配信中' : android ? 'Android版を配信中・iPhone版は公開準備中' : 'iPhone版 公開準備中',
    actions: actions.join(''),
    detail: ios || android ? '対応端末・料金などは、各ストアの掲載内容をご確認ください。' : '公開後、このサイトからご案内します。公開日は未定です。',
    answer: ios || android ? '公開中のアプリは、<a href="#download">ダウンロード案内</a>からストアでご確認いただけます。' : '現在はiPhone版の公開準備中です。App Storeで公開したら、このサイトにダウンロードリンクを掲載します。',
    devices: ios ? `iPhone向けに配信しています。対応するiOSのバージョンはApp Storeでご確認ください。${android ? 'Android版はGoogle Playでご確認いただけます。' : 'Android版の配信は未定です。'}`
      : `現時点ではiPhone向けに公開を準備しています。対応するiOSのバージョンは公開時にご案内します。${android ? 'Android版はGoogle Playで配信しています。' : 'Android版の配信は未定です。'}`,
  };
}

function createOfficialSiteFiles({ sources, html, css, script, assets, config = {} }, { preview = false, announcement = false } = {}) {
  if (preview && announcement) throw new Error('確認用プレビューと公開案内版は同時に指定できません。');
  // An announcement is a public introduction to an unreleased app. Its web
  // notice is a separate source: never publish the unfinished app policy or
  // silently remove its publication safeguards to make deployment succeed.
  const pageSources = announcement ? { 'privacy-policy.md': sources['website-privacy.md'], 'support.md': sources['support.md'] } : sources;
  const pages = createPolicyPages(pageSources, { preview });
  const settings = validateSiteConfig(config);
  if (!preview && !settings.siteUrl) throw new Error('正式な出力には siteUrl に公開先URLを設定してください。');
  if (announcement && (settings.appStoreUrl || settings.googlePlayUrl)) throw new Error('ストア配信の案内には、正式なアプリ用ポリシーを確定してから通常の出力を使ってください。');
  if (!assets || PUBLIC_ASSETS.some(file => !Object.hasOwn(assets, file))
    || Object.keys(assets).some(file => !PUBLIC_ASSETS.includes(file))) throw new Error('公式サイトの公開素材を確認してください。');
  const release = releaseContent(settings);
  const seo = ['<meta property="og:type" content="website">', '<meta property="og:locale" content="ja_JP">',
    '<meta property="og:site_name" content="たべどき！！">', '<meta property="og:title" content="たべどき！！｜その食材、忘れてない？">',
    '<meta property="og:description" content="冷蔵庫の中身も、食材の期限も。食材をムダにしない毎日へ。">'];
  if (!preview && settings.siteUrl) seo.push(`<link rel="canonical" href="${escapeHtml(settings.siteUrl)}">`,
    `<meta property="og:url" content="${escapeHtml(settings.siteUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(new URL('assets/app-icon.png', settings.siteUrl).href)}">`,
    '<meta property="og:image:alt" content="たべどき！！の葉っぱ時計のアイコン">',
    '<meta property="og:image:width" content="256">', '<meta property="og:image:height" content="256">');
  const replacements = {
    PREVIEW_META: preview ? '<meta name="robots" content="noindex, nofollow, noarchive">' : '',
    PREVIEW_NOTICE: preview ? '<aside class="preview-notice">確認用サイトです。アプリの一般公開・正式ポリシーの掲載は準備中です。</aside>'
      : announcement ? '<aside class="release-notice">iPhoneアプリは公開準備中です。正式なアプリ用プライバシーポリシーは、配信開始前に掲載します。</aside>' : '',
    SEO_META: seo.join('\n  '), RELEASE_LABEL: escapeHtml(release.label), DOWNLOAD_ACTIONS: release.actions,
    DOWNLOAD_DETAIL: escapeHtml(release.detail), DOWNLOAD_ANSWER: release.answer, DEVICE_ANSWER: escapeHtml(release.devices),
  };
  let index = html;
  for (const [name, replacement] of Object.entries(replacements)) {
    const marker = `<!--${name}-->`;
    if (typeof index !== 'string' || index.split(marker).length !== 2) throw new Error('公式サイトのテンプレートを確認してください。');
    index = index.replace(marker, replacement);
  }
  const privacyLabel = page => announcement ? page.replaceAll('>プライバシーポリシー</a>', '>プライバシーについて</a>')
    .replace('<title>プライバシーポリシー |', '<title>Webサイトのデータの取り扱い |') : page;
  index = privacyLabel(index);
  // Keep the reviewed policy renderer and its publication checks intact, while
  // using the same readable typography and colors across the official site.
  const themedPages = Object.fromEntries(['privacy.html', 'support.html'].map(file => {
    const themed = pages[file].replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="site.css">')
      .replace("style-src 'unsafe-inline'", "style-src 'self'").replace('<body>', '<body class="legal-page">');
    return [file, privacyLabel(themed)];
  }));
  // Content versions let returning visitors receive changed styles, scripts
  // and images even when a static host caches the previous asset URL.
  const version = content => createHash('sha256').update(content).digest('hex').slice(0, 12);
  const versionedCss = css.replace('url("assets/feather.ttf")', `url("assets/feather.ttf?v=${version(assets['assets/feather.ttf'])}")`);
  const assetContents = { ...assets, 'site.css': versionedCss, 'site.js': script };
  const versionLinks = page => page.replace(/(href|src)="([^"]+)"/g, (match, attribute, file) =>
    Object.hasOwn(assetContents, file) ? `${attribute}="${file}?v=${version(assetContents[file])}"` : match);
  const files = { ...Object.fromEntries(Object.entries(themedPages).map(([file, page]) => [file, versionLinks(page)])),
    'index.html': versionLinks(index), 'site.css': versionedCss, 'site.js': script,
    ...assets, '.nojekyll': '', 'robots.txt': preview ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', settings.siteUrl).href}\n` };
  if (!preview) files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + ['', 'privacy.html', 'support.html'].map(file => `<url><loc>${escapeHtml(new URL(file, settings.siteUrl).href)}</loc></url>`).join('\n') + '\n</urlset>\n';
  return files;
}

function loadOfficialSiteSources(root) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  return {
    sources: Object.fromEntries(['privacy-policy.md', 'website-privacy.md', 'support.md'].map(file => [file, read(`docs/${file}`)])),
    html: read('website/index.html'), css: read('website/site.css'), script: read('website/site.js'),
    assets: Object.fromEntries(PUBLIC_ASSETS.map(file => [file, fs.readFileSync(path.join(root, 'website', file))])),
    config: JSON.parse(read('website/site-config.json')),
  };
}

function buildOfficialSite(root, options) {
  const files = createOfficialSiteFiles(loadOfficialSiteSources(root), options);
  const outputRoot = path.join(root, 'dist-web-test');
  fs.mkdirSync(outputRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(outputRoot, 'site-official-'));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return { directory, preview: Boolean(options?.preview), ...(options?.announcement ? { announcement: true } : {}), fileCount: Object.keys(files).length };
}

function parseArguments(args) {
  if (new Set(args).size !== args.length || args.some(arg => !['--preview', '--announcement', '--serve'].includes(arg) && !/^--port=\d+$/.test(arg))
    || args.filter(arg => arg.startsWith('--port=')).length > 1) throw new Error('使い方: npm run site:build -- [--preview | --announcement] [--serve] [--port=8105]');
  if (args.includes('--preview') && args.includes('--announcement')) throw new Error('確認用プレビューと公開案内版は同時に指定できません。');
  const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) || 8105);
  if (port < 1 || port > 65535 || (!args.includes('--serve') && args.some(arg => arg.startsWith('--port=')))) throw new Error('表示用ポートを確認してください。');
  return { preview: args.includes('--preview'), serve: args.includes('--serve'), port, ...(args.includes('--announcement') ? { announcement: true } : {}) };
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const root = path.resolve(__dirname, '..');
    const result = buildOfficialSite(root, options);
    console.log(JSON.stringify(result));
    if (options.serve) {
      console.log(`公式サイトの確認: http://127.0.0.1:${options.port}/index.html`);
      const child = spawn(process.execPath, [path.join(__dirname, 'serve-web-test.cjs'), result.directory, String(options.port)], { stdio: 'inherit' });
      child.on('error', error => { console.error(error.message); process.exitCode = 1; });
      child.on('exit', code => { process.exitCode = code ?? 0; });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { PUBLIC_ASSETS, createOfficialSiteFiles, validateSiteConfig, loadOfficialSiteSources, buildOfficialSite, parseArguments };
