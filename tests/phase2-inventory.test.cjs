require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getRecipeStock, allocateRecipeStock } = require('../src/utils/recipeStock.ts');
const { applyFoodConsumption } = require('../src/utils/foodConsumption.ts');
const { normalizeProductToIngredient } = require('../src/utils/ingredientNormalizer.ts');
const { findMatchingFoods } = require('../src/utils/recipeMatching.ts');
const { getFoodRegistrationDefaults } = require('../src/utils/foodRegistrationDefaults.ts');
const { validateStoredData } = require('../src/services/dataValidation.ts');

const food = (id, quantity, overrides = {}) => ({
  id, name: '牛乳', productName: null, ingredientName: '牛乳', category: 'dairy', tags: ['牛乳'],
  quantity, quantityUnit: 'ml', status: 'active', expiryDate: '2099-01-02', purchaseDate: '2026-09-29',
  createdAt: '2026-09-29', usedAt: null, disposedAt: null, storage: 'refrigerated', image: '', memo: '', ...overrides,
});
const recipe = (amounts = { 牛乳: '200ml' }) => ({ ingredients: Object.keys(amounts), ingredientAmounts: amounts, servings: 2 });
const request = (foods, amounts, operationId = 'cook-1') => ({
  operationId, recipeId: 'recipe-1', items: foods.filter((f) => amounts[f.id]).map((f) => ({
    foodId: f.id, amount: amounts[f.id], unit: f.quantityUnit, expectedQuantity: f.quantity,
    expectedExpiryDate: f.expiryDate, expectedRevision: f.revision ?? 0,
  })),
});

test('100 + 200 ml uses earliest 100 then 100, persists lot history and leaves later spare lots intact', () => {
  const foods = [food('later', 200), food('earlier', 100, { expiryDate: '2099-01-01' }), food('spare', 500, { expiryDate: '2099-01-03' })];
  const amounts = allocateRecipeStock(getRecipeStock(recipe(), foods));
  assert.deepEqual(amounts, { earlier: 100, later: 100 });
  const updated = applyFoodConsumption(foods, request(foods, amounts));
  assert.equal(updated[0].quantity, 100);
  assert.equal(updated[0].status, 'active');
  assert.equal(updated[1].status, 'used');
  assert.equal(updated[1].consumptionHistory[0].after, 0);
  assert.equal(updated[0].consumptionHistory[0].after, 100);
  assert.strictEqual(updated[2], foods[2]);
  validateStoredData('foods', updated);
  const restarted = JSON.parse(JSON.stringify(updated));
  assert.strictEqual(applyFoodConsumption(restarted, request(foods, amounts)), restarted);
  assert.deepEqual(foods.map((f) => f.quantity), [200, 100, 500], 'input stock is never mutated');
});

test('allocation shares availability units, skips an earlier bottle, respects servings and excludes expired lots', () => {
  const foods = [food('bottle', 1, { quantityUnit: 'bottle', expiryDate: '2098-01-01' }), food('ml', 400), food('expired', 900, { expiryDate: '2000-01-01' })];
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe(), foods)), { ml: 200 });
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe(), foods, 4)), { ml: 400 });
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe(), foods, 6)), {});
});

test('shortages, qualitative amounts and overlapping aliases need manual quantities', () => {
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe(), [food('low', 100)])), {});
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe({ 牛乳: '適量' }), [food('milk', 500)])), {});
  const egg = food('egg', 10, { ingredientName: '卵', quantityUnit: 'piece' });
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe({ 卵: '2個', 玉子: '2個' }), [egg])), {});
  const fraction = food('egg', 1, { ingredientName: '卵', quantityUnit: 'piece' });
  assert.deepEqual(allocateRecipeStock(getRecipeStock(recipe({ 卵: '1/3個' }), [fraction])), { egg: 0.33 });
});

test('any stale lot rejects the entire operation, including revisions changed back to the original quantity', () => {
  const foods = [food('a', 100), food('b', 200)];
  const pending = request(foods, { a: 100, b: 100 });
  for (const update of [{ quantity: 150 }, { quantityUnit: 'g' }, { expiryDate: '2099-02-01' }, { expiryDate: '2000-01-01' }, { revision: 2 }, { status: 'used' }]) {
    const current = [foods[0], { ...foods[1], ...update }];
    const before = structuredClone(current);
    assert.throws(() => applyFoodConsumption(current, pending), /在庫や期限/);
    assert.deepEqual(current, before);
  }
  assert.throws(() => applyFoodConsumption([foods[0]], pending));
});

