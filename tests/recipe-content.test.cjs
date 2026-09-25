require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: () => ({ uri: 'test-image' }) } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { sampleRecipes } = require('../src/data/sampleData.ts');
const legacyRecipes = require('../src/data/legacySampleRecipes.v1.json');
const { migrateSampleRecipe } = require('../src/utils/recipeMigration.ts');
const { getRecipeIngredientAvailability, getRecipeShoppingItems } = require('../src/utils/recipeIngredients.ts');
const { generateLocalRecipeIdeas } = require('../src/services/localRecipeSuggestionService.ts');
const { toDateString } = require('../src/utils/date.ts');

const food = (name, options = {}) => ({
  id: name, name, ingredientName: name, tags: [], status: 'active',
  expiryDate: '2099-01-01', category: 'other', ...options,
});

function assertCompletePreparation(recipe) {
  assert.equal(new Set(recipe.ingredients).size, recipe.ingredients.length, `${recipe.name}: duplicate ingredients`);
  assert.deepEqual(Object.keys(recipe.ingredientAmounts).sort(), [...recipe.ingredients].sort(), `${recipe.name}: amount keys`);
  for (const ingredient of recipe.ingredients) {
    assert.ok(recipe.ingredientAmounts[ingredient].trim(), `${recipe.name}: missing amount for ${ingredient}`);
  }
  // Longest terms first: 醤油 must not count as 油, 塩こしょう must not count as 塩.
  // 水気 is a draining instruction, not an instruction to add water.
  const pantryMentions = recipe.steps.join('\n').match(/オリーブオイル|塩こしょう|黒こしょう|マヨネーズ|顆粒だし|コンソメ|カレー粉|片栗粉|みりん|醤油|味噌|砂糖|酒|塩|油|水(?!気)/g) ?? [];
  for (const ingredient of pantryMentions) {
    assert.ok(recipe.ingredients.includes(ingredient), `${recipe.name}: step uses unlisted ${ingredient}`);
  }
  if (recipe.steps.some((step) => /炒め|両面を焼/.test(step))) {
    assert.ok(recipe.ingredients.includes('油'), `${recipe.name}: frying oil missing`);
  }
}

test('shopping suggestions use selected servings, exclude water and pending duplicates, and include expired stock', () => {
  const recipe = sampleRecipes.find((item) => item.id === 'recipe-8');
  const existing = [{ name: 'マヨネーズ', checked: false, memo: '自分のメモ' }];
  const result = getRecipeShoppingItems(recipe, [food('卵', { expiryDate: '2000-01-01' }), food('食パン')], existing, 2);
  assert.deepEqual(result.map((item) => item.name), ['卵', '塩こしょう']);
  assert.match(result[0].memo, /2人分.*必要量：4個/);
  assert.match(result[1].memo, /必要量：少々/);
  assert.equal(existing[0].memo, '自分のメモ');
  assert.ok(getRecipeShoppingItems(recipe, [], [{ name: '卵', checked: true }], 2).some((item) => item.name === '卵'));
});

test('shopping memo identifies unscaled ambiguous amounts and never guesses unknown servings', () => {
  const recipe = { ...sampleRecipes[3], ingredientAmounts: { ...sampleRecipes[3].ingredientAmounts, 卵: '1個（約50g）' } };
  const scaled = getRecipeShoppingItems(recipe, [], [], 4);
  assert.match(scaled.find((item) => item.name === '卵').memo, /4人分.*元の分量：1個（約50g）.*要確認/);
  const unknown = getRecipeShoppingItems({ ...sampleRecipes[3], servings: undefined }, [], [], 4);
  assert.match(unknown.find((item) => item.name === '卵').memo, /人数未設定.*必要量：2個/);
});

test('every built-in recipe lists the seasoning, oil and water used by its instructions', () => {
  sampleRecipes.forEach(assertCompletePreparation);
  const soup = sampleRecipes.find((recipe) => recipe.id === 'recipe-3');
  assert.deepEqual(soup.ingredients, ['豆腐', 'わかめ', '顆粒だし', '味噌', '水']);
  assert.equal(soup.ingredientAmounts.水, '400ml');
});

const ideaCases = [
  ['omelette', ['卵', '牛乳'], 'ふわっとオムレツ'],
  ['cabbage and egg', ['キャベツ', '卵'], 'さっと炒め'],
  ['tofu steak', ['豆腐'], '照り焼きステーキ'],
  ['chicken stir fry', ['鶏肉', '玉ねぎ'], '照り焼き炒め'],
  ['pork stir fry', ['豚肉', 'キャベツ'], 'みそ炒め'],
  ['steamed fish', ['鮭', 'しめじ'], 'フライパン蒸し'],
  ['curry potatoes', ['じゃがいも', '玉ねぎ'], 'カレー炒め'],
  ['salad', ['トマト', 'チーズ'], 'さっぱりサラダ'],
  ['toast', ['食パン', '卵'], 'たまごトースト'],
  ['fried rice', ['ごはん', '卵', 'キャベツ'], 'ぱらっとチャーハン'],
  ['noodles', ['うどん', 'キャベツ'], '具だくさん炒め'],
  ['soup', ['キャベツ'], 'あったかスープ'],
  ['urgent saute', ['なす'], '簡単ソテー'],
];
for (const [label, names, suffix] of ideaCases) {
  test(`generated ${label} lists every ingredient used in its steps`, () => {
    const ideas = generateLocalRecipeIdeas(names.map((name) => food(name, { expiryDate: toDateString(new Date()) })));
    assert.ok(ideas.some((idea) => idea.name.endsWith(suffix)), `missing template ${suffix}`);
    ideas.forEach(assertCompletePreparation);
  });
}

