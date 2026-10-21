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
    StyleSheet: { create: (styles) => styles }, Alert: { alert() {} }, SectionList: require('./native-section-list.cjs'),
    Animated: { View: 'AnimatedView', Value: class { setValue() {} stopAnimation() {} } },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Image: 'Image',
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data, useFoodData: () => data };
  if (request.endsWith('/services/storage')) return {
    storageKeys: { swipeGuideSeen: 'guide' }, loadStoredValue: async () => true, saveStoredValue: async () => {},
  };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: (props) => React.createElement(name, props,
      props.header, props.expanded ? props.children : null) };
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
  node.findAllByType('Text').some((text) => [text.props.children].flat().join('') === label));
const recipeTitles = (root) => root.findAllByType('Pressable')
  .map((node) => node.props.accessibilityLabel).filter((label) => label?.endsWith('の材料と作り方を見る'));

test('the recipe catalog renders 20 at a time and searches all 100, including dishes beyond the visible page', async (t) => {
  const { additionalRecipes } = require('../src/data/recipeCatalog.ts');
  const hundredRecipes = Array.from({ length: 100 }, (_, index) => recipe(`料理${String(index).padStart(3, '0')}`, '卵'));
  data = { foods: [], shoppingItems: [], recipes: hundredRecipes, addNewCatalogRecipes() {} };
  const renderer = await mount(t, React.createElement(RecipesScreen, { navigation: {} }));
  assert.equal(recipeTitles(renderer.root).length, 20);
  await act(async () => labeledButton(renderer.root, 'さらにレシピを表示').props.onPress());
  assert.equal(recipeTitles(renderer.root).length, 40);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('料理099'));
  assert.deepEqual(recipeTitles(renderer.root), ['料理099の材料と作り方を見る']);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText(''));
  assert.equal(recipeTitles(renderer.root).length, 20);
  for (let page = 0; page < 4; page++) await act(async () => labeledButton(renderer.root, 'さらにレシピを表示').props.onPress());
  assert.equal(recipeTitles(renderer.root).length, 100);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'さらにレシピを表示' }).length, 0);
  data = { ...data, recipes: additionalRecipes };
  await act(async () => renderer.update(React.createElement(RecipesScreen, { navigation: {} })));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: `新しい内蔵レシピ${additionalRecipes.length}件を追加` }).length, 0);
});

test('a saved 100-recipe collection offers only missing recipes and finds a newly added vegetable dish', async (t) => {
  const { sampleRecipes } = require('../src/data/sampleData.ts');
  let imports = 0;
  data = { foods: [], shoppingItems: [], recipes: sampleRecipes.slice(0, 100), addNewCatalogRecipes() { imports++; } };
  const renderer = await mount(t, React.createElement(RecipesScreen, { navigation: {} }));
  assert.ok(renderer.root.findAllByType('Text').some(node => [node.props.children].flat().join('') === '内蔵レシピが136件になりました'));
  await act(async () => labeledButton(renderer.root, '新しい内蔵レシピ36件を追加').props.onPress());
  assert.equal(imports, 1);
  data = { ...data, recipes: sampleRecipes };
  await act(async () => renderer.update(React.createElement(RecipesScreen, { navigation: {} })));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '新しい内蔵レシピ36件を追加' }).length, 0);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('しいたけ'));
  assert.deepEqual(recipeTitles(renderer.root), ['しいたけの醤油焼きの材料と作り方を見る']);
});

test('a saved 120-recipe collection offers missing classics and curry rice is searchable', async (t) => {
  const { sampleRecipes } = require('../src/data/sampleData.ts');
  let imports = 0;
  data = { foods: [], shoppingItems: [], recipes: sampleRecipes.slice(0, 120), addNewCatalogRecipes() { imports++; } };
  const renderer = await mount(t, React.createElement(RecipesScreen, { navigation: {} }));
  await act(async () => labeledButton(renderer.root, '新しい内蔵レシピ16件を追加').props.onPress());
  assert.equal(imports, 1);
  data = { ...data, recipes: sampleRecipes };
  await act(async () => renderer.update(React.createElement(RecipesScreen, { navigation: {} })));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '新しい内蔵レシピ16件を追加' }).length, 0);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('カレーライス'));
  assert.deepEqual(recipeTitles(renderer.root), ['カレーライスの材料と作り方を見る']);
});

