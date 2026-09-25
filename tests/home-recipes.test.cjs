require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const listeners = new Set();
let data;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    AppState: { addEventListener: (_, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    } },
    StyleSheet: { create: (styles) => styles }, Alert: { alert() {} },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Image: 'Image',
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/services/storage')) return {
    storageKeys: { swipeGuideSeen: 'guide' }, loadStoredValue: async () => true, saveStoredValue: async () => {},
  };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    return { [name]: (props) => React.createElement(name, props) };
  }
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { HomeScreen } = require('../src/screens/HomeScreen.tsx');
const { RecipesScreen } = require('../src/screens/RecipesScreen.tsx');
const { useCurrentDay } = require('../src/hooks/useCurrentDay.ts');
const { addDays, toDateString } = require('../src/utils/date.ts');

function food(name, days, status = 'active') {
  return {
    id: `${name}-${days}-${status}`, name, ingredientName: name, productName: null,
    expiryDate: toDateString(addDays(new Date(), days)), status, image: '',
    category: 'other', tags: [], storage: 'refrigerated', quantity: 1, quantityUnit: 'piece',
  };
}
function recipe(name, ingredient, category = 'main') {
  return {
    id: name, name, category, ingredients: [ingredient], ingredientAmounts: { [ingredient]: '1個' },
    minutes: 5, steps: [], isFavorite: false, image: '',
  };
}
async function mount(t, element) {
  let renderer;
  await act(async () => { renderer = create(element); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
const labeledButton = (root, label) => root.findByProps({ accessibilityRole: 'button', accessibilityLabel: label });
const textButton = (root, label) => root.findAllByType('Pressable').find((node) =>
  node.findAllByType('Text').some((text) => text.props.children === label));
const recipeTitles = (root) => root.findAllByType('Pressable')
  .map((node) => node.props.accessibilityLabel).filter((label) => label?.endsWith('の材料と作り方を見る'));

test('Home counts today and days 1–3 once, excludes expired/used/disposed, and stays independent of search', async (t) => {
  data = { foods: [food('卵', 0), food('豆腐', 1), food('にんじん', 3), food('玉ねぎ', 4),
    food('牛乳', -1), food('卵', 0, 'used'), food('豆腐', 1, 'disposed')] };
  let destination;
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation: { navigate: (...args) => { destination = args; } } }));
  const root = renderer.root;
  assert.equal(root.findAllByProps({ accessibilityLabel: '今日まで 1件' }).length, 1);
  assert.equal(root.findAllByProps({ accessibilityLabel: '明日から3日以内 2件' }).length, 1);
  await act(async () => root.findByType('TextInput').props.onChangeText('該当なし'));
  assert.equal(root.findAllByType('SwipeableFoodCard').length, 0);
  assert.equal(root.findAllByProps({ accessibilityLabel: '今日まで 1件' }).length, 1);
  await act(async () => labeledButton(root, '期限が近い食材でレシピを探す').props.onPress());
  assert.deepEqual(destination, ['Recipes', { initialFilter: 'urgent' }]);
});

test('Home opens all recipes when no food is due soon; empty inventory has no summary', async (t) => {
  data = { foods: [food('牛乳', -1), food('卵', 4)] };
  let destination;
  const navigation = { navigate: (...args) => { destination = args; } };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation }));
  await act(async () => labeledButton(renderer.root, 'レシピを見る').props.onPress());
  assert.deepEqual(destination, ['Recipes', { initialFilter: 'all' }]);
  data = { foods: [] };
  await act(async () => renderer.update(React.createElement(HomeScreen, { navigation })));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '今日まで 0件' }).length, 0);
  assert.equal(renderer.root.findAllByType('Text').filter((node) => node.props.children === '食材を登録してみましょう').length, 1);
});

test('Home recipe entry clears old search/category, consumes its request, and works on repeated visits', async (t) => {
  data = {
    foods: [food('卵', 1), food('牛乳', -1), food('にんじん', 4)], shoppingItems: [],
    recipes: [recipe('卵料理', '卵'), recipe('牛乳料理', '牛乳', 'soup'), recipe('にんじん料理', 'にんじん')],
  };
  let enterRecipes;
  let params;
  function Harness() {
    const [routeParams, setRouteParams] = React.useState(undefined);
    params = routeParams;
    const navigation = React.useMemo(() => ({
      setParams: (next) => setRouteParams((old) => ({ ...old, ...next })),
    }), []);
    enterRecipes = (filter) => setRouteParams({ initialFilter: filter });
    return React.createElement(RecipesScreen, { route: { params: routeParams }, navigation });
  }
  const renderer = await mount(t, React.createElement(Harness));
  const root = renderer.root;
  await act(async () => root.findByType('TextInput').props.onChangeText('牛乳'));
  await act(async () => labeledButton(root, '絞り込み').props.onPress());
  await act(async () => textButton(root, '汁物').props.onPress());
  assert.deepEqual(recipeTitles(root), ['牛乳料理の材料と作り方を見る']);
  await act(async () => enterRecipes('urgent'));
  assert.equal(root.findByType('TextInput').props.value, '');
  assert.equal(params.initialFilter, undefined);
  assert.deepEqual(recipeTitles(root), ['卵料理の材料と作り方を見る']);
  await act(async () => labeledButton(root, '検索と絞り込みをリセット').props.onPress());
  assert.equal(recipeTitles(root).length, 3, 'manual reset must not reapply the consumed request');
  await act(async () => root.findByType('TextInput').props.onChangeText('にんじん'));
  await act(async () => enterRecipes('urgent'));
  assert.deepEqual(recipeTitles(root), ['卵料理の材料と作り方を見る']);
  await act(async () => enterRecipes('all'));
  assert.equal(recipeTitles(root).length, 3);
});

test('Home counts and recipe eligibility refresh at local midnight with unchanged food data', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 24, 23, 59, 59) });
  data = { foods: [food('卵', 0), food('にんじん', 4)], shoppingItems: [],
    recipes: [recipe('卵料理', '卵'), recipe('にんじん料理', 'にんじん')] };
  const renderer = await mount(t, React.createElement(React.Fragment, null,
    React.createElement(HomeScreen, { navigation: {} }),
    React.createElement(RecipesScreen, { route: { params: { initialFilter: 'urgent' } }, navigation: { setParams() {} } }),
  ));
  assert.deepEqual(recipeTitles(renderer.root), ['卵料理の材料と作り方を見る']);
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '今日まで 0件' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '明日から3日以内 1件' }).length, 1);
  assert.deepEqual(recipeTitles(renderer.root), ['にんじん料理の材料と作り方を見る']);
});

test('returning from background refreshes the day and unmount removes its listener/timer', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 24, 12) });
  let day;
  let renders = 0;
  function Consumer() { day = useCurrentDay(); renders += 1; return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Consumer)); });
  assert.equal(day, '2026-09-24');
  t.mock.timers.setTime(new Date(2026, 8, 26, 9).getTime());
  await act(async () => { for (const listener of listeners) listener('active'); });
  assert.equal(day, '2026-09-26');
  await act(async () => renderer.unmount());
  assert.equal(listeners.size, 0);
  const before = renders;
  await act(async () => t.mock.timers.tick(86400000));
  assert.equal(renders, before);
});
