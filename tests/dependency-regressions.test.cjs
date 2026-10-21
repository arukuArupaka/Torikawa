require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { createRequire } = require('node:module');
const core = require('@react-navigation/core');
const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const { StackRouter } = require(nativeRequire.resolve('@react-navigation/routers'));
const shellQuote = require('shell-quote');
const { returnToMainTab } = require('../src/navigation/returnToMainTab.ts');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('updated navigation core keeps modal/detail navigation and returns to the existing tabs', async t => {
  const ref = core.createNavigationContainerRef();
  let screenNavigation;
  function Screen({ navigation, route }) {
    screenNavigation = navigation;
    return React.createElement('Screen', { routeName: route.name, params: route.params });
  }
  function Navigator(props) {
    // Native-stack v7 still uses NavigationContent; exercise that public contract.
    const { state, descriptors, NavigationContent } = core.useNavigationBuilder(StackRouter, props);
    return React.createElement(NavigationContent, null, descriptors[state.routes[state.index].key].render());
  }
  const Stack = core.createNavigatorFactory(Navigator)();
  let renderer;
  await act(async () => { renderer = create(React.createElement(core.BaseNavigationContainer, { ref },
    React.createElement(Stack.Navigator, { initialRouteName: 'MainTabs' },
      ['MainTabs', 'AddFood', 'FoodDetail', 'RecipeDetail'].map(name => React.createElement(Stack.Screen, { key: name, name, component: Screen }))))); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(ref.isReady(), true);
  const tabsKey = ref.getRootState().routes[0].key;
  for (const [name, params, tab] of [
    ['AddFood', { initialName: '牛乳' }, 'Home'],
    ['FoodDetail', { foodId: 'food-123-abc' }, 'Home'],
    ['RecipeDetail', { recipeId: 'recipe-9' }, 'Recipes'],
  ]) {
    await act(async () => ref.navigate(name, params));
    assert.equal(renderer.root.findByType('Screen').props.routeName, name);
    assert.deepEqual(renderer.root.findByType('Screen').props.params, params);
    await act(async () => returnToMainTab(screenNavigation, tab));
    const state = ref.getRootState();
    assert.equal(state.index, 0); assert.equal(state.routes.length, 1);
    assert.equal(state.routes[0].key, tabsKey);
    assert.deepEqual(state.routes[0].params, { screen: tab });
  }
});

test('navigation URL parsing retains Japanese and repeated parameters without replacing the food ID', () => {
  const options = { screens: { FoodDetail: 'food/:foodId' } };
  const input = '/food/food-123-abc?memo=' + encodeURIComponent('牛乳 & 卵') + '&tag=冷蔵&tag=朝食&foodId=wrong';
  const state = core.getStateFromPath(input, options);
  assert.equal(state.routes[0].name, 'FoodDetail');
  assert.deepEqual(state.routes[0].params, { foodId: 'food-123-abc', memo: '牛乳 & 卵', tag: ['冷蔵', '朝食'] });
  const roundTrip = core.getStateFromPath(core.getPathFromState(state, options), options);
  assert.deepEqual(roundTrip.routes[0].params, state.routes[0].params);
  const malformed = core.getStateFromPath('/food/food-123-abc?memo=%E0%A4%A', options);
  assert.equal(malformed.routes[0].params.memo, '%E0%A4%A');
});

test('shell quoting rejects line terminators after a comment without running a shell', () => {
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => shellQuote.quote(['echo', 'ok', { comment: 'note' }, `a${separator}not-a-command`]), TypeError);
  }
  const tokens = ['milk & eggs', '牛乳', 'a b'];
  assert.deepEqual(shellQuote.parse(shellQuote.quote(tokens)), tokens);
});
