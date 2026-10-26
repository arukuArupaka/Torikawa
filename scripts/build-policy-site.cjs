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
      const row = (cells, tag) => `<tr>${cells.map(cell => `<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>`;
      output.push(`<div class="table"><table><thead>${row(rows[0], 'th')}</thead><tbody>${rows.slice(1).map(cells => row(cells, 'td')).join('')}</tbody></table></div>`);
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

function createPolicyPages(sources, { preview = false } = {}) {
  for (const document of documents) {
    const source = sources[document.source];
    if (typeof source !== 'string' || !source.startsWith('# ')) throw new Error('ポリシー・サポートの原稿が見つかりません。');
    if (!preview && /【(?:公開前に設定|運営確認待ち)：|掲載用原稿・未施行/.test(source)) {
      throw new Error('未確定の項目が残っています。正式掲載用の出力は作成できません。確認用には --preview を指定してください。');
    }
  }
  const page = (title, body) => `<!doctype html>
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
</style></head><body><main><nav aria-label="ページの移動"><a href="index.html">たべどき！！</a><a href="privacy.html">プライバシーポリシー</a><a href="support.html">サポート</a></nav>
${preview ? '<aside class="note" role="note">確認用プレビューです。未確定の項目があるため、正式掲載・施行はまだ行っていません。</aside>' : ''}
${body}<footer>たべどき!!運営</footer></main></body></html>\n`;
  return {
    'index.html': page('ご案内', '<h1>たべどき！！</h1><p>食材の期限と残量を管理するiPhoneアプリです。</p><ul><li><a href="privacy.html">プライバシーポリシー</a></li><li><a href="support.html">お問い合わせ・サポート</a></li></ul>'),
    ...Object.fromEntries(documents.map(document => [document.file, page(document.title, renderMarkdown(sources[document.source]))])),
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