test('a saved 127-recipe collection offers only nine new classics and finds gyudon and grilled salmon', async (t) => {
  const { sampleRecipes } = require('../src/data/sampleData.ts');
  let imports = 0;
  data = { foods: [], shoppingItems: [], recipes: sampleRecipes.slice(0, 127), addNewCatalogRecipes() { imports++; } };
  const renderer = await mount(t, React.createElement(RecipesScreen, { navigation: {} }));
  await act(async () => labeledButton(renderer.root, '新しい内蔵レシピ9件を追加').props.onPress());
  assert.equal(imports, 1);
  data = { ...data, recipes: sampleRecipes };
  await act(async () => renderer.update(React.createElement(RecipesScreen, { navigation: {} })));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: '新しい内蔵レシピ9件を追加' }).length, 0);
  for (const name of ['牛丼', '鮭の塩焼き']) {
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText(name));
    assert.deepEqual(recipeTitles(renderer.root), [`${name}の材料と作り方を見る`]);
  }
});

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

test('Home empty stock offers text registration buttons that open the existing screens and preserve history', async t => {
  data = { foods: [] };
  const destinations = [];
  const navigation = { navigate: (...args) => destinations.push(args) };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation }));
  const buttons = () => renderer.root.findAllByType('PrimaryButton');
  assert.deepEqual(buttons().map(node => node.props.label), ['食材を登録', 'バーコードで登録']);
  await act(async () => buttons()[0].props.onPress());
  await act(async () => buttons()[1].props.onPress());
  assert.deepEqual(destinations, [['AddFood'], ['Barcode']]);
  assert.deepEqual(data.foods, []);
  const history = [food('牛乳', 0, 'used'), food('豆腐', 1, 'disposed')];
  data = { foods: history };
  await act(async () => renderer.update(React.createElement(HomeScreen, { navigation })));
  assert.deepEqual(buttons().map(node => node.props.label), ['食材を登録', 'バーコードで登録']);
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 0);
  assert.deepEqual(data.foods, history, 'completed records are retained');
});

test('Home registration prompts stay hidden when stock exists, even if search or expiry filters have no matches', async t => {
  const original = food('牛乳', 7);
  data = { foods: [original] };
  const navigation = {};
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation }));
  const buttons = () => renderer.root.findAllByType('PrimaryButton');
  assert.equal(buttons().length, 0);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('該当なし'));
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 0);
  assert.equal(buttons().length, 0);
  await act(async () => labeledButton(renderer.root, '今日まで 0件').props.onPress());
  assert.equal(renderer.root.findAllByType('SwipeableFoodCard').length, 0);
  assert.equal(buttons().length, 0);
  assert.deepEqual(data.foods, [original]);
  data = { foods: [{ ...original, status: 'used' }] };
  await act(async () => renderer.update(React.createElement(HomeScreen, { navigation })));
  assert.deepEqual(buttons().map(node => node.props.label), ['食材を登録', 'バーコードで登録']);
  data = { foods: [original] };
  await act(async () => renderer.update(React.createElement(HomeScreen, { navigation })));
  assert.equal(buttons().length, 0, 'returning food to active stock hides the empty-state prompts');
});

