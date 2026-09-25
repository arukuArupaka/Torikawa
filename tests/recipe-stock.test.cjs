require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getRecipeStock, getStockLabel } = require('../src/utils/recipeStock.ts');
const { getRecipeShoppingItems } = require('../src/utils/recipeIngredients.ts');
const food = (id, name, quantity, quantityUnit = 'piece', overrides = {}) => ({ id, name, ingredientName: name, quantity, quantityUnit, status: 'active', expiryDate: '2099-01-01', ...overrides });
const recipe = (ingredientAmounts, servings = 2) => ({ name: '試作料理', ingredients: Object.keys(ingredientAmounts), ingredientAmounts, servings });

test('shortage follows servings and shopping stores only the difference without overwriting pending notes', () => {
  const r = recipe({ 卵: '2個' });
  const stock = [food('egg', '卵', 1)];
  assert.equal(getStockLabel(getRecipeStock(r, stock)[0]), 'あと1個必要');
  assert.equal(getStockLabel(getRecipeStock(r, stock, 4)[0]), 'あと3個必要');
  assert.equal(getRecipeStock(r, stock, 1)[0].status, 'sufficient');
  const items = getRecipeShoppingItems(r, stock, [], 4);
  assert.match(items[0].memo, /4人分.*不足分：3個.*必要量：4個.*在庫：1個/);
  const pending = [{ name: ' 卵 ', checked: false, memo: '前のメモ' }];
  assert.deepEqual(getRecipeShoppingItems(r, stock, pending, 4), []);
  assert.equal(pending[0].memo, '前のメモ');
  assert.equal(getRecipeShoppingItems(r, stock, [{ name: '卵', checked: true }], 4).length, 1);
});

test('all usable lots and spelling aliases count, expired and consumed lots never count', () => {
  const r = recipe({ 卵: '5個' });
  const stock = [food('one', '卵', 1), food('two', 'たまご', 2), food('old', '卵', 20, 'piece', { expiryDate: '2000-01-01' }), food('used', '卵', 20, 'piece', { status: 'used' }), food('other', '卵豆腐', 20)];
  const row = getRecipeStock(r, stock)[0];
  assert.equal(row.available, 3);
  assert.equal(row.shortage, 2);
  assert.deepEqual(row.foods.map((f) => f.id), ['one', 'two']);
  assert.equal(getRecipeStock(r, [...stock, food('three', '玉子', 2)])[0].status, 'sufficient');
});

test('weight, volume and fractional pieces compare before rounding and round shortages upward', () => {
  const rows = getRecipeStock(recipe({ 肉: '0.5kg', 牛乳: '1/2L', キャベツ: '1/3玉' }), [food('meat', '肉', 300, 'g'), food('milk', '牛乳', 200, 'ml'), food('cabbage', 'キャベツ', 0.33)]);
  assert.deepEqual(rows.map((row) => row.shortage), [200, 300, 0.01]);
  assert.equal(getRecipeStock(recipe({ 卵: '0.3個' }), [food('a', '卵', 0.1), food('b', '卵', 0.2)])[0].status, 'sufficient');
});

test('qualitative or incompatible amounts remain reviewable and never trigger guessed purchases', () => {
  for (const [amount, unit] of [['少々', 'g'], ['200g', 'pack'], ['大さじ1', 'g'], ['1個（50g）', 'piece'], ['1〜2個', 'piece']]) {
    const r = recipe({ 材料: amount });
    const stock = [food('one', '材料', 1, unit)];
    assert.equal(getRecipeStock(r, stock, 4)[0].status, 'review');
    assert.deepEqual(getRecipeShoppingItems(r, stock, [], 4), []);
  }
  const r = recipe({ 肉: '200g' });
  assert.equal(getRecipeStock(r, [food('g', '肉', 100, 'g'), food('pack', '肉', 1, 'pack')])[0].status, 'review');
  assert.equal(getRecipeStock(r, [food('g', '肉', 200, 'g'), food('pack', '肉', 1, 'pack')])[0].status, 'sufficient');
});

test('water is preparation, unknown servings retain base amounts, and missing qualitative amounts ask for review', () => {
  const r = recipe({ 水: '500ml', 卵: '2個', 塩: '少々' }, null);
  const rows = getRecipeStock(r, [food('egg', '卵', 1)], 4);
  assert.deepEqual(rows.map((row) => row.status), ['preparation', 'shortage', 'missing']);
  const items = getRecipeShoppingItems(r, [food('egg', '卵', 1)], [], 4);
  assert.deepEqual(items.map((item) => item.name), ['卵', '塩']);
  assert.match(items[0].memo, /人数未設定.*不足分：1個/);
  assert.match(items[1].memo, /少々.*要確認/);
});

test('two recipe aliases cannot both claim the same stock is sufficient', () => {
  const rows = getRecipeStock(recipe({ 卵: '2個', 玉子: '2個' }), [food('egg', '卵', 2)]);
  assert.ok(rows.every((row) => row.status === 'review'));
});
