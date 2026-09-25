require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scaleRecipeAmount, isValidServings, parseServingsInput, getServingsMultiplier } = require('../src/utils/recipeServings.ts');
const { getSuggestedUseQuantity } = require('../src/utils/foodQuantity.ts');

const amounts = [
  ['200g', 2, 3, '300g'], ['1/4玉', 2, 4, '1/2玉'], ['1/3本', 2, 3, '1/2本'],
  ['大さじ1と1/2', 2, 4, '大さじ3'], ['小さじ1', 2, 1, '小さじ1/2'],
  ['大さじ1', 2, 3, '大さじ1と1/2'], ['1.5個', 1, 2, '3個'],
  ['２個', 1, 2, '4個'], ['約200 g', 2, 1, '約100g'], ['400ml', 2, 3, '600ml'],
  ['1/2丁', 2, 1, '1/4丁'], ['2枚', 1, 3, '6枚'], ['茶碗1杯分', 1, 2, '茶碗2杯分'],
  ['小さじ1（仕上げ用）', 2, 4, '小さじ2（仕上げ用）'], ['1人分', 1, 2, '2人分'],
  ['100g', 3, 1, '約33.33g'], ['1/2個', 99, 1, '1/198個'],
];
test('servings scale weights, volumes, fractions, mixed spoon measures and notes', () => {
  for (const [amount, base, target, expected] of amounts) {
    assert.deepEqual(scaleRecipeAmount(amount, base, target), { amount: expected, needsReview: false }, amount);
  }
});

test('qualitative amounts stay as written; ambiguous numeric prose is marked for review', () => {
  for (const amount of ['適量', '少々', 'ひとつまみ', '卵が浸る量（ゆで用）']) {
    assert.deepEqual(scaleRecipeAmount(amount, 2, 4), { amount, needsReview: false });
  }
  for (const amount of ['2〜3個', '1個（約200g）', '大さじ1＋小さじ1', '1/0個', '半個', '100000000000000000000g']) {
    assert.deepEqual(scaleRecipeAmount(amount, 2, 4), { amount, needsReview: true });
  }
});

test('unset/invalid servings never scale; selecting the base restores original text exactly', () => {
  for (const base of [undefined, null, 0, -1, 1.5, 100, NaN, '2']) {
    assert.equal(getServingsMultiplier(base, 4), 1);
    assert.deepEqual(scaleRecipeAmount('大さじ１と１／２', base, 4), { amount: '大さじ１と１／２', needsReview: false });
  }
  assert.deepEqual(scaleRecipeAmount(' １／４玉 ', 2, 2), { amount: ' １／４玉 ', needsReview: false });
  assert.equal(scaleRecipeAmount('0.001g', 2, 1).amount, '1/2000g', 'small positive quantities must not become zero');
});

test('serving input accepts only 1–99 whole people, including full-width digits', () => {
  for (const text of ['', '0', '100', '-1', '1.5', '2人', 'Infinity', '1e1']) assert.equal(parseServingsInput(text), null, text);
  assert.equal(parseServingsInput(' ２ '), 2);
  assert.equal(parseServingsInput('99'), 99);
  assert.equal(isValidServings(1), true);
  assert.equal(isValidServings(99), true);
});

test('usage suggestions scale the original value before rounding and never exceed inventory', () => {
  assert.equal(getSuggestedUseQuantity(['1/4玉'], 'piece', 1, 2), 0.5);
  assert.equal(getSuggestedUseQuantity(['2個'], 'piece', 10, 1.5), 3);
  assert.equal(getSuggestedUseQuantity(['1/3個'], 'piece', 1, 3), 1);
  assert.equal(getSuggestedUseQuantity(['2個'], 'piece', 3, 2), null);
  assert.equal(getSuggestedUseQuantity(['少々'], 'g', 100, 2), null);
  assert.equal(getSuggestedUseQuantity(['2枚'], 'piece', 10, 2), null);
  assert.equal(getSuggestedUseQuantity(['2個'], 'piece', 10, NaN), null);
});
