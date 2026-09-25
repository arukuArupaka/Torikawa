require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findMatchingFood } = require('../src/utils/recipeMatching.ts');
const { parseRecipeAmountForUnit, getSuggestedUseQuantity, subtractQuantity } = require('../src/utils/foodQuantity.ts');
const { generateLocalRecipeIdeas } = require('../src/services/localRecipeSuggestionService.ts');

const food = (name, options = {}) => ({ id: name, name, ingredientName: name, tags: [], expiryDate: '2026-10-01', ...options });

test('generic search tags must not make pork satisfy beef', () => {
  assert.equal(findMatchingFood('牛肉', [food('豚肉', { tags: ['肉'] })]), undefined);
});
test('egg tofu must not satisfy egg or tofu', () => {
  const foods = [food('卵豆腐', { tags: ['豆腐', '大豆製品'] })];
  assert.equal(findMatchingFood('卵', foods), undefined);
  assert.equal(findMatchingFood('豆腐', foods), undefined);
});
test('an empty ingredient must not match the first stock item', () => {
  assert.equal(findMatchingFood('  ', [food('卵')]), undefined);
});
test('onions must not satisfy green onions', () => {
  assert.equal(findMatchingFood('ねぎ', [food('玉ねぎ')]), undefined);
});
test('a branded product uses the user supplied ingredient classification', () => {
  const milk = food('明治おいしい牛乳', { ingredientName: '牛乳' });
  assert.equal(findMatchingFood('牛乳', [milk]), milk);
});
test('equivalent spelling still matches and the earliest expiry wins', () => {
  const earlier = food('玉ねぎ', { expiryDate: '2026-09-25' });
  assert.equal(findMatchingFood('玉葱', [food('玉ねぎ'), earlier]), earlier);
  assert.equal(findMatchingFood('たまご', [food('卵')]).name, '卵');
});
test('a quarter cabbage leaves three quarters in stock', () => {
  const used = getSuggestedUseQuantity(['1/4玉'], 'piece', 1);
  assert.equal(used, 0.25);
  assert.equal(subtractQuantity(1, used), 0.75);
});
test('unknown or incompatible amounts require manual input', () => {
  for (const amount of ['適量', '少々', '1丁', '大さじ2', '1〜2個', '1個以上']) {
    assert.equal(getSuggestedUseQuantity([amount], 'piece', 2), null, amount);
  }
});
test('fraction units stay attached to their amount', () => {
  assert.equal(parseRecipeAmountForUnit('1/2個（100g）', 'g'), null);
  assert.equal(parseRecipeAmountForUnit('1/0個', 'piece'), null);
  assert.equal(parseRecipeAmountForUnit('0個', 'piece'), null);
});
test('explicit mass and volume conversions and full-width input', () => {
  assert.equal(parseRecipeAmountForUnit('０．５kg', 'g'), 500);
  assert.equal(parseRecipeAmountForUnit('1/2L', 'ml'), 500);
  assert.equal(parseRecipeAmountForUnit('200g', 'ml'), null);
});
test('all ingredient rows using the same stock are added together', () => {
  assert.equal(getSuggestedUseQuantity(['1個', '2個'], 'piece', 10), 3);
  assert.equal(getSuggestedUseQuantity(['1個', '適量'], 'piece', 10), null);
});
test('insufficient inventory does not silently select use all', () => {
  assert.equal(getSuggestedUseQuantity(['2個'], 'piece', 1), null);
  assert.equal(getSuggestedUseQuantity(['1個'], 'piece', 1), 1);
});
test('suggestions fit the precision accepted by the inventory form', () => {
  assert.equal(getSuggestedUseQuantity(['1/3個'], 'piece', 1), 0.33);
  assert.equal(getSuggestedUseQuantity([], 'piece', 1), null);
});
test('local recipe ideas do not use egg tofu as eggs or raw tofu', () => {
  const foods = [food('卵豆腐', { status: 'active', tags: ['卵', '豆腐'], expiryDate: '2099-01-01' }), food('牛乳', { status: 'active', expiryDate: '2099-01-01' })];
  const ideas = generateLocalRecipeIdeas(foods);
  assert.ok(!ideas.some((idea) => /オムレツ|ステーキ/.test(idea.name)));
});
