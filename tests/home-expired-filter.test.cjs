require('./register-typescript.cjs');
const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let foods, currentDay = '2026-10-17';
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { StyleSheet: { create: (value) => value },
    Animated: { View: 'AnimatedView' }, SectionList: require('./native-section-list.cjs'),
    Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/AppDataContext')) return { useFoodData: () => ({ foods }) };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => () => {} };
  if (request.endsWith('/hooks/useCurrentDay')) return { useCurrentDay: () => currentDay };
  if (request.endsWith('/hooks/useFoodStatusFeedback')) return { useFoodStatusFeedback: () => () => {} };
  if (request.endsWith('/hooks/useViewModeFade')) return { useViewModeFade: () => ({ opacity: 1, translateY: 0 }) };
  if (request.endsWith('/services/storage')) return { storageKeys: { swipeGuideSeen: 'guide' }, loadStoredValue: async () => true };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    return { [name]: (props) => React.createElement(name, props) };
  }
  return originalLoad.call(this, request, ...args);
};
const { HomeScreen } = require('../src/screens/HomeScreen.tsx');
after(() => { Module._load = originalLoad; });
const navigation = {};
const food = (id, expiryDate) => ({ id, name: id, ingredientName: id, status: 'active', image: '',
  expiryDate, storage: 'refrigerated', category: 'other', tags: [], quantity: 1, quantityUnit: 'piece' });
const names = (renderer) => renderer.root.findAllByType('SwipeableFoodCard').map((node) => node.props.food.name);
const texts = (renderer) => renderer.root.findAllByType('Text').map((node) => [node.props.children].flat().join(''));
async function mount(t) {
  currentDay = '2026-10-17';
  let renderer;
  await act(async () => { renderer = create(React.createElement(HomeScreen, { navigation })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
const refresh = async (renderer) => act(async () => renderer.update(React.createElement(HomeScreen, { navigation })));
const filterExpired = async (renderer) => act(async () => renderer.root.findByProps({ accessibilityLabel: '期限切れ1件を確認' }).props.onPress());

for (const change of ['used', 'disposed', 'removed', 'rescheduled']) {
  test(`Home returns to all food when the final expired food is ${change}`, async (t) => {
    const expired = food('期限切れの牛乳', '2026-10-16');
    const later = food('期限内の卵', '2026-10-20');
    foods = [expired, later];
    const renderer = await mount(t);
    await filterExpired(renderer);
    assert.deepEqual(names(renderer), [expired.name]);
    foods = change === 'removed' ? [later] : [{ ...expired, ...(change === 'rescheduled' ? { expiryDate: '2026-10-19' } : { status: change }) }, later];
    await refresh(renderer);
    assert.deepEqual(new Set(names(renderer)), new Set(change === 'rescheduled' ? [expired.name, later.name] : [later.name]));
    assert.equal(texts(renderer).some((text) => /「」に一致|期限切れのみ表示中/.test(text)), false);
  });
}

test('a failed search does not clear the expired filter while expired food still exists', async (t) => {
  foods = [food('期限切れの牛乳', '2026-10-16'), food('期限内の卵', '2026-10-20')];
  const renderer = await mount(t);
  await filterExpired(renderer);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('見つからない食材'));
  assert.ok(texts(renderer).includes('「見つからない食材」に一致する食材はありません。'));
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('   '));
  assert.deepEqual(names(renderer), ['期限切れの牛乳']);
  assert.equal(texts(renderer).some((text) => text.includes('に一致する食材はありません')), false);
});

test('an empty inventory clears the expired filter before fresh food is added, including on a day change', async (t) => {
  foods = [food('期限切れの牛乳', '2026-10-16')];
  const renderer = await mount(t);
  await filterExpired(renderer);
  foods = []; await refresh(renderer);
  assert.ok(texts(renderer).includes('食材を登録してみましょう'));
  foods = [food('期限内の卵', '2026-10-20')]; await refresh(renderer);
  assert.deepEqual(names(renderer), ['期限内の卵']);
  foods = [food('期限切れの牛乳', '2026-10-16'), ...foods]; await refresh(renderer);
  await filterExpired(renderer);
  currentDay = '2026-10-16'; await refresh(renderer);
  assert.equal(names(renderer).length, 2);
  assert.equal(texts(renderer).some((text) => /「」に一致/.test(text)), false);
});