test('Home summary buttons clear search, isolate exact day ranges and allow grouping, search and reset', async (t) => {
  const items = [food('昨日の牛乳', -1), food('今日の卵', 0), food('明日の豆腐', 1), food('3日後のにんじん', 3),
    food('4日後の玉ねぎ', 4), food('使用済み', 0, 'used'), food('廃棄済み', 1, 'disposed')];
  data = { foods: items };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation: {} }));
  const root = renderer.root;
  const names = () => root.findAllByType('SwipeableFoodCard').map(node => node.props.food.name);
  await act(async () => textButton(root, 'カテゴリ別').props.onPress());
  await act(async () => root.findByType('TextInput').props.onChangeText('該当なし'));
  await act(async () => labeledButton(root, '今日まで 1件').props.onPress());
  assert.equal(root.findByType('TextInput').props.value, '');
  assert.equal(textButton(root, '期限順').props.accessibilityState.selected, true);
  assert.equal(labeledButton(root, '今日まで 1件').props.accessibilityState.selected, true);
  assert.deepEqual(names(), ['今日の卵']);
  await act(async () => labeledButton(root, '明日から3日以内 2件').props.onPress());
  assert.deepEqual(names(), ['明日の豆腐', '3日後のにんじん']);
  assert.equal(labeledButton(root, '今日まで 1件').props.accessibilityState.selected, false);
  await act(async () => textButton(root, '保存場所別').props.onPress());
  assert.deepEqual(names(), ['明日の豆腐', '3日後のにんじん']);
  await act(async () => root.findByType('TextInput').props.onChangeText('にんじん'));
  assert.deepEqual(names(), ['3日後のにんじん']);
  assert.ok(labeledButton(root, '今日まで 1件'), 'counts continue to represent all stock');
  await act(async () => labeledButton(root, '絞り込みを解除してすべての食材を表示').props.onPress());
  assert.equal(root.findByType('TextInput').props.value, '');
  assert.equal(names().length, 5);
  await act(async () => labeledButton(root, '期限切れ1件を確認').props.onPress());
  assert.deepEqual(names(), ['昨日の牛乳']);
  await act(async () => labeledButton(root, '明日から3日以内 2件').props.onPress());
  assert.deepEqual(names(), ['明日の豆腐', '3日後のにんじん']);
  assert.deepEqual(data.foods, items, 'filtering does not mutate food records');
});

test('Home zero-count filters have a clear empty state and selected ranges follow local midnight', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 9, 15, 23, 59, 59) });
  data = { foods: [food('明日の豆腐', 1), food('4日後の牛乳', 4)] };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation: {} }));
  const root = renderer.root;
  await act(async () => labeledButton(root, '今日まで 0件').props.onPress());
  assert.equal(root.findAllByType('SwipeableFoodCard').length, 0);
  assert.ok(root.findAllByType('Text').some(node => node.props.children === '「今日まで」の食材はありません。'));
  await act(async () => t.mock.timers.tick(1000));
  assert.deepEqual(root.findAllByType('SwipeableFoodCard').map(node => node.props.food.name), ['明日の豆腐']);
  await act(async () => labeledButton(root, '明日から3日以内 1件').props.onPress());
  assert.deepEqual(root.findAllByType('SwipeableFoodCard').map(node => node.props.food.name), ['4日後の牛乳']);
});

test('Home grouping changes apply the latest selection immediately and retain search and stock', async (t) => {
  const milk = { ...food('牛乳', 7), category: 'dairy' }, frozen = { ...food('冷凍ごはん', 8), storage: 'frozen' };
  data = { foods: [milk, frozen] };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation: {} }));
  const root = renderer.root;
  await act(async () => root.findByType('TextInput').props.onChangeText('牛乳'));
  await act(async () => {
    textButton(root, '保存場所別').props.onPress();
    textButton(root, 'カテゴリ別').props.onPress();
    textButton(root, '保存場所別').props.onPress();
  });
  assert.equal(root.findByType('TextInput').props.value, '牛乳');
  assert.equal(textButton(root, '保存場所別').props.accessibilityState.selected, true);
  for (const label of ['期限順', 'カテゴリ別']) assert.equal(textButton(root, label).props.accessibilityState.selected, false);
  assert.deepEqual(root.findAllByType('SectionHeader').map((node) => node.props.title), ['冷蔵']);
  assert.strictEqual(root.findByType('SwipeableFoodCard').props.food, milk);
  await act(async () => root.findByType('TextInput').props.onChangeText(''));
  assert.deepEqual(root.findAllByType('SectionHeader').map((node) => node.props.title), ['冷蔵', '冷凍']);
  assert.equal(root.findAllByType('SwipeableFoodCard').length, 2);
  assert.deepEqual(data.foods, [milk, frozen]);
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

