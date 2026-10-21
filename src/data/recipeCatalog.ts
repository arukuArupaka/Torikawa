import drafts from './additionalRecipes.v1.json';
import quickDrafts from './additionalRecipes.v2.json';
import classicDrafts from './additionalRecipes.v3.json';
import moreClassicDrafts from './additionalRecipes.v4.json';
import { Recipe, RecipeCategory } from '../types';
import { normalizeIngredientName } from '../utils/recipeMatching';
import { generatedRecipeImages } from './generatedRecipeImages';

// Authored for this app on 2026-10-14. Stable IDs keep imports repeatable.
// Append new batches only; reordering earlier records would change saved recipe IDs.
export const additionalRecipes: Recipe[] = [...drafts, ...quickDrafts, ...classicDrafts, ...moreClassicDrafts].map((draft, index) => ({
  id: `recipe-${index + 9}`,
  name: draft.name,
  image: generatedRecipeImages[`recipe-${index + 9}`] ?? 'food-icon:other',
  category: draft.category as RecipeCategory,
  servings: draft.servings,
  minutes: draft.minutes,
  ingredients: Object.keys(draft.amounts),
  ingredientAmounts: Object.fromEntries(Object.entries(draft.amounts)),
  steps: Object.keys(draft.amounts).some(ingredient => /^(?:鶏肉|豚肉|牛肉|ひき肉|鶏ひき肉)$/.test(ingredient))
    ? [...draft.steps, '肉は中心温度75℃以上で1分間以上加熱したことを確認してから食べる。'] : [...draft.steps],
  isFavorite: false,
  createdAt: index < drafts.length ? '2026-10-14T00:00:00.000Z' : '2026-10-19T00:00:00.000Z',
}));

export const BUILT_IN_RECIPE_COUNT = 8 + additionalRecipes.length;

/** Only explicit imports add new recipes; deleted older defaults stay deleted. */
export function getNewCatalogRecipes(current: Recipe[]): Recipe[] {
  const ids = new Set(current.map(recipe => recipe.id));
  const names = new Set(current.map(recipe => normalizeIngredientName(recipe.name)));
  return additionalRecipes.filter(recipe => !ids.has(recipe.id) && !names.has(normalizeIngredientName(recipe.name)));
}