test('invalid amounts, duplicate lots and empty operations never change stock; latest metadata is preserved', () => {
  const foods = [food('a', 100)];
  for (const amount of [-1, 101, Infinity, NaN, 0.001]) {
    const pending = request(foods, { a: 1 }); pending.items[0].amount = amount;
    assert.throws(() => applyFoodConsumption(foods, pending));
  }
  const pending = request(foods, { a: 25 });
  assert.throws(() => applyFoodConsumption(foods, { ...pending, items: [] }));
  assert.throws(() => applyFoodConsumption(foods, { ...pending, items: [...pending.items, ...pending.items] }));
  const latest = [{ ...foods[0], name: '訂正後', memo: '最新メモ', image: 'latest.jpg' }];
  const updated = applyFoodConsumption(latest, pending);
  assert.equal(updated[0].name, '訂正後'); assert.equal(updated[0].memo, '最新メモ'); assert.equal(updated[0].image, 'latest.jpg');
  assert.equal(updated[0].quantity, 75);
});

test('legacy foods remain valid and malformed barcode, revision or consumption history is rejected', () => {
  validateStoredData('foods', [food('old', 100)]);
  const used = applyFoodConsumption([food('new', 100)], request([food('new', 100)], { new: 25 }))[0];
  validateStoredData('foods', [used]);
  for (const override of [{ barcode: 'invalid' }, { revision: -1 }, { consumptionHistory: [{ ...used.consumptionHistory[0], after: 99 }] }, { consumptionHistory: [...used.consumptionHistory, ...used.consumptionHistory] }]) {
    assert.throws(() => validateStoredData('foods', [{ ...used, ...override }]));
  }
  const legacy = food('fraction', 0.333);
  const remainder = applyFoodConsumption([legacy], request([legacy], { fraction: 0.1 }));
  assert.equal(remainder[0].quantity, 0.233);
  validateStoredData('foods', remainder);
});

test('processed food names produce distinct recipe ingredients and appropriate registration defaults', () => {
  for (const [name, expected, wrong, unit, storage] of [
    ['焼きそば麺', '中華麺', 'そば', 'pack', 'refrigerated'],
    ['米酢', '酢', '米', 'bottle', 'room'],
    ['米粉', '米粉', '米', 'pack', 'room'],
    ['牛乳プリン', 'プリン', '牛乳', 'piece', 'refrigerated'],
    ['炊飯済みご飯', 'ごはん', '米', 'g', 'refrigerated'],
    ['白米', '米', 'ごはん', 'bag', 'room'],
    ['サラダチキン', 'サラダチキン', '鶏肉', 'g', 'refrigerated'],
    ['卵豆腐', '卵豆腐', '卵', 'pack', 'refrigerated'],
  ]) {
    const normalized = normalizeProductToIngredient(name);
    assert.equal(normalized.ingredientName, expected, name);
    const registered = food(name, 1, { ...normalized, name });
    assert.equal(findMatchingFoods(wrong, [registered]).length, 0, name);
    assert.equal(findMatchingFoods(expected, [registered]).length, 1, name);
    const defaults = getFoodRegistrationDefaults({ ...normalized, name });
    assert.equal(defaults.quantityUnit, unit, name);
    assert.equal(defaults.storage, storage, name);
  }
  const ambiguous = normalizeProductToIngredient('牛乳とチーズのソース');
  assert.equal(ambiguous.needsReview, true);
  assert.equal(ambiguous.ingredientName, '牛乳とチーズのソース');
  assert.equal(findMatchingFoods('牛乳', [food('a', 1, ambiguous)]).length, 0);
  assert.equal(getFoodRegistrationDefaults({ name: '牛乳', ingredientName: 'プリン', category: 'other' }).quantityUnit, 'piece');
  assert.equal(getFoodRegistrationDefaults({ name: '牛乳', ingredientName: '牛乳', storage: 'frozen' }).storage, 'frozen');
});