test('phase 4 expired-only entry clears search and shows only expired active foods', async (t) => {
  data = { foods: [food('牛乳', -1), food('卵', 0), food('豆腐', -1, 'used')] };
  const renderer = await mount(t, React.createElement(HomeScreen, { navigation: {} }));
  const root = renderer.root;
  await act(async () => root.findByType('TextInput').props.onChangeText('該当なし'));
  await act(async () => labeledButton(root, '期限切れ1件を確認').props.onPress());
  assert.equal(root.findByType('TextInput').props.value, '');
  assert.deepEqual(root.findAllByType('SwipeableFoodCard').map((node) => node.props.food.name), ['牛乳']);
  await act(async () => textButton(root, '期限切れのみ表示中 · すべての食材に戻す').props.onPress());
  assert.equal(root.findAllByType('SwipeableFoodCard').length, 2);
});

test('recipe accordions retain the query, category and selected condition after closing and reopening', async (t) => {
  data = { foods: [food('牛乳', 7)], shoppingItems: [], recipes: [recipe('牛乳スープ', '牛乳', 'soup'), recipe('卵料理', '卵')] };
  const renderer = await mount(t, React.createElement(RecipesScreen, { route: { params: {} }, navigation: {} }));
  const root = renderer.root;
  await act(async () => root.findByProps({ accessibilityLabel: '料理名・食材で検索' }).props.onChangeText('牛乳'));
  await act(async () => labeledButton(root, '絞り込み').props.onPress());
  await act(async () => textButton(root, '10分以内').props.onPress());
  await act(async () => textButton(root, '汁物').props.onPress());
  await act(async () => textButton(root, '1件のレシピを見る').props.onPress());
  assert.equal(labeledButton(root, '絞り込み').props.accessibilityState.expanded, false);
  assert.equal(root.findByProps({ accessibilityLabel: '料理名・食材で検索' }).props.value, '牛乳');
  assert.deepEqual(recipeTitles(root), ['牛乳スープの材料と作り方を見る']);
  await act(async () => labeledButton(root, '絞り込み').props.onPress());
  assert.equal(textButton(root, '汁物').props.accessibilityState.selected, true);
  assert.equal(textButton(root, '10分以内').props.accessibilityState.selected, true);
  await act(async () => labeledButton(root, '牛乳スープの材料の確認').props.onPress());
  assert.ok(root.findAllByType('Text').some((node) => String(node.props.children).includes('登録分量で判定')));
  await act(async () => labeledButton(root, '牛乳スープの材料の確認').props.onPress());
  assert.equal(root.findAllByType('Text').some((node) => String(node.props.children).includes('登録分量で判定')), false);
  assert.equal(recipeTitles(root).length, 1, 'collapsing material details does not remove the recipe action');
});

test('nested recipe ideas retain their expanded selection when the outer panel is closed and reopened', async (t) => {
  data = { foods: [food('卵', 2), food('牛乳', 7)], shoppingItems: [], recipes: [recipe('卵料理', '卵')] };
  const renderer = await mount(t, React.createElement(RecipesScreen, { route: { params: {} }, navigation: {} }));
  const root = renderer.root;
  await act(async () => textButton(root, 'もっと探す').props.onPress());
  await act(async () => labeledButton(root, '食材からレシピ候補を作る').props.onPress());
  const ideasBefore = root.findAllByType('Pressable').map((node) => node.props.accessibilityLabel)
    .filter((label) => label?.endsWith('をマイレシピへ保存'));
  assert.ok(ideasBefore.length > 0);
  await act(async () => textButton(root, 'もっと探す').props.onPress());
  assert.equal(root.findAllByProps({ accessibilityLabel: '食材からレシピ候補を作る' }).length, 0);
  await act(async () => textButton(root, 'もっと探す').props.onPress());
  assert.equal(labeledButton(root, '食材からレシピ候補を作る').props.accessibilityState.expanded, true);
  assert.deepEqual(root.findAllByType('Pressable').map((node) => node.props.accessibilityLabel)
    .filter((label) => label?.endsWith('をマイレシピへ保存')), ideasBefore);
});
