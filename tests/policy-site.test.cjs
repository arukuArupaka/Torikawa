const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPolicyPages, renderMarkdown } = require('../scripts/build-policy-site.cjs');

const sources = {
  'privacy-policy.md': '# プライバシーポリシー\n\n運営者：**たべどき!!運営**\n\n[サポート](support.md)\n\n[Google](https://policies.google.com/privacy?hl=ja)',
  'support.md': '# サポート\n\n[ポリシー](privacy-policy.md)\n\n[問い合わせフォーム](https://forms.gle/Rjoy4xiwzE7uBDf57)',
};

test('public policy output rejects incomplete documents before producing publishable pages', () => {
  for (const marker of ['【公開前に設定：検索サーバー】', '【運営確認待ち：保持期間】', '掲載用原稿・未施行']) {
    for (const file of Object.keys(sources)) {
      assert.throws(() => createPolicyPages({ ...sources, [file]: sources[file] + '\n' + marker }), /未確定/);
    }
  }
  const pages = createPolicyPages(sources);
  assert.equal(Object.keys(pages).length, 3);
  for (const html of Object.values(pages)) assert.doesNotMatch(html, /確認用プレビュー|<script|<iframe|<form[\s>]|src=/);
});

test('preview marks every page as unapproved and keeps source text without leaking operating documents', () => {
  const realSources = Object.fromEntries(Object.keys(sources).map(file => [file, fs.readFileSync(path.join(__dirname, '../docs', file), 'utf8')]));
  const pages = createPolicyPages(realSources, { preview: true });
  assert.deepEqual(Object.keys(pages).sort(), ['index.html', 'privacy.html', 'support.html']);
  for (const html of Object.values(pages)) {
    assert.match(html, /確認用プレビュー/);
    assert.match(html, /noindex, nofollow, noarchive/);
    assert.match(html, /<html lang="ja">/);
    assert.match(html, /width=device-width/);
    assert.doesNotMatch(html, /href="[^"#]*\.md|publication\.local\.json|\.env\.local/);
  }
  assert.match(pages['privacy.html'], /たべどき!!運営/);
  assert.match(pages['support.html'], /返信用メールアドレスは任意/);
});

test('the approved publication sources export the current privacy policy without release or private operating data', () => {
  const realSources = Object.fromEntries(Object.keys(sources).map(file => [file, fs.readFileSync(path.join(__dirname, '../docs', file), 'utf8')]));
  const pages = createPolicyPages(realSources);
  const policy = pages['privacy.html'];
  assert.doesNotMatch(policy, /【(?:公開前に設定|運営確認待ち)：|掲載用原稿・未施行|確認用プレビュー/);
  assert.match(policy, /対応完了から1年を目安に/);
  assert.match(policy, /原則週1回/);
  assert.match(policy, /iPhone版は現在公開準備中/);
  assert.match(policy, /初回公開のiPhone版では、共有商品データベースへの接続・投稿・通報は提供しません/);
  assert.match(policy, /GitHub Pages/);
  assert.match(policy, /Cloudflare Pages/);
  assert.match(policy, /Cloudflare Workers/);
  assert.match(policy, /OpenAIのChatGPT/);
  assert.match(policy, /href="https:\/\/forms\.gle\/Rjoy4xiwzE7uBDf57"/);
  assert.doesNotMatch(policy, /tabedoki-inquiry-notification-state|app-shell|[\w.+-]+@gmail\.com|#all\/[0-9a-f]{16}|予定済みタスクのアクション/);
  assert.match(pages['support.html'], /href="privacy.html"/);
});

test('policy rendering escapes untrusted markup and permits only safe public and internal links', () => {
  const text = '# <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n**<svg>**\n\n[unsafe label <img>](https://example.com/?a=1&b=2)';
  const html = renderMarkdown(text);
  assert.doesNotMatch(html, /<script>|<img |<svg>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  for (const url of ['javascript:alert', 'http://example.com', 'https://user:secret@example.com', '//example.com', '../.env']) {
    assert.throws(() => renderMarkdown(`[link](${url})`), /安全なHTTPS/);
  }
  assert.match(renderMarkdown('[policy](privacy-policy.md)'), /href="privacy.html"/);
  assert.equal(renderMarkdown('[internal planning](privacy-policy-publication.md)'), '<p>internal planning</p>');
  const table = renderMarkdown('| 見出し | 内容 |\n| --- | --- |\n| A | **B** |');
  assert.match(table, /<table role="table">/);
  assert.match(table, /<th role="columnheader" scope="col">見出し<\/th>/);
  assert.match(table, /<th role="rowheader" scope="row">A<\/th>/);
  assert.match(table, /<td role="cell"><strong>B<\/strong><\/td>/);
});

test('policy contents link to every section without hiding or rewriting the approved text', () => {
  const realSources = Object.fromEntries(Object.keys(sources).map(file => [file, fs.readFileSync(path.join(__dirname, '../docs', file), 'utf8')]));
  const html = createPolicyPages(realSources)['privacy.html'];
  const ids = Array.from(html.matchAll(/<h2 id="(policy-section-\d+)" tabindex="-1">/g), match => match[1]);
  assert.equal(ids.length, 11); assert.equal(new Set(ids).size, 11);
  for (const id of ids) {
    assert.equal(html.split(`href="#${id}"`).length - 1, 2, 'desktop and mobile contents must target the same section');
    assert.ok(html.includes(`aria-labelledby="${id}"`));
  }
  assert.match(html, /<details class="policy-mobile-toc"><summary>目次から探す<\/summary>/);
  assert.match(html, /nav aria-label="このページの目次"/);
  assert.match(html, /href="#policy-top">ページの先頭へ/);
  const article = html.match(/<article class="policy-content"[^>]*>([\s\S]*?)<\/article>/)[1];
  const header = html.match(/<header class="policy-header">([\s\S]*?)<\/header>/)[1];
  const text = value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(text(header + article), text(renderMarkdown(realSources['privacy-policy.md'])));
  assert.doesNotMatch(article, /<details|hidden|display:\s*none/);
});

test('policy section links use generated identifiers and escape untrusted heading labels', () => {
  const pages = createPolicyPages({ ...sources,
    'privacy-policy.md': '# プライバシーポリシー\n\n## <img src=x onerror=alert(1)>\n\n本文\n\n## 同じ見出し\n\n次の本文\n\n## 同じ見出し\n\n最後の本文' });
  const html = pages['privacy.html'];
  assert.doesNotMatch(html, /<img|id="<|href="#</);
  assert.match(html, /href="#policy-section-1">&lt;img src=x onerror=alert\(1\)&gt;<\/a>/);
  assert.equal(html.split('id="policy-section-2"').length - 1, 1);
  assert.equal(html.split('id="policy-section-3"').length - 1, 1);
});
