require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: asset => ({ uri: asset }) } };
  return originalLoad.call(this, request, ...args);
};
// Match Expo Go's real asset URLs instead of using filesystem paths as the image mock.
require.extensions['.jpg'] = (module, filename) => {
  const relative = './' + path.relative(path.resolve(__dirname, '..'), filename).split(path.sep).join('/');
  const hash = createHash('md5').update(fs.readFileSync(filename)).digest('hex');
  module.exports = `https://current.on.expo.app/assets/?unstable_path=${encodeURIComponent(relative)}&platform=ios&hash=${hash}`;
};
const { normalizeAppData } = require('../src/services/appDataMigration.ts');
const { sampleRecipes, sampleRecipeImages } = require('../src/data/sampleData.ts');
const { isGeneratedRecipeImage } = require('../src/data/generatedRecipeImages.ts');
const snapshot = recipes => ({ foods: [], recipes, shoppingItems: [],
  notificationSettings: { enabled: false, daysBeforeList: [3], time: '18:00' } });
const previousUrl = (source, origin = 'http://previous.on.expo.app') => {
  const current = new URL(source);
  return origin + current.pathname + current.search;
};

test('all built-in recipe images recover after the Expo origin changes without changing edits or personal metadata', () => {
  const saved = sampleRecipes.map((recipe, index) => ({ ...structuredClone(recipe),
    image: previousUrl(recipe.image, index < 8 ? 'http://192.168.1.5:8081' : 'http://previous.on.expo.app'),
    isFavorite: index % 2 === 0, createdAt: '2025-01-01',
  }));
  saved[8] = { ...saved[8], name: '我が家の照り焼き', steps: [...saved[8].steps, '盛り付けを変える。'], servings: 4 };
  const before = structuredClone(saved);
  const result = normalizeAppData(snapshot(saved));
  assert.equal(result.recipes.length, 136);
  for (let i = 0; i < saved.length; i++) {
    assert.deepEqual(result.recipes[i], { ...saved[i], image: sampleRecipeImages[saved[i].id] });
    assert.equal(isGeneratedRecipeImage(result.recipes[i]), true);
  }
  assert.deepEqual(saved, before, 'normalization must not mutate the stored input');
  assert.deepEqual(normalizeAppData(result), result, 'repeated loading is idempotent');
});

test('replaced original eight photos recover from recorded Metro paths and hashes while preserving content edits', () => {
  const oldAssets = require('../src/data/legacyRecipeImageAssets.v1.json');
  for (const asset of oldAssets) {
    const recipe = sampleRecipes.find(recipe => recipe.id === asset.id);
    const url = new URL('http://previous.on.expo.app/assets/');
    url.searchParams.set('unstable_path', asset.metroPath);
    url.searchParams.set('platform', 'ios');
    url.searchParams.set('hash', asset.md5);
    const saved = { ...structuredClone(recipe), image: url.href, name: '自分用の料理', isFavorite: true, createdAt: '2025-01-01' };
    assert.deepEqual(normalizeAppData(snapshot([saved])).recipes[0], { ...saved, image: recipe.image });
    const changed = new URL(url); changed.searchParams.set('hash', '0'.repeat(32));
    const personal = { ...saved, image: changed.href };
    assert.deepEqual(normalizeAppData(snapshot([personal])).recipes[0], personal);
    for (const suffix of ['&crop=square', '&hash=' + asset.md5, '#personal']) {
      const personal = { ...saved, image: url.href + suffix };
      assert.deepEqual(normalizeAppData(snapshot([personal])).recipes[0], personal);
    }
  }
});

test('replaced Web export photos recover only by the full known asset path and hash', () => {
  const oldAssets = require('../src/data/legacyRecipeImageAssets.v1.json');
  for (const asset of oldAssets) {
    const recipe = sampleRecipes.find(recipe => recipe.id === asset.id);
    const filename = asset.metroPath.split('/').at(-1).replace('.jpg', `.${asset.md5}.jpg`);
    const webPath = `/Torikawa/assets/assets/recipes/${filename}`;
    for (const image of [webPath, 'https://previous.example.com' + webPath]) {
      assert.equal(normalizeAppData(snapshot([{ ...recipe, image }])).recipes[0].image, recipe.image);
    }
    for (const image of [webPath + '?crop=square', webPath + '#personal', webPath.replace(asset.md5, '0'.repeat(32)),
      'file:///my-photos/' + filename, 'https://me:secret@example.com' + webPath, '/my-photos/' + filename]) {
      const personal = { ...recipe, image };
      assert.deepEqual(normalizeAppData(snapshot([personal])).recipes[0], personal);
    }
  }
});

test('a different photo, different asset hash, unrecognized query or local file is never replaced', () => {
  const recipe = sampleRecipes.find(recipe => recipe.id === 'recipe-9');
  const old = new URL(previousUrl(recipe.image));
  const changedHash = new URL(old); changedHash.searchParams.set('hash', '0'.repeat(32));
  const missingHash = new URL(old); missingHash.searchParams.delete('hash');
  const resized = new URL(old); resized.searchParams.set('crop', 'square');
  const wrongRoute = new URL(old); wrongRoute.pathname = '/my-photos/';
  const wrongPath = new URL(old); wrongPath.searchParams.set('unstable_path', './photos/recipe-009.jpg');
  for (const image of ['file:///photos/recipe-009.jpg', 'content://photos/recipe-009.jpg', 'data:image/jpeg;base64,YWJjZA==',
    'https://photos.example.com/recipe-009.jpg', old.origin + old.pathname,
    changedHash.href, missingHash.href, resized.href, wrongRoute.href, wrongPath.href,
    previousUrl(sampleRecipeImages['recipe-10'])]) {
    const saved = { ...structuredClone(recipe), image, isFavorite: true };
    assert.deepEqual(normalizeAppData(snapshot([saved])).recipes[0], saved, image);
  }
});

test('known Expo image recovery tolerates platform, protocol and query-order changes but not embedded credentials', () => {
  const recipe = sampleRecipes.find(recipe => recipe.id === 'recipe-100');
  const current = new URL(recipe.image);
  const reordered = new URL('http://localhost:8085/assets/');
  reordered.searchParams.set('hash', current.searchParams.get('hash'));
  reordered.searchParams.set('platform', 'android');
  reordered.searchParams.set('unstable_path', current.searchParams.get('unstable_path'));
  assert.equal(normalizeAppData(snapshot([{ ...recipe, image: reordered.href }])).recipes[0].image, recipe.image);
  reordered.username = 'personal'; reordered.password = 'private';
  assert.equal(normalizeAppData(snapshot([{ ...recipe, image: reordered.href }])).recipes[0].image, reordered.href);
});