test('soup does not duplicate a seasoning or treat pantry items as spare vegetables', () => {
  const ideas = generateLocalRecipeIdeas([food('キャベツ', { category: 'vegetables' }), food('油', { category: 'seasonings' })]);
  const soup = ideas.find((idea) => idea.name.endsWith('あったかスープ'));
  assertCompletePreparation(soup);
  assert.deepEqual(soup.usedFoodNames, ['キャベツ']);
});

test('missing seasonings affect availability, while preparation water never does', () => {
  const soup = sampleRecipes.find((recipe) => recipe.id === 'recipe-3');
  const partial = getRecipeIngredientAvailability(soup, [food('豆腐'), food('わかめ'), food('水')]);
  assert.deepEqual(partial.missingIngredients, ['顆粒だし', '味噌']);
  assert.equal(partial.matchRate, 50);
  assert.deepEqual(partial.matches.map((match) => match.ingredient), ['豆腐', 'わかめ']);
  const full = getRecipeIngredientAvailability(soup, ['豆腐', 'わかめ', '顆粒だし', 'みそ'].map((name) => food(name)));
  assert.deepEqual(full.missingIngredients, []);
  assert.equal(full.matchRate, 100);
});

test('bottled water is tracked and empty or water-only lists produce a finite score', () => {
  assert.deepEqual(getRecipeIngredientAvailability({ ingredients: [' 水 ', 'ミネラルウォーター'] }, []).missingIngredients, ['ミネラルウォーター']);
  for (const ingredients of [[], ['水']]) {
    assert.equal(getRecipeIngredientAvailability({ ingredients }, []).matchRate, 0);
  }
});

test('unchanged legacy recipes gain complete content without losing personal metadata', () => {
  for (const legacy of legacyRecipes) {
    const saved = { ...structuredClone(legacy), isFavorite: true, image: 'file:///my-photo.jpg', createdAt: '2025-01-01' };
    const migrated = migrateSampleRecipe(saved, sampleRecipes);
    const current = sampleRecipes.find((recipe) => recipe.id === legacy.id);
    assert.deepEqual(migrated.ingredients, current.ingredients);
    assert.deepEqual(migrated.ingredientAmounts, current.ingredientAmounts);
    assert.deepEqual(migrated.steps, current.steps);
    assert.equal(migrated.servings, current.servings);
    assert.equal(migrated.isFavorite, true);
    assert.equal(migrated.image, saved.image);
    assert.equal(migrated.createdAt, saved.createdAt);
    assert.deepEqual(saved.ingredients, legacy.ingredients, 'input data must not be mutated');
    assert.strictEqual(migrateSampleRecipe(migrated, sampleRecipes), migrated, 'migration must be idempotent');
  }
});

test('only unchanged built-ins without a servings field gain a base serving count', () => {
  for (const sample of sampleRecipes) {
    const { servings, ...saved } = structuredClone(sample);
    assert.ok(Number.isInteger(servings) && servings > 0);
    const migrated = migrateSampleRecipe(saved, sampleRecipes);
    assert.equal(migrated.servings, servings);
    assert.deepEqual(migrated.ingredientAmounts, saved.ingredientAmounts);
    for (const choice of [null, 4]) {
      const explicit = { ...saved, servings: choice };
      assert.strictEqual(migrateSampleRecipe(explicit, sampleRecipes), explicit);
    }
    for (const changed of [{ ...saved, id: 'user-recipe' }, { ...saved, name: '自分用' },
      { ...saved, ingredientAmounts: { ...saved.ingredientAmounts, [saved.ingredients[0]]: '999g' } }]) {
      assert.strictEqual(migrateSampleRecipe(changed, sampleRecipes), changed);
      assert.equal(changed.servings, undefined);
    }
  }
});

test('any recipe content edit or a user recipe ID prevents automatic replacement', () => {
  const edits = [
    (r) => { r.name += ' 自分用'; },
    (r) => { r.category = 'quick'; },
    (r) => { r.minutes += 1; },
    (r) => { r.ingredients.pop(); },
    (r) => { r.ingredients.reverse(); },
    (r) => { r.ingredientAmounts.豆腐 = '1丁'; },
    (r) => { r.ingredientAmounts.水 = '100ml'; },
    (r) => { r.steps[0] += ' 自分のメモ'; },
    (r) => { r.id = 'user-created'; },
  ];
  for (const edit of edits) {
    const saved = structuredClone(legacyRecipes.find((recipe) => recipe.id === 'recipe-3'));
    edit(saved);
    assert.strictEqual(migrateSampleRecipe(saved, sampleRecipes), saved);
  }
});

test('legacy records without a category still receive the ingredient correction', () => {
  const saved = structuredClone(legacyRecipes[0]);
  delete saved.category;
  assert.ok(migrateSampleRecipe(saved, sampleRecipes).ingredients.includes('味噌'));
});
