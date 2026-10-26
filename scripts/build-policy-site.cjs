'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Only these two reviewed documents enter the upload folder. Local settings,
// operating procedures and application data must never be copied alongside them.
const documents = [
  { source: 'privacy-policy.md', file: 'privacy.html', title: 'プライバシーポリシー' },
  { source: 'support.md', file: 'support.html', title: 'サポート' },
];
const escapeHtml = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function linkTarget(value) {
  const local = documents.find(document => document.source === value);
  if (local) return local.file;
  // Planning documents are useful in the source but are not public site pages.
  if (/^[a-z0-9-]+\.md(?:#[a-z0-9-]+)?$/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || /[\u0000-\u001f\u007f]/.test(value)) throw Error();
    return url.href;
  } catch { throw new Error('ポリシー原稿のリンクには安全なHTTPS URLを指定してください。'); }
}

function inline(text) {
  const tokens = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let result = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    result += escapeHtml(text.slice(offset, match.index));
    if (match[1] !== undefined) {
      const target = linkTarget(match[2]);
      result += target ? `<a href="${escapeHtml(target)}">${escapeHtml(match[1])}</a>` : escapeHtml(match[1]);
    } else if (match[3] !== undefined) result += `<strong>${escapeHtml(match[3])}</strong>`;
    else result += `<code>${escapeHtml(match[4])}</code>`;
    offset = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(offset));
}

// A deliberately small renderer for the headings, paragraphs, lists and tables
// used by these documents. Raw HTML is always displayed as text, never executed.
function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) { output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); index++; continue; }
    if (line.startsWith('> ')) { output.push(`<aside class="note">${inline(line.slice(2))}</aside>`); index++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        const cells = lines[index++].replace(/^\|\s*|\s*\|$/g, '').split('|').map(cell => cell.trim());
        if (cells.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
        rows.push(cells);
      }
      const row = (cells, header) => `<tr role="row">${cells.map((cell, index) => {
        const heading = header || index === 0;
        const tag = heading ? 'th' : 'td';
        return `<${tag} role="${header ? 'columnheader' : heading ? 'rowheader' : 'cell'}"${heading ? ` scope="${header ? 'col' : 'row'}"` : ''}>${inline(cell)}</${tag}>`;
      }).join('')}</tr>`;
      output.push(`<div class="table"><table role="table"><thead role="rowgroup">${row(rows[0], true)}</thead><tbody role="rowgroup">${rows.slice(1).map(cells => row(cells, false)).join('')}</tbody></table></div>`);
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (index < lines.length && lines[index].startsWith('- ')) items.push(`<li>${inline(lines[index++].slice(2))}</li>`);
      output.push(`<ul>${items.join('')}</ul>`); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3} |> |\||- )/.test(lines[index])) paragraph.push(lines[index++]);
    output.push(`<p>${inline(paragraph.join('\n'))}</p>`);
  }
  return output.join('\n');
}

function policyDocument(body) {
  const title = body.match(/^<h1>[\s\S]*?<\/h1>/)?.[0] || '';
  let content = body.slice(title.length).trimStart();
  const date = content.match(/^<p>制定日[\s\S]*?<\/p>/)?.[0] || '';
  content = content.slice(date.length).trimStart();
  const headings = [];
  content = content.replace(/<h2>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2>|$)/g, (_match, heading, text) => {
    const id = `policy-section-${headings.length + 1}`;
    headings.push({ id, label: heading.replace(/<[^>]*>/g, '') });
    return `<section class="policy-section" aria-labelledby="${id}"><h2 id="${id}" tabindex="-1">${heading}</h2>${text}</section>`;
  });
  const links = headings.map(({ id, label }) => `<li><a href="#${id}">${label}</a></li>`).join('');
  const toc = links ? `<aside class="policy-sidebar"><nav aria-label="このページの目次"><p class="policy-toc-title">このページの内容</p><ol>${links}</ol></nav></aside>` : '';
  const mobileToc = links ? `<details class="policy-mobile-toc"><summary>目次から探す</summary><nav aria-label="このページの目次（スマートフォン）"><ol>${links}</ol></nav></details>` : '';
  const heading = title.replace('<h1>たべどき！！ ', '<h1><span class="policy-title-brand">たべどき！！</span> ');
  return `<header class="policy-header">${heading}${date}</header>${mobileToc}<div class="policy-layout">${toc}<article class="policy-content" aria-label="プライバシーポリシー本文">${content}</article></div>`;
}

