const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readPublicationConfig, createWebTestEnvironment } = require('./publication-config.cjs');
const { createDataHandlingHtml, renderTestGuide } = require('./web-data-handling.cjs');

const args = process.argv.slice(2);
const githubPages = args.includes('--github-pages');
const yahooEnabled = args.includes('--yahoo');
if (githubPages && yahooEnabled) throw new Error('GitHub Pagesには検索APIを配置できません。別途HTTPSの検索APIを設定してください。');
const basePathIndex = args.indexOf('--base-path');
const basePath = basePathIndex >= 0 ? args[basePathIndex + 1] : githubPages ? '/Torikawa' : '';
if (basePath === undefined || (basePath && !/^\/[A-Za-z0-9_-]+$/.test(basePath))) {
  throw new Error('--base-pathは /repository-name または空文字で指定してください。');
}
const root = path.resolve(__dirname, '..');
const publicationIndex = args.indexOf('--publication-config');
let publication = null;
if (publicationIndex >= 0) {
  const file = args[publicationIndex + 1];
  if (!file || file.startsWith('--') || args.filter(arg => arg === '--publication-config').length !== 1) {
    throw new Error('--publication-config の後に公開設定ファイルを1つ指定してください。');
  }
  publication = readPublicationConfig(path.resolve(file));
}
const exportsRoot = path.join(root, 'dist-web-test');
fs.mkdirSync(exportsRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(exportsRoot, 'site-'));

// Never read local .env files or inherit a developer's API identifiers and
// private-network URLs into the files being handed to friends.
const environment = createWebTestEnvironment(process.env, { basePath, yahooEnabled, publication });

const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export',
  '--platform', 'web', '--max-workers', '2', '--clear', '--output-dir', output], {
  cwd: root, env: environment, stdio: 'inherit',
});
if (result.error || result.status !== 0) {
  console.error('Web版の書き出しに失敗しました。このフォルダーは配布しないでください。');
  process.exit(result.status || 1);
}
if (!fs.existsSync(path.join(output, 'index.html'))) throw new Error('index.htmlがありません。配布を中止します。');

fs.writeFileSync(path.join(output, 'test-guide.html'), renderTestGuide(
  fs.readFileSync(path.join(root, 'web-test/test-guide.html'), 'utf8'), { publication, yahooEnabled }));
fs.writeFileSync(path.join(output, 'data-handling.html'), createDataHandlingHtml({ publication, yahooEnabled }));
const indexFile = path.join(output, 'index.html');
const indexHtml = fs.readFileSync(indexFile, 'utf8').replace('</head>',
  '<meta name="robots" content="noindex, nofollow, noarchive"></head>');
fs.writeFileSync(indexFile, indexHtml);
if (githubPages) {
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  fs.writeFileSync(path.join(output, '404.html'), indexHtml);
} else {
  fs.writeFileSync(path.join(output, '_redirects'), '/* /index.html 200\n');
  fs.writeFileSync(path.join(output, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/index.html\n  Cache-Control: no-cache\n');
}
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `directory=${path.relative(root, output).split(path.sep).join('/')}\n`);
}
console.log(`\n配布用フォルダー: ${output}\nまだネット上には公開していません。\n手順: docs/web-friend-testing.md`);
