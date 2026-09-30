require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findMatchingFoods, getUsableFoods, ingredientKey } = require('../src/utils/recipeMatching.ts');
const { getRecipeStock } = require('../src/utils/recipeStock.ts');
const { hasPendingShoppingItem, getFrequentShoppingSuggestions } = require('../src/utils/shoppingList.ts');
const { colors } = require('../src/constants/theme.ts');
const food = (id, ingredientName, extra = {}) => ({ id, name: ingredientName, ingredientName, productName: null,
  status: 'active', expiryDate: '2099-01-01', quantity: 1, quantityUnit: 'piece', ...extra });

test('shopping shares spelling aliases without merging brands or processed ingredients', () => {
  for (const [a, b] of [['卵', 'たまご'], ['玉子', '卵'], ['醤油', 'しょうゆ'], ['人参', 'にんじん']]) {
    assert.equal(hasPendingShoppingItem([{ name: a, checked: false }], b), true);
    assert.equal(hasPendingShoppingItem([{ name: a, checked: true }], b), false);
  }
  for (const [a, b] of [['A社 牛乳', 'B社 牛乳'], ['牛乳', '牛乳プリン'], ['米', 'ごはん']]) {
    assert.equal(hasPendingShoppingItem([{ name: a, checked: false }], b), false);
  }
});

test('frequent purchases count linked food and shopping once, retaining brand distinctions', () => {
  const foods = [food('f1', '卵', { sourceShoppingItemId: 's1' }), food('f2', '牛乳', { productName: 'A社の牛乳' }), food('f3', '牛乳', { productName: 'B社の牛乳' })];
  const items = [{ id: 's1', name: 'たまご', checked: true }, { id: 's2', name: '玉子', checked: true }];
  const result = getFrequentShoppingSuggestions(foods, items);
  assert.equal(result.find((item) => item.name === '卵').count, 2);
  assert.ok(result.some((item) => item.name === 'A社の牛乳'));
  assert.ok(result.some((item) => item.name === 'B社の牛乳'));
  assert.ok(!getFrequentShoppingSuggestions(foods, [...items, { name: '玉子', checked: false }]).some((item) => ingredientKey(item.name) === '卵'));
});

test('shared inventory index matches a scan at 10/100/500 items and cannot be altered through results', () => {
  for (const count of [10, 100, 500]) {
    const foods = Array.from({ length: count }, (_, i) => food(String(i), ['卵', '玉子', '牛乳', '牛乳プリン', '米', 'ごはん'][i % 6], { expiryDate: `2099-01-${String(i % 28 + 1).padStart(2, '0')}` }));
    for (const name of ['たまご', '牛乳', '牛乳プリン', '米', 'ごはん', '存在しない']) {
      const expected = foods.filter((food) => ingredientKey(food.ingredientName) === ingredientKey(name)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      assert.deepEqual(findMatchingFoods(name, foods), expected);
      findMatchingFoods(name, foods).pop();
      assert.deepEqual(findMatchingFoods(name, foods), expected);
    }
    const next = foods.map((item, i) => i === 0 ? { ...item, ingredientName: '別分類' } : item);
    assert.equal(findMatchingFoods('別分類', next).length, 1);
    assert.equal(findMatchingFoods('別分類', foods).length, 0);
  }
});

test('usable index refreshes on local date rollover; shared aliases remain review instead of double spending', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 30, 23, 59, 59) });
  const foods = [food('egg', '卵', { expiryDate: '2026-09-30' }), food('used', '卵', { status: 'used' })];
  assert.equal(getUsableFoods(foods).length, 1);
  assert.deepEqual(getRecipeStock({ ingredients: ['卵', '玉子'], ingredientAmounts: { 卵: '1個', 玉子: '1個' } }, foods).map((row) => row.status), ['review', 'review']);
  t.mock.timers.setTime(new Date(2026, 9, 1).getTime());
  assert.equal(getUsableFoods(foods).length, 0);
});

test('primary and semantic text colors meet 4.5:1 on their surfaces', () => {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const [fg, bg] of [[colors.primary, colors.surface], [colors.primaryDark, colors.primarySoft], [colors.danger, colors.dangerSoft], [colors.warning, colors.warningSoft], [colors.textMuted, colors.background], [colors.frozen, colors.surface], [colors.room, colors.surface]]) {
    const ratio = (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05);
    assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio}`);
  }
});
