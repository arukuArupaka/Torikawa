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
const { getRecipeIngredientAvailability, getRecipeShoppingItems } = require('../src/utils/recipeIngredients.ts');
const { isGeneratedRecipeImage } = require('../src/data/generatedRecipeImages.ts');
const drafts = require('../src/data/additionalRecipes.v3.json');
const classics = () => sampleRecipes.filter(recipe => Number(recipe.id.slice(7)) >= 121 && Number(recipe.id.slice(7)) <= 127);
const food = name => ({ id: name, name, ingredientName: name, tags: [], category: 'other',
  status: 'active', expiryDate: '2099-01-01' });

test('seven named classic main dishes have stable IDs, two-person amounts, complete steps and bundled illustrations', () => {
  const expected = ['カレーライス', '肉じゃが', 'オムライス', '鶏の唐揚げ', '麻婆豆腐', '焼きそば', 'クリームシチュー'];
  assert.deepEqual(classics().map(recipe => recipe.name), expected);
  classics().forEach((recipe, index) => {
    assert.equal(recipe.id, `recipe-${121 + index}`);
    assert.equal(recipe.category, 'main');
    assert.equal(recipe.servings, 2);
    assert.ok(recipe.minutes >= 15 && recipe.minutes <= 40);
    assert.deepEqual(recipe.ingredients, Object.keys(drafts[index].amounts));
    assert.deepEqual(recipe.ingredientAmounts, drafts[index].amounts);
    assert.deepEqual(recipe.steps.slice(0, drafts[index].steps.length), drafts[index].steps);
    assert.ok(recipe.steps.some(step => step.includes('75℃') && step.includes('1分間以上')), recipe.name);
    assert.ok(isGeneratedRecipeImage(recipe), recipe.name);
    assert.ok(getRecipeIngredientAvailability(recipe, recipe.ingredients.map(food)).missingIngredients.length === 0);
  });
});

test('curry and stew need the correct roux, curry rice includes cooked rice, and substitutes are never guessed', () => {
  const curry = sampleRecipes.find(recipe => recipe.name === 'カレーライス');
  const stew = sampleRecipes.find(recipe => recipe.name === 'クリームシチュー');
  assert.ok(curry && stew);
  assert.ok(curry.ingredients.includes('ごはん'));
  assert.ok(!curry.ingredients.includes('米'));
  assert.ok(curry.steps.some(step => step.includes('製品表示')));
  assert.ok(stew.steps.some(step => step.includes('製品表示')));
  const stock = curry.ingredients.filter(name => !['カレールウ', 'ごはん', '水'].includes(name)).map(food);
  stock.push(food('カレー粉'), food('米'), food('クリームシチュールウ'));
  assert.deepEqual(getRecipeIngredientAvailability(curry, stock).missingIngredients, ['カレールウ', 'ごはん']);
  const shopping = getRecipeShoppingItems(curry, stock, [{ name: 'カレールウ', checked: false }], 4);
  assert.deepEqual(shopping.map(item => item.name), ['ごはん']);
  assert.match(shopping[0].memo, /4人分.*600g/);
});

test('a saved 120-recipe collection imports the missing classics without changing photos, edits or favorites', () => {
  const current = structuredClone(sampleRecipes.slice(0, 120));
  current[0] = { ...current[0], name: '我が家の味噌炒め', image: 'file:///personal.jpg', isFavorite: true };
  const before = structuredClone(current);
  const additions = getNewCatalogRecipes(current);
  assert.deepEqual(additions.map(recipe => recipe.id), Array.from({ length: 16 }, (_, i) => `recipe-${121 + i}`));
  assert.deepEqual(current, before);
  assert.deepEqual(getNewCatalogRecipes([...current, ...additions]), []);
  const ownCurry = { ...additions[0], id: 'user-curry', name: ' カレーライス ' };
  assert.deepEqual(getNewCatalogRecipes([...current, ownCurry]).map(recipe => recipe.id), additions.slice(1).map(recipe => recipe.id));
});

test('the next nine classics have the requested names, stable IDs, complete ingredients and bundled images', () => {
  const nextDrafts = require('../src/data/additionalRecipes.v4.json');
  const recipes = sampleRecipes.slice(127);
  const names = ['牛丼', '餃子', 'ナポリタン', 'ミートソースパスタ', 'お好み焼き', '豚キムチ', 'とんかつ', '鮭の塩焼き', 'ぶりの照り焼き'];
  assert.deepEqual(recipes.map(recipe => recipe.name), names);
  recipes.forEach((recipe, index) => {
    assert.equal(recipe.id, `recipe-${128 + index}`);
    assert.equal(recipe.category, 'main');
    assert.equal(recipe.servings, 2);
    assert.deepEqual(recipe.ingredients, Object.keys(nextDrafts[index].amounts));
    assert.deepEqual(recipe.ingredientAmounts, nextDrafts[index].amounts);
    assert.deepEqual(recipe.steps.slice(0, nextDrafts[index].steps.length), nextDrafts[index].steps);
    assert.ok(isGeneratedRecipeImage(recipe));
    if (recipe.ingredients.some(name => ['牛肉', 'ひき肉', '豚肉', '鮭', 'ぶり'].includes(name))) {
      assert.ok(recipe.steps.some(step => step.includes('中心') && (step.includes('火が通') || step.includes('75℃'))),
        `${recipe.name}: check doneness when it contains raw meat or fish`);
    }
    assert.equal(getRecipeIngredientAvailability(recipe, recipe.ingredients.map(food)).missingIngredients.length, 0);
  });
});

test('dumpling wrappers and breading remain required, shopping scales them and never guesses a substitute', () => {
  const dumplings = sampleRecipes.find(recipe => recipe.name === '餃子');
  const cutlet = sampleRecipes.find(recipe => recipe.name === 'とんかつ');
  assert.ok(dumplings && cutlet);
  const withoutWrappers = dumplings.ingredients.filter(name => !['餃子の皮', '水'].includes(name)).map(food);
  assert.deepEqual(getRecipeIngredientAvailability(dumplings, withoutWrappers).missingIngredients, ['餃子の皮']);
  const withoutBreading = cutlet.ingredients.filter(name => !['薄力粉', '卵', 'パン粉'].includes(name)).map(food);
  withoutBreading.push(food('片栗粉'));
  assert.deepEqual(getRecipeIngredientAvailability(cutlet, withoutBreading).missingIngredients, ['薄力粉', '卵', 'パン粉']);
  const shopping = getRecipeShoppingItems(cutlet, withoutBreading, [{ name: '薄力粉', checked: false }], 4);
  assert.deepEqual(shopping.map(item => item.name), ['卵', 'パン粉']);
  assert.match(shopping.find(item => item.name === 'パン粉').memo, /4人分.*80g/);
});

test('a saved 127-recipe collection imports the nine dishes once without mutating personal data', () => {
  const current = structuredClone(sampleRecipes.slice(0, 127));
  current[120] = { ...current[120], name: '我が家のカレー', image: 'file:///my-curry.jpg', isFavorite: true };
  const before = structuredClone(current);
  const additions = getNewCatalogRecipes(current);
  assert.deepEqual(additions.map(recipe => recipe.id), Array.from({ length: 9 }, (_, i) => `recipe-${128 + i}`));
  assert.deepEqual(current, before);
  assert.deepEqual(getNewCatalogRecipes([...current, ...additions]), []);
  const own = { ...additions[0], id: 'user-gyudon', name: ' 牛丼 ' };
  assert.deepEqual(getNewCatalogRecipes([...current, own]).map(recipe => recipe.id), additions.slice(1).map(recipe => recipe.id));
});
