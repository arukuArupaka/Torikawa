require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let data;
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { StyleSheet: { create: (styles) => styles }, ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable' };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/AppDataContext')) return { useAppData: () => data };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => () => {} };
  if (request.endsWith('/hooks/useCurrentDay')) return { useCurrentDay: () => '2026-10-14' };
  if (request.endsWith('/hooks/useFoodStatusFeedback')) return { useFoodStatusFeedback: () => () => {} };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: (props) => React.createElement(name, props, props.header, props.expanded ? props.children : null) };
    return { [name]: (props) => React.createElement(name, props, props.children) };
  }
  return original.call(this, request, ...args);
};
const { FoodDetailScreen } = require('../src/screens/FoodDetailScreen.tsx');
const entry = (operationId, recipeId, recordedAt) => ({ operationId, recipeId, recordedAt, amount: 100, before: 1000, after: 900, unit: 'ml' });
const food = (id) => ({ id, name: '牛乳', ingredientName: '牛乳', productName: null, category: 'dairy', storage: 'refrigerated',
  status: 'active', quantity: 800, quantityUnit: 'ml', expiryDate: '2099-01-10', purchaseDate: '2026-10-14', tags: [], memo: '', image: '',
  consumptionHistory: [entry('older', 'older-recipe', '2026-10-13T10:00:00.000Z'), entry('newer', 'newer-recipe', '2026-10-14T10:00:00.000Z')] });
const screen = (id) => React.createElement(FoodDetailScreen, { route: { params: { foodId: id } }, navigation: {} });
const toggle = (renderer) => renderer.root.findByProps({ accessibilityLabel: '調理での使用履歴' });

test('history is summarized while closed, opens newest first, and never hides stock actions or changes the ledger', async (t) => {
  data = { foods: [food('milk')], recipes: [{ id: 'older-recipe', name: '前日のスープ' }, { id: 'newer-recipe', name: '今日のスープ' }] };
  const originalData = structuredClone(data); let renderer;
  await act(async () => { renderer = create(screen('milk')); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(toggle(renderer).props.accessibilityState.expanded, false);
  assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children?.join?.('') === '2件'));
  const actions = () => renderer.root.findAllByType('PrimaryButton').map((node) => node.props.label);
  assert.ok(actions().includes('使い切った'));
  await act(async () => toggle(renderer).props.onPress());
  const records = renderer.root.findAllByType('Text').map((node) => node.props.children).filter((value) => typeof value === 'string' && value.includes('当時の残量'));
  assert.equal(records.length, 2); assert.match(records[0], /今日のスープ/); assert.match(records[1], /前日のスープ/);
  await act(async () => toggle(renderer).props.onPress());
  assert.equal(renderer.root.findAllByType('Text').some((node) => String(node.props.children).includes('当時の残量')), false);
  assert.ok(actions().includes('この食材を編集')); assert.deepEqual(data, originalData);
  data = { ...data, foods: [...data.foods, food('other-food')] };
  await act(async () => toggle(renderer).props.onPress());
  await act(async () => renderer.update(screen('other-food')));
  assert.equal(toggle(renderer).props.accessibilityState.expanded, false, 'a different food starts with its own history collapsed');
});
