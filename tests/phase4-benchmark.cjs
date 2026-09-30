// Run manually: node tests/phase4-benchmark.cjs
require('./register-typescript.cjs');
const Module = require('node:module');
const original = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Image: { resolveAssetSource: (uri) => ({ uri }) } };
  return original.call(this, request, ...args);
};
require.extensions['.jpg'] = (module, filename) => { module.exports = filename; };
const { sampleRecipes } = require('../src/data/sampleData.ts');
const matching = require('../src/utils/recipeMatching.ts');
const { getFoodIngredientName } = require('../src/utils/ingredientNormalizer.ts');
const { getRecipeStock } = require('../src/utils/recipeStock.ts');
const { getRecipeIngredientAvailability } = require('../src/utils/recipeIngredients.ts');
const { generateLocalRecipeIdeas } = require('../src/services/localRecipeSuggestionService.ts');
const indexedAll = matching.findMatchingFoods, indexedOne = matching.findMatchingFood;
const scan = (name, foods) => {
  const key = matching.ingredientKey(name);
  return foods.filter((food) => matching.ingredientKey(getFoodIngredientName(food)) === key)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
};
const names = ['卵', '牛乳', 'キャベツ', '豆腐', '玉ねぎ', 'にんじん', 'トマト', '豚肉', '鶏肉', 'ごはん'];
function measure(count, indexed, operation) {
  matching.findMatchingFoods = indexed ? indexedAll : scan;
  matching.findMatchingFood = indexed ? indexedOne : (name, foods) => scan(name, foods)[0];
  const elapsed = [];
  for (let run = 0; run < 18; run++) {
    const foods = Array.from({ length: count }, (_, i) => ({ id: `f-${i}`, name: names[i % names.length], ingredientName: names[i % names.length], productName: null,
      status: 'active', expiryDate: `2099-01-${String(i % 28 + 1).padStart(2, '0')}`, quantity: 100, quantityUnit: 'g', category: 'other', image: '', tags: [] }));
    const start = performance.now();
    operation(foods);
    const duration = performance.now() - start;
    if (run >= 3) elapsed.push(duration);
  }
  return Number(elapsed.sort((a, b) => a - b)[7].toFixed(3));
}
const recipeWork = (foods) => sampleRecipes.forEach((recipe) => { getRecipeIngredientAvailability(recipe, foods); getRecipeStock(recipe, foods); });
const results = [10, 100, 500].map((count) => ({ foods: count,
  scanRecipeMs: measure(count, false, recipeWork), indexedRecipeMs: measure(count, true, recipeWork),
  scanIdeasMs: measure(count, false, generateLocalRecipeIdeas), indexedIdeasMs: measure(count, true, generateLocalRecipeIdeas) }));
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, recipeCount: sampleRecipes.length,
  method: '15-run median after 3 warmups; fresh immutable inventory per run. Scan versus index in current calculation logic. Excludes rendering/storage; not device FPS.', results }, null, 2));
