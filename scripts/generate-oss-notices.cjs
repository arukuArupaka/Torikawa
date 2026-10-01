const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const notices = [], missing = [], visited = new Set(), included = new Set();
function resolvePackage(name, from) {
  let current = from;
  while (true) {
    const candidate = path.join(current, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return fs.realpathSync(path.dirname(candidate));
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
const pending = Object.keys(rootManifest.dependencies).map((name) => ({ name, from: root, required: true }));
while (pending.length) {
  const { name, from, required } = pending.pop();
  const directory = resolvePackage(name, from);
  if (!directory) { if (required) missing.push({ package: name, reason: 'dependency not installed' }); continue; }
  if (visited.has(directory)) continue;
  visited.add(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
    pending.push({ name: dependency, from: directory,
      required: Boolean(manifest.dependencies?.[dependency]) && !manifest.optionalDependencies?.[dependency] });
  }
  const identity = `${manifest.name}@${manifest.version}`;
  if (included.has(identity)) continue;
  included.add(identity);
  const files = fs.readdirSync(directory).filter((name) => /^(licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const extra = manifest.name === '@expo/vector-icons' ? ['build/vendor/react-native-vector-icons/LICENSE'] : [];
  const documents = [...files, ...extra].map((name) => ({ file: name, text: fs.readFileSync(path.join(directory, name), 'utf8').trim() }));
  if (!documents.length) missing.push({ package: `${manifest.name}@${manifest.version}`, reason: 'license text not found at package root' });
  notices.push({ name: manifest.name, version: manifest.version, license: typeof manifest.license === 'string' ? manifest.license : 'See included notice', documents });
}
notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
fs.mkdirSync(path.join(root, 'src/data/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/data/generated/oss-notices.json'), JSON.stringify(notices, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'docs/oss-notice-coverage.json'), JSON.stringify({
  scope: 'Installed dependency graph from package.json dependencies (including installed peers/optional dependencies); includes build tools. Native/OS/font dependencies require final-build review.',
  packages: notices.length, withText: notices.filter((entry) => entry.documents.length).length, missing,
}, null, 2) + '\n');
console.log(`Collected ${notices.length} npm packages; ${missing.length} entries need review. See docs/oss-notice-coverage.json.`);
