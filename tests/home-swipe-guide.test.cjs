require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let data, seen, readGuide, saveGuide;
const alerts = [], reads = [], writes = [];
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    AppState: { addEventListener: () => ({ remove() {} }) },
    StyleSheet: { create: styles => styles }, Alert: { alert: (...values) => alerts.push(values) },
    Animated: { View: 'AnimatedView', Value: class { setValue() {} stopAnimation() {} } },
    SectionList: require('./native-section-list.cjs'),
    Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/AppDataContext')) return { useFoodData: () => data };
  if (request.endsWith('/services/storage')) return {
    storageKeys: { swipeGuideSeen: 'guide' },
    loadStoredValue: key => { reads.push(key); return readGuide(); },
    saveStoredValue: (key, value) => { writes.push([key, value]); return saveGuide(value); },
  };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    return { [name]: props => React.createElement(name, props) };
  }
  return originalLoad.call(this, request, ...args);
};
const { HomeScreen } = require('../src/screens/HomeScreen.tsx');
const { addDays, toDateString } = require('../src/utils/date.ts');
const closeLabel = 'スワイプ操作の案内を閉じる';
const navigation = { navigate() {} };
const screen = (nav = navigation) => React.createElement(HomeScreen, { navigation: nav });
function food(id = 'milk') {
  return { id, name: '牛乳', ingredientName: '牛乳', productName: null, category: 'dairy', tags: [],
    status: 'active', storage: 'refrigerated', quantity: 1000, quantityUnit: 'ml', image: '',
    purchaseDate: toDateString(new Date()), expiryDate: toDateString(addDays(new Date(), 1)), memo: '' };
}
function reset() {
  data = { foods: [] }; seen = null;
  alerts.length = 0; reads.length = 0; writes.length = 0;
  readGuide = async () => seen;
  saveGuide = async value => { seen = value; };
}
async function mount(t, nav = navigation, strict = false) {
  let renderer;
  await act(async () => { renderer = create(strict ? React.createElement(React.StrictMode, null, screen(nav)) : screen(nav)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
const closeButtons = renderer => renderer.root.findAllByProps({ accessibilityRole: 'button', accessibilityLabel: closeLabel });

test('the first food shows an inline swipe guide without blocking its card or search', async t => {
  reset();
  let destination;
  const nav = { navigate: (...args) => { destination = args; } };
  const renderer = await mount(t, nav);
  assert.equal(closeButtons(renderer).length, 0, 'no guide on empty home');
  const original = food();
  data = { foods: [original] };
  await act(async () => renderer.update(screen(nav)));
  assert.equal(closeButtons(renderer).length, 1);
  assert.ok(renderer.root.findAllByType('Text').some(node => node.props.children === '左へスワイプ：使い切った\n右へスワイプ：捨てた'));
  assert.deepEqual(alerts, [], 'no automatic alert after registration');
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.root.findByType('SwipeableFoodCard').props.onPress());
  assert.deepEqual(destination, ['FoodDetail', { foodId: original.id }]);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('該当なし'));
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 0);
  assert.equal(closeButtons(renderer).length, 1, 'search is usable without dismissing the guide');
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText(''));
  assert.strictEqual(renderer.root.findByType('SwipeableFoodCard').props.food, original);
  assert.deepEqual(writes, [], 'displaying a guide does not mark it as dismissed');
});

test('closing the guide persists the existing flag and hides it after stock changes and remounting', async t => {
  reset(); data = { foods: [food()] };
  const renderer = await mount(t);
  await act(async () => closeButtons(renderer)[0].props.onPress());
  assert.equal(closeButtons(renderer).length, 0);
  assert.deepEqual(writes, [['guide', true]]);
  data = { foods: [] };
  await act(async () => renderer.update(screen()));
  data = { foods: [food(), food('second')] };
  await act(async () => renderer.update(screen()));
  assert.equal(closeButtons(renderer).length, 0);
  await act(async () => renderer.unmount());
  const reopened = await mount(t);
  assert.equal(closeButtons(reopened).length, 0);
  assert.equal(reopened.root.findAllByType('SwipeableFoodCard').length, 2);
  assert.deepEqual(alerts, []);
});

test('users who acknowledged the old modal do not see the new inline guide', async t => {
  reset(); seen = true; data = { foods: [food()] };
  const renderer = await mount(t);
  assert.equal(closeButtons(renderer).length, 0);
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 1);
  assert.deepEqual(writes, []); assert.deepEqual(alerts, []);
});

test('a stock count change during the guide read does not lose the unread guide', async t => {
  reset(); data = { foods: [food()] };
  let finishRead;
  readGuide = () => new Promise(resolve => { finishRead = resolve; });
  const renderer = await mount(t);
  data = { foods: [food(), food('second')] };
  await act(async () => renderer.update(screen()));
  await act(async () => finishRead(null));
  assert.equal(closeButtons(renderer).length, 1);
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 2);
  assert.deepEqual(reads, ['guide']); assert.deepEqual(alerts, []);
});

test('guide checks survive Strict Mode and ignore results from an unmounted home', async t => {
  reset(); data = { foods: [food()] };
  const strict = await mount(t, navigation, true);
  assert.equal(closeButtons(strict).length, 1);
  await act(async () => strict.unmount());
  let finishRead;
  readGuide = () => new Promise(resolve => { finishRead = resolve; });
  const renderer = await mount(t);
  await act(async () => renderer.unmount());
  await act(async () => finishRead(null));
  assert.equal(renderer.toJSON(), null);
  assert.deepEqual(alerts, []); assert.deepEqual(writes, []);
});

test('guide read and save failures leave food usable and allow dismissal without another dialog', async t => {
  reset(); data = { foods: [food()] };
  const warn = t.mock.method(console, 'warn', () => {});
  readGuide = async () => { throw new Error('read failure'); };
  const unreadable = await mount(t);
  assert.equal(closeButtons(unreadable).length, 0);
  assert.equal(unreadable.root.findAllByType('SwipeableFoodCard').length, 1);
  assert.deepEqual(writes, [], 'a failed read must not overwrite its flag');
  assert.match(warn.mock.calls[0].arguments[0], /状態を読み込めませんでした/);
  await act(async () => unreadable.unmount());
  readGuide = async () => seen;
  saveGuide = async () => { throw new Error('save failure'); };
  const unsavable = await mount(t);
  await act(async () => closeButtons(unsavable)[0].props.onPress());
  assert.equal(closeButtons(unsavable).length, 0);
  assert.equal(unsavable.root.findAllByType('SwipeableFoodCard').length, 1);
  assert.equal(seen, null);
  assert.match(warn.mock.calls.at(-1).arguments[0], /確認状態を保存できませんでした/);
  assert.deepEqual(alerts, []);
  await act(async () => unsavable.unmount());
  const retry = await mount(t);
  assert.equal(closeButtons(retry).length, 1, 'an unpersisted dismissal can be retried on the next mount');
});
