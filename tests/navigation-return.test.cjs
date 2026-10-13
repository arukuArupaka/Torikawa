require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const { StackRouter, StackActions, CommonActions } = require(nativeRequire.resolve('@react-navigation/routers'));
const { returnToMainTab } = require('../src/navigation/returnToMainTab.ts');

function stack() {
  const router = StackRouter({ initialRouteName: 'MainTabs' });
  const options = { routeNames: ['MainTabs', 'AddFood', 'FoodDetail', 'RecipeDetail', 'ShoppingList', 'Statistics'],
    routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const tabs = { key: 'existing-tabs', index: 0, routes: [{ name: 'Home', key: 'existing-home' }] };
  state = { ...state, routes: [{ ...state.routes[0], state: tabs }] };
  const apply = (action) => { const next = router.getStateForAction(state, action, options);
    assert.ok(next, `Unhandled navigation action ${action.type}`); state = next; };
  return {
    get state() { return state; }, tabs,
    push: (name) => apply(StackActions.push(name)),
    navigation() {
      // Native screen navigation retains its source even after it has been popped.
      const source = state.routes[state.index].key, target = state.key;
      return {
        getState: () => state,
        popToTop: () => apply({ ...StackActions.popToTop(), source, target }),
        navigate: (name, params) => apply({ ...CommonActions.navigate(name, params), source, target }),
      };
    },
  };
}

test('returning after a modal or detail keeps only the original tabs and their state', () => {
  for (const route of ['AddFood', 'FoodDetail', 'RecipeDetail']) {
    const app = stack(), originalKey = app.state.routes[0].key;
    app.push(route);
    returnToMainTab(app.navigation());
    assert.equal(app.state.index, 0);
    assert.deepEqual(app.state.routes.map((item) => item.name), ['MainTabs']);
    assert.equal(app.state.routes[0].key, originalKey);
    assert.strictEqual(app.state.routes[0].state, app.tabs);
    assert.deepEqual(app.state.routes[0].params, { screen: 'Home' });
  }
});

test('returning clears duplicate tabs already created by the old navigate behavior', () => {
  const app = stack(), originalKey = app.state.routes[0].key;
  app.push('AddFood');
  app.navigation().navigate('MainTabs', { screen: 'Home' });
  app.push('FoodDetail');
  app.navigation().navigate('MainTabs', { screen: 'Home' });
  assert.deepEqual(app.state.routes.map((item) => item.name), ['MainTabs', 'AddFood', 'MainTabs', 'FoodDetail', 'MainTabs']);
  returnToMainTab(app.navigation());
  assert.deepEqual(app.state.routes.map((item) => item.name), ['MainTabs']);
  assert.equal(app.state.routes[0].key, originalKey);
  assert.strictEqual(app.state.routes[0].state, app.tabs);
});

test('repeated returns select the requested tab without accumulating screens', () => {
  const app = stack(), originalKey = app.state.routes[0].key;
  for (const screen of ['Home', 'Recipes', 'Home']) {
    app.push('ShoppingList'); app.push('FoodDetail');
    returnToMainTab(app.navigation(), screen);
    assert.equal(app.state.routes.length, 1);
    assert.equal(app.state.routes[0].key, originalKey);
    assert.deepEqual(app.state.routes[0].params, { screen });
    returnToMainTab(app.navigation(), screen);
    assert.equal(app.state.routes.length, 1, 'an already-focused root must not create another tabs route');
  }
});
