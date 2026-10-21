require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const semver = require('semver');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const workflow = (file) => {
  const document = YAML.parseDocument(read(`.github/workflows/${file}`));
  assert.deepEqual(document.errors, [], 'workflow YAML must parse without errors');
  return document.toJS();
};

function assertNodeSetup(steps) {
  const checkout = steps.findIndex((step) => /^actions\/checkout@/.test(step.uses));
  const setup = steps.findIndex((step) => /^actions\/setup-node@/.test(step.uses));
  assert.ok(checkout >= 0 && setup > checkout, 'checkout must precede reading .nvmrc');
  assert.equal(steps[setup].with['node-version-file'], '.nvmrc');
  assert.equal(steps[setup].with['node-version'], undefined, 'a literal version must not override .nvmrc');
  assert.equal(steps[setup].with.cache, 'npm');
  assert.deepEqual(steps.slice(setup + 1, setup + 4).map((step) => step.run), ['npm ci', 'npm test', 'npm run typecheck']);
  for (const step of steps.slice(setup + 1, setup + 4)) {
    assert.equal(step['continue-on-error'], undefined, 'failed checks must fail the workflow');
    assert.equal(step.if, undefined, 'checks must run in order after successful earlier steps');
  }
}

test('CI runs install, tests and typecheck for main pushes and PRs with read-only repository access', () => {
  const ci = workflow('ci.yml');
  assert.deepEqual(ci.on, { push: { branches: ['main'] }, pull_request: null });
  assert.deepEqual(ci.permissions, { contents: 'read' });
  const jobs = Object.values(ci.jobs);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]['runs-on'], 'ubuntu-latest');
  assert.equal(jobs[0].permissions, undefined, 'the job must retain read-only workflow permissions');
  assert.equal(jobs[0].if, undefined);
  assertNodeSetup(jobs[0].steps);
  assert.equal(jobs[0].steps.some((step) => /pages|deploy/.test(step.uses || '')), false, 'automatic CI must not publish Pages');
});

test('Node 24 selection and the package/lockfile requirement agree, including the minimum and maximum', () => {
  assert.equal(read('.nvmrc').trim(), '24');
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(manifest.engines.node, '>=24.19 <25');
  assert.deepEqual(lock.packages[''].engines, manifest.engines);
  for (const [version, supported] of [
    ['22.19.0', false], ['24.18.0', false], ['24.19.0', true], ['24.21.0', true], ['25.0.0', false],
  ]) assert.equal(semver.satisfies(version, manifest.engines.node), supported, version);
});

test('Pages shares .nvmrc and the check sequence while retaining manual publication and deployment permissions', () => {
  const pages = workflow('web-test-pages.yml');
  assert.deepEqual(pages.on, { workflow_dispatch: null });
  assert.deepEqual(pages.permissions, { contents: 'read' });
  assertNodeSetup(pages.jobs.build.steps);
  assert.deepEqual(pages.jobs.build.permissions, { contents: 'read', pages: 'read' });
  const exportStep = pages.jobs.build.steps.find((step) => step.id === 'export');
  assert.equal(exportStep.run, 'node scripts/export-web-test.cjs --github-pages --base-path "$PAGES_BASE_PATH"');
  assert.equal(exportStep.env.PAGES_BASE_PATH, '${{ steps.pages.outputs.base_path }}');
  const upload = pages.jobs.build.steps.find((step) => /^actions\/upload-pages-artifact@/.test(step.uses));
  assert.equal(upload.with.path, '${{ steps.export.outputs.directory }}');
  assert.equal(pages.jobs.deploy.needs, 'build');
  assert.deepEqual(pages.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.equal(pages.jobs.deploy.environment.name, 'github-pages');
  assert.ok(pages.jobs.deploy.steps.some((step) => /^actions\/deploy-pages@/.test(step.uses)));
});
