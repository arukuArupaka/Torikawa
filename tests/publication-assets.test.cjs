require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: asset => ({ uri: asset }) } };
  return originalLoad.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { sampleRecipes, createSampleFoods } = require('../src/data/sampleData.ts');
const { sampleMilkProduct } = require('../src/data/productCatalog.ts');
const { migrateSampleRecipe } = require('../src/utils/recipeMigration.ts');
const { normalizeAppData } = require('../src/services/appDataMigration.ts');
const { getRecipeFallbackImage } = require('../src/utils/recipeImages.ts');
const { generateLocalRecipeIdeas } = require('../src/services/localRecipeSuggestionService.ts');
const { foodIconCategory } = require('../src/utils/yahooImagePolicy.ts');
const previousRecipes = require('../src/data/legacySampleRecipes.v2.json');
const snapshot = recipes => ({ foods: [], recipes, shoppingItems: [],
  notificationSettings: { enabled: false, daysBeforeList: [3], time: '18:00' } });

test('the selected leaf-clock icon is used on iOS, Android and Web without a legacy Android override', () => {
  const { expo } = require('../app.json');
  const config = require('../app.config.js')({ config: expo });
  const record = require('../assets/branding/manifest.json');
  const iconPath = `./assets/branding/${record.file}`;
  assert.equal(config.icon, iconPath);
  assert.equal(config.ios.icon ?? config.icon, iconPath);
  assert.equal(config.android.icon, iconPath);
  assert.equal(config.android.adaptiveIcon, undefined, 'the former Expo foreground must not override the selected icon');
  assert.equal(config.web.favicon, iconPath);
  const bytes = fs.readFileSync(path.resolve(__dirname, '..', iconPath));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), record.width);
  assert.equal(bytes.readUInt32BE(20), record.height);
  assert.equal(record.width, record.height);
  assert.equal(bytes[25], 2, 'the original RGB PNG is opaque');
  assert.equal(record.generator, 'built-in image_gen');
  assert.match(record.prompt, /Fresh Moment/);
});

test('the original eight recipe instructions update without changing quantities, names, favorites or personal photos', () => {
  for (const previous of previousRecipes) {
    const saved = { ...structuredClone(previous), image: 'file:///my-photo.jpg', isFavorite: true, createdAt: '2025-01-01' };
    const before = structuredClone(saved);
    const current = sampleRecipes.find(recipe => recipe.id === saved.id);
    assert.notDeepEqual(current.steps, previous.steps);
    assert.deepEqual(current.ingredients, previous.ingredients);
    assert.deepEqual(current.ingredientAmounts, previous.ingredientAmounts);
    const expected = { ...saved, steps: current.steps };
    assert.deepEqual(migrateSampleRecipe(saved, sampleRecipes), expected);
    assert.deepEqual(normalizeAppData(snapshot([saved])).recipes[0], expected);
    assert.deepEqual(saved, before);
    const migrated = migrateSampleRecipe(saved, sampleRecipes);
    assert.strictEqual(migrateSampleRecipe(migrated, sampleRecipes), migrated);
    const withoutServings = { ...saved }; delete withoutServings.servings;
    assert.equal(migrateSampleRecipe(withoutServings, sampleRecipes).servings, current.servings);
  }
});

test('personal content, serving choices, IDs and photos are preserved for either historical recipe version', () => {
  const edits = [
    r => { r.name += ' 自分用'; }, r => { r.category = 'other'; }, r => { r.minutes += 1; },
    r => { r.steps.push('自分のメモ'); }, r => { r.ingredients.reverse(); },
    r => { r.ingredientAmounts[r.ingredients[0]] = '999g'; },
    r => { r.servings = null; }, r => { r.servings = 8; }, r => { r.id = 'my-recipe'; },
  ];
  for (const versions of [previousRecipes, require('../src/data/legacySampleRecipes.v1.json')]) {
    for (const original of versions) {
      for (const edit of edits) {
        const saved = { ...structuredClone(original), image: 'file:///personal.jpg', isFavorite: true, createdAt: '2025-01-01' };
        edit(saved);
        assert.strictEqual(migrateSampleRecipe(saved, sampleRecipes), saved);
        const normalized = normalizeAppData(snapshot([saved])).recipes[0];
        assert.equal(normalized.image, saved.image);
        assert.deepEqual(normalized.steps, saved.steps);
        assert.deepEqual(normalized.ingredientAmounts, saved.ingredientAmounts);
      }
    }
  }
});

test('empty recipe collections stay empty and saved local suggestions are not rewritten', () => {
  assert.deepEqual(normalizeAppData(snapshot([])).recipes, []);
  const custom = { ...sampleRecipes[0], id: 'user-saved-idea', name: '自分の献立', image: 'https://photos.example.org/private.jpg' };
  assert.deepEqual(normalizeAppData(snapshot([custom])).recipes, [custom]);
});

test('all 136 bundled generated photos match their provenance records and the old unverified files are absent', () => {
  const manifest = require('../assets/recipes/generated/manifest.json');
  assert.equal(manifest.images.length, 136);
  for (const recipe of sampleRecipes) {
    const record = manifest.images.find(image => image.id === recipe.id);
    assert.ok(record);
    assert.ok(record.prompt.includes(recipe.name));
    assert.equal(record.generator, 'built-in image_gen');
    const file = path.resolve(__dirname, '../assets/recipes/generated', record.file);
    const bytes = fs.readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    assert.equal(recipe.image, file);
  }
  for (const asset of require('../src/data/legacyRecipeImageAssets.v1.json')) {
    assert.equal(fs.existsSync(path.resolve(__dirname, '..', asset.metroPath)), false);
  }
});

test('new photo-free recipes and demo products use offline icons instead of external stock images', () => {
  for (const category of ['main', 'side', 'soup', 'breakfast', 'lunchbox', 'mealPrep', 'quick', 'healthy', 'other']) {
    assert.ok(foodIconCategory(getRecipeFallbackImage(category)));
  }
  for (const item of [...createSampleFoods(), sampleMilkProduct]) assert.ok(foodIconCategory(item.image));
  const food = (name, category = 'other') => ({ id: name, name, ingredientName: name, category, tags: [], status: 'active', expiryDate: '2099-01-01' });
  const ideas = generateLocalRecipeIdeas([food('卵'), food('牛乳'), food('キャベツ', 'vegetables'), food('豆腐')]);
  assert.ok(ideas.length > 0);
  for (const idea of ideas) assert.ok(foodIconCategory(idea.image));
});
