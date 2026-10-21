require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: asset => ({ uri: asset }) } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { sampleRecipes } = require('../src/data/sampleData.ts');
const { getNewCatalogRecipes } = require('../src/data/recipeCatalog.ts');
const { getRecipeIngredientAvailability } = require('../src/utils/recipeIngredients.ts');
const drafts = require('../src/data/additionalRecipes.v2.json');
const originalDrafts = require('../src/data/additionalRecipes.v1.json');
const oldRecipes = sampleRecipes.filter(recipe => Number(recipe.id.slice(7)) <= 100);
const newRecipes = sampleRecipes.filter(recipe => Number(recipe.id.slice(7)) > 100 && Number(recipe.id.slice(7)) <= 120);
// Coverage scenarios assume only these seasonings are in stock; actual users may lack them.
const pantry = ['醤油', '塩', 'こしょう', '砂糖', '酢', '油', 'ごま油', 'バター', '味噌', '顆粒だし', '鶏がらスープの素', 'すりごま'];
const food = name => ({ id: name, name, ingredientName: name, tags: [], category: 'other',
  status: 'active', expiryDate: '2099-01-01' });
const available = (recipe, names) => getRecipeIngredientAvailability(recipe, names.map(food)).missingIngredients.length === 0;

test('the new batch adds exactly 20 one-person dishes taking at most ten minutes and one or two main ingredients', () => {
  assert.equal(newRecipes.length, 20);
  newRecipes.forEach((recipe, index) => {
    assert.equal(recipe.id, `recipe-${101 + index}`);
    assert.equal(recipe.name, drafts[index].name);
    assert.equal(recipe.servings, 1);
    assert.ok(recipe.minutes > 0 && recipe.minutes <= 10, recipe.name);
    const mains = recipe.ingredients.filter(name => name !== '水' && !pantry.includes(name));
    assert.ok(mains.length >= 1 && mains.length <= 2, recipe.name);
    assert.ok(available(recipe, [...pantry, ...mains]), recipe.name);
  });
});

test('simple vegetable stocks now match a ten-minute dish that uses the target vegetable', () => {
  for (const names of [['ブロッコリー'], ['オクラ', 'かつお節'], ['えのき'], ['しいたけ'],
    ['レタス', '卵'], ['レタス', 'ツナ缶'], ['ねぎ'], ['れんこん'], ['さつまいも'], ['大根', 'ツナ缶']]) {
    const stock = [...pantry, ...names];
    const matches = recipe => recipe.minutes <= 10 && recipe.ingredients.includes(names[0]) && available(recipe, stock);
    assert.equal(oldRecipes.filter(matches).length, 0, names.join('・'));
    assert.ok(newRecipes.some(matches), names.join('・'));
  }
});

test('new suggestions still report absent seasonings and never substitute expired or differently named ingredients', () => {
  const steamed = newRecipes.find(recipe => recipe.id === 'recipe-102');
  assert.ok(steamed, 'broccoli dish exists');
  assert.deepEqual(getRecipeIngredientAvailability(steamed, [food('ブロッコリー')]).missingIngredients, ['塩']);
  assert.ok(getRecipeIngredientAvailability(steamed, [food('カリフラワー'), food('塩')]).missingIngredients.includes('ブロッコリー'));
  const { getUsableFoods } = require('../src/utils/recipeMatching.ts');
  const stock = getUsableFoods([{ ...food('ブロッコリー'), expiryDate: '2000-01-01' }, food('塩')]);
  assert.ok(getRecipeIngredientAvailability(steamed, stock).missingIngredients.includes('ブロッコリー'));
});

test('existing catalog records stay stable and an existing 100-recipe collection imports only missing batches once', () => {
  assert.equal(oldRecipes.length, 100);
  originalDrafts.forEach((draft, index) => {
    const old = oldRecipes[index + 8];
    assert.equal(old.id, `recipe-${index + 9}`);
    assert.equal(old.name, draft.name);
    assert.equal(old.createdAt, '2026-10-14T00:00:00.000Z');
    assert.deepEqual(old.ingredientAmounts, draft.amounts);
  });
  const current = structuredClone(oldRecipes);
  current[0] = { ...current[0], name: '自分の味噌炒め', image: 'file:///my-photo.jpg', isFavorite: true };
  const before = structuredClone(current);
  const additions = getNewCatalogRecipes(current);
  assert.deepEqual(additions.map(recipe => recipe.id), Array.from({ length: 36 }, (_, i) => `recipe-${101 + i}`));
  assert.deepEqual(current, before);
  assert.deepEqual(getNewCatalogRecipes([...current, ...additions]), []);
  const own = { ...additions[0], id: 'user-recipe', name: ` ${additions[0].name} ` };
  assert.equal(getNewCatalogRecipes([...current, own]).length, 35);
});