function createPolicyPages(sources, { preview = false } = {}) {
  for (const document of documents) {
    const source = sources[document.source];
    if (typeof source !== 'string' || !source.startsWith('# ')) throw new Error('ポリシー・サポートの原稿が見つかりません。');
    if (!preview && /【(?:公開前に設定|運営確認待ち)：|掲載用原稿・未施行/.test(source)) {
      throw new Error('未確定の項目が残っています。正式掲載用の出力は作成できません。確認用には --preview を指定してください。');
    }
  }
  const page = (title, body, policy = false) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">
${preview ? '<meta name="robots" content="noindex, nofollow, noarchive">' : ''}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)} | たべどき！！</title><style>
* { box-sizing: border-box; } body { margin: 0; color: #203629; background: #f6f8f5; font: 16px/1.85 system-ui, sans-serif; }
main { max-width: 860px; margin: auto; padding: 28px 20px 64px; overflow-wrap: anywhere; } nav { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 24px; }
a { color: #146c34; text-underline-offset: 3px; } a:focus-visible { outline: 3px solid #146c34; outline-offset: 4px; } nav a { padding: 8px 0; }
h1 { font-size: clamp(25px, 5vw, 34px); line-height: 1.5; } h2 { font-size: 21px; margin-top: 36px; } h3 { font-size: 18px; }
.note { border-left: 4px solid #9b7200; background: #fff7df; padding: 16px; border-radius: 8px; margin: 24px 0; } ul { padding-left: 24px; }
.table { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 15px; } th, td { border: 1px solid #d6dfd7; padding: 12px; text-align: left; vertical-align: top; } th { background: #e9f5eb; }
code { overflow-wrap: anywhere; } footer { border-top: 1px solid #d6dfd7; margin-top: 36px; padding-top: 16px; font-size: 14px; }
main.policy-document { max-width: 1120px; } .policy-header { margin-bottom: 40px; } .policy-title-brand { display: block; font-size: 15px; color: #146c34; margin-bottom: 10px; }
.policy-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 48px; } .policy-content { min-width: 0; } .policy-sidebar { align-self: start; position: sticky; top: 24px; }
.policy-sidebar nav { display: block; max-height: calc(100dvh - 48px); overflow: auto; border: 1px solid #d6dfd7; border-radius: 16px; padding: 16px; }
.policy-sidebar ol, .policy-mobile-toc ol { list-style: none; padding: 0; margin: 0; } .policy-sidebar a, .policy-mobile-toc a { display: block; padding: 10px 0; font-size: 14px; }
.policy-toc-title { font-weight: 700; } .policy-mobile-toc { display: none; } .policy-section { scroll-margin-top: 24px; } .policy-section + .policy-section { border-top: 1px solid #d6dfd7; padding-top: 24px; margin-top: 36px; }
.policy-content h2 { margin-top: 0; } .policy-content p, .policy-content li { line-height: 2; } .policy-content li + li { margin-top: 12px; } .policy-content table { font-size: 16px; table-layout: fixed; } .policy-content th:first-child { width: 28%; }
@media (max-width: 900px) { .policy-layout { display: block; } .policy-sidebar { display: none; } .policy-mobile-toc { display: block; padding: 16px 20px; margin-bottom: 32px; border: 1px solid #d6dfd7; border-radius: 12px; } .policy-mobile-toc summary { cursor: pointer; font-weight: 700; } .policy-header h1 { font-size: clamp(24px, 6vw, 34px); } }
@media (max-width: 600px) { .policy-content table, .policy-content tbody, .policy-content tr, .policy-content th, .policy-content td { display: block; width: 100%; } .policy-content thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); } .policy-content tr { margin-bottom: 18px; } .policy-content tbody th:first-child { width: 100%; background: #e9f5eb; } }
</style></head><body><main${policy ? ' class="policy-document" id="policy-top"' : ''}><nav aria-label="ページの移動"><a href="index.html">たべどき！！</a><a href="privacy.html">プライバシーポリシー</a><a href="support.html">サポート</a></nav>
${preview ? '<aside class="note" role="note">確認用プレビューです。未確定の項目があるため、正式掲載・施行はまだ行っていません。</aside>' : ''}
${policy ? policyDocument(body) : body}<footer>たべどき!!運営${policy ? ' · <a href="#policy-top">ページの先頭へ</a>' : ''}</footer></main></body></html>\n`;
  return {
    'index.html': page('ご案内', '<h1>たべどき！！</h1><p>食材の期限と残量を管理するiPhoneアプリです。</p><ul><li><a href="privacy.html">プライバシーポリシー</a></li><li><a href="support.html">お問い合わせ・サポート</a></li></ul>'),
    ...Object.fromEntries(documents.map(document => [document.file, page(document.title, renderMarkdown(sources[document.source]), document.file === 'privacy.html')])),
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--preview') || args.length > 1) throw new Error('使い方: npm run policy:build -- [--preview]');
    const root = path.resolve(__dirname, '..');
    const sources = Object.fromEntries(documents.map(document => [document.source, fs.readFileSync(path.join(root, 'docs', document.source), 'utf8')]));
    const pages = createPolicyPages(sources, { preview: args.includes('--preview') });
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, 'dist', 'policy-'));
    for (const [file, html] of Object.entries(pages)) fs.writeFileSync(path.join(directory, file), html);
    console.log(JSON.stringify({ directory, preview: args.includes('--preview') }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { createPolicyPages, renderMarkdown };
