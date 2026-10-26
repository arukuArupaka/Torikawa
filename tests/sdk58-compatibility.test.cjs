require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const files = new Map();
const calls = [];
let failWrite = false;
class File {
  constructor(...parts) { this.uri = parts.join('/'); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  // SDK 58's write() is asynchronous; the synchronous restore must not call it.
  write() { throw Error('use writeSync before checking or sharing the file'); }
  writeSync(value, options) {
    calls.push('write');
    if (failWrite) throw Error('disk full');
    files.set(this.uri, Buffer.from(value, options?.encoding === 'base64' ? 'base64' : 'utf8'));
  }
}
function Swipeable({ ref, ...props }) {
  React.useImperativeHandle(ref, () => ({ close() { calls.push('close'); } }), []);
  return React.createElement('Swipeable', props, props.children);
}
function NativeImage(props) { return React.createElement('Image', props); }
NativeImage.resolveAssetSource = () => undefined;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'expo-file-system') return { File, Paths: { cache: 'file:///cache', document: 'file:///document' } };
  if (request === 'expo-sharing') return { isAvailableAsync: async () => true,
    shareAsync: async (uri) => { assert.ok(files.has(uri)); calls.push(['share', files.get(uri).toString()]); } };
  if (request === './storage') return { getStorageEpoch: () => 1, assertStorageEpoch() {} };
  if (request === 'react-native') return { View: 'View', Text: 'Text', Image: NativeImage,
    Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: { OS: 'web' },
    Alert: { alert() {} }, StyleSheet: { create: value => value } };
  if (request === 'react-native-gesture-handler/ReanimatedSwipeable') return { __esModule: true, default: Swipeable };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === './FoodCard') return { FoodCard: props => React.createElement('FoodCard', props) };
  return originalLoad.call(this, request, ...args);
};
const { shareJsonFile } = require('../src/services/backupFileAccess.ts');
const { restoreImage } = require('../src/services/backupImages.ts');
const { SwipeableFoodCard } = require('../src/components/SwipeableFoodCard.tsx');
const { FoodImage } = require('../src/components/FoodImage.tsx');
const { AppAlertProvider, useAppAlert } = require('../src/context/AppAlertContext.tsx');
function reset() { files.clear(); calls.length = 0; failWrite = false; }

test('SDK 58 backup sharing writes the complete JSON before opening the share sheet', async () => {
  reset();
  const contents = JSON.stringify({ name: '牛乳🥛', version: 2 });
  await shareJsonFile(contents, 'backup.json', 'バックアップを保存');
  assert.deepEqual(calls, ['write', ['share', contents]]);
});

test('a failed SDK 58 file write rejects backup export without sharing a missing file', async () => {
  reset(); failWrite = true;
  await assert.rejects(shareJsonFile('{}', 'backup.json', 'バックアップを保存'), /disk full/);
  assert.deepEqual(calls, ['write']);
  assert.equal(files.size, 0);
});

test('embedded backup photos finish writing synchronously before their size is checked and their URI is returned', () => {
  reset();
  const contents = Buffer.from('saved-photo');
  const created = [];
  const uri = restoreImage(`data:image/jpeg;base64,${contents.toString('base64')}`, 'food', created);
  assert.deepEqual(created, [uri]);
  assert.deepEqual(files.get(uri), contents);
  assert.deepEqual(calls, ['write']);
  failWrite = true;
  assert.throws(() => restoreImage('data:image/jpeg;base64,YWJj', 'food', created), /disk full/);
});

test('the successor swipeable keeps right swipe for disposal and left swipe for use, closing before confirmation', async (t) => {
  reset();
  const food = { id: 'milk', name: '牛乳' };
  let renderer;
  await act(async () => { renderer = create(React.createElement(SwipeableFoodCard, {
    food, onPress: () => calls.push('detail'), onMarkUsed: () => calls.push('used'), onMarkDisposed: () => calls.push('disposed'),
  })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const row = renderer.root.findByType('Swipeable');
  assert.equal(row.props.leftThreshold, 72); assert.equal(row.props.rightThreshold, 72);
  assert.equal(row.props.friction, 2); assert.equal(row.props.overshootLeft, false); assert.equal(row.props.overshootRight, false);
  assert.ok(JSON.stringify(row.props.renderLeftActions()).includes('捨てた'));
  assert.ok(JSON.stringify(row.props.renderRightActions()).includes('使い切った'));
  // Gesture Handler 3 reports the finger's direction, instead of the revealed side.
  await act(async () => row.props.onSwipeableOpen('right'));
  await act(async () => row.props.onSwipeableOpen('left'));
  await act(async () => renderer.root.findByType('FoodCard').props.onPress());
  assert.deepEqual(calls, ['close', 'disposed', 'close', 'used', 'detail']);
  assert.strictEqual(renderer.root.findByType('FoodCard').props.food, food);
});

test('readonly image-source arrays preserve placeholders on failure and retry after the source changes', async (t) => {
  const first = Object.freeze([Object.freeze({ uri: 'file:///old.jpg' })]);
  const next = Object.freeze([Object.freeze({ uri: 'file:///new.jpg' })]);
  let renderer;
  await act(async () => { renderer = create(React.createElement(FoodImage, { source: first })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.strictEqual(renderer.root.findByType('Image').props.source, first);
  await act(async () => renderer.root.findByType('Image').props.onError({}));
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.ok(renderer.root.findByProps({ accessibilityLabel: '写真を表示できません' }));
  await act(async () => renderer.update(React.createElement(FoodImage, { source: next })));
  assert.strictEqual(renderer.root.findByType('Image').props.source, next);
});

test('the web alert accepts nullable title and message from the new native Alert signature', async (t) => {
  let show, renderer;
  function Probe() { show = useAppAlert(); return null; }
  await act(async () => { renderer = create(React.createElement(AppAlertProvider, null, React.createElement(Probe))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => show(null, null));
  assert.equal(renderer.root.findByType('Modal').props.visible, true);
  assert.ok(renderer.root.findAllByType('Text').some(node => node.props.children === 'OK'));
  await act(async () => renderer.root.findByType('Pressable').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
});

test('an unresolved native recipe asset does not throw while the bundled catalog is loaded', (t) => {
  const jpgLoader = require.extensions['.jpg'];
  require.extensions['.jpg'] = module => { module.exports = 42; };
  t.after(() => { if (jpgLoader) require.extensions['.jpg'] = jpgLoader; else delete require.extensions['.jpg']; });
  const { generatedRecipeImages } = require('../src/data/generatedRecipeImages.ts');
  assert.ok(Object.keys(generatedRecipeImages).length > 0);
  assert.ok(Object.values(generatedRecipeImages).every(uri => uri === ''));
});
