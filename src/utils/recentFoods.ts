import { FoodItem } from '../types';
import { normalizeIngredientName } from './recipeMatching';
import { getFoodDisplayName } from './ingredientNormalizer';

/** Keep the latest registration of each display name; do not merge different products. */
export function getRecentFoods(foods: FoodItem[], query = '', limit = 8): FoodItem[] {
  const seen = new Set<string>();
  const needle = normalizeIngredientName(query);
  return [...foods].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .filter((food) => {
      const key = normalizeIngredientName(getFoodDisplayName(food));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return !needle || [food.name, food.productName ?? '', food.ingredientName].some((value) => normalizeIngredientName(value).includes(needle));
    }).slice(0, limit);
}
