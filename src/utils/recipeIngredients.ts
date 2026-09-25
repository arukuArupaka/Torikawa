import { FoodItem, Recipe, ShoppingItem } from '../types';
import { findMatchingFood, normalizeIngredientName } from './recipeMatching';
import { isValidServings, scaleRecipeAmount } from './recipeServings';
import { hasPendingShoppingItem, normalizeShoppingName } from './shoppingList';
import { getRecipeStock } from './recipeStock';
import { formatFoodQuantity } from './foodQuantity';

// Tap water belongs in the preparation list, not in inventory or shopping suggestions.
// Bottled/mineral water with a different name remains an ordinary ingredient.
export function isPreparationWater(ingredient: string): boolean {
  return normalizeIngredientName(ingredient) === '水';
}

export function getRecipeIngredientAvailability(recipe: Pick<Recipe, 'ingredients'>, usableFoods: FoodItem[]) {
  const trackedIngredients = recipe.ingredients.filter((ingredient) => !isPreparationWater(ingredient));
  const matches = trackedIngredients.flatMap((ingredient) => {
    const food = findMatchingFood(ingredient, usableFoods);
    return food ? [{ ingredient, food }] : [];
  });
  const matchedNames = new Set(matches.map((match) => match.ingredient));
  return {
    matches,
    missingIngredients: trackedIngredients.filter((ingredient) => !matchedNames.has(ingredient)),
    matchRate: trackedIngredients.length === 0 ? 0 : matches.length / trackedIngredients.length * 100,
  };
}

/** Include absent stock and measurable shortages, retaining existing shopping notes. */
export function getRecipeShoppingItems(
  recipe: Pick<Recipe, 'name' | 'ingredients' | 'ingredientAmounts' | 'servings'>,
  foods: FoodItem[],
  shoppingItems: ShoppingItem[],
  targetServings = recipe.servings,
) {
  const needed = getRecipeStock(recipe, foods, targetServings).filter((row) => row.status === 'missing' || row.status === 'shortage');
  const seen = new Set<string>();
  return needed.flatMap((row) => {
    const name = row.ingredient;
    const normalized = normalizeShoppingName(name);
    if (seen.has(normalized) || hasPendingShoppingItem(shoppingItems, name)) return [];
    seen.add(normalized);
    const scaled = scaleRecipeAmount(recipe.ingredientAmounts[name] ?? '適量', recipe.servings, targetServings);
    const people = isValidServings(recipe.servings) && isValidServings(targetServings) ? `${targetServings}人分` : '人数未設定';
    const quantity = row.status === 'shortage'
      ? `不足分：${formatFoodQuantity(row.shortage!, row.unit!)}（必要量：${scaled.amount} / 在庫：${formatFoodQuantity(row.available!, row.unit!)}）`
      : scaled.needsReview ? `元の分量：${scaled.amount}（換算できないため要確認）` : `必要量：${scaled.amount}${row.required === undefined ? '（分量は要確認）' : ''}`;
    return [{ name, memo: `「${recipe.name}」${people} / ${quantity}` }];
  });
}
