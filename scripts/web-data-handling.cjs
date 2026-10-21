'use strict';
const sections = require('../shared/dataHandlingSections.json');
const { validatePublicationConfig } = require('./publication-config.cjs');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function contactHtml(publication) {
  if (!publication) return '<p>正式なプライバシーポリシー・運営者・問い合わせフォームは準備中です。</p>';
  publication = validatePublicationConfig(publication);
  return `<p>運営者：${escapeHtml(publication.operator)}</p><p><a href="${escapeHtml(publication.privacyPolicyUrl)}">プライバシーポリシーを開く</a></p><p><a href="${escapeHtml(publication.supportFormUrl)}">問い合わせフォームを開く</a></p><p>外部のフォームが開きます。在庫や写真を自動で送信することはありません。</p>`;
}

function productSearchDescription(yahooEnabled) {
  return yahooEnabled
    ? '端末の商品候補、Yahooの商品名検索、Open Food Factsを利用します。Yahooの商品画像は使用しません。共有商品DBへの接続は設定していません。'
    : '端末の商品候補とOpen Food Factsを利用します。Yahoo検索と共有商品DBへの接続は設定していません。';
}

function createDataHandlingHtml({ publication = null, yahooEnabled = false } = {}) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>たべどき！！ Webテスト版のデータの取り扱い</title>
  <style>
    body { margin: 0; background: #f6f8f5; color: #203629; font: 16px/1.8 system-ui, sans-serif; }
    main { max-width: 680px; margin: auto; padding: 24px 20px 56px; overflow-wrap: anywhere; }
    h1 { font-size: 25px; line-height: 1.4; } h2 { font-size: 19px; margin-top: 28px; }
    a { color: #167638; } a:focus-visible { outline: 3px solid #167638; outline-offset: 4px; }
    .note { background: #eaf7ed; padding: 16px; border-radius: 12px; }
  </style>
</head>
<body><main>
  <p><a href="./">← アプリへ戻る</a> · <a href="./test-guide.html">テスト版の使い方</a></p>
  <h1>Webテスト版のデータの取り扱い</h1>
  <p class="note">このページは現在のアプリの動作説明です。正式なプライバシーポリシーとは別です。${escapeHtml(productSearchDescription(yahooEnabled))}</p>
  ${sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p></section>`).join('\n  ')}
  <section><h2>ブラウザーの保存先</h2><p>同じ端末・ブラウザー・サイトで利用してください。URLのホスト名が変わると保存先も変わり、在庫は自動で移りません。必要なデータは旧URLが使える間にバックアップし、新しいURLで復元してください。ブラウザーのサイトデータ消去や容量制限で失われる場合もあります。</p></section>
  <section><h2>お問い合わせ</h2>${contactHtml(publication)}</section>
</main></body>
</html>
`;
}

function renderTestGuide(template, options = {}) {
  return template.replace('<!--PRODUCT_SEARCH_DESCRIPTION-->', () => escapeHtml(productSearchDescription(options.yahooEnabled)))
    .replace('<!--PUBLICATION_CONTACT-->', () => contactHtml(options.publication));
}

module.exports = { createDataHandlingHtml, renderTestGuide };
