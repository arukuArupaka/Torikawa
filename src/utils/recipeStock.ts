import { FoodItem, FoodQuantityUnit, Recipe } from '../types';
import { daysUntil } from './date';
import { foodQuantityUnitOptions, formatFoodQuantity, parseRecipeAmountForUnit } from './foodQuantity';
import { findMatchingFoods, normalizeIngredientName } from './recipeMatching';
import { getServingsMultiplier, scaleRecipeAmount } from './recipeServings';

export type RecipeStockRow = {
  ingredient: string;
  status: 'preparation' | 'missing' | 'sufficient' | 'shortage' | 'review';
  foods: FoodItem[];
  unit?: FoodQuantityUnit;
  available?: number;
  required?: number;
  shortage?: number;
};

/** Compare original amounts before display rounding; never infer weight from a pack/piece. */
export function getRecipeStock(recipe: Pick<Recipe, 'ingredients' | 'ingredientAmounts' | 'servings'>, foods: FoodItem[], targetServings = recipe.servings): RecipeStockRow[] {
  const usable = foods.filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0);
  const matches = recipe.ingredients.map((ingredient) => findMatchingFoods(ingredient, usable));
  return recipe.ingredients.map((ingredient, index) => {
    const stock = matches[index];
    const row = { ingredient, foods: stock };
    if (normalizeIngredientName(ingredient) === '水') return { ...row, status: 'preparation' };
    const amount = recipe.ingredientAmounts[ingredient] ?? '';
    const unit = foodQuantityUnitOptions.find((option) => parseRecipeAmountForUnit(amount, option.value) !== null)?.value;
    const required = unit ? parseRecipeAmountForUnit(amount, unit)! * getServingsMultiplier(recipe.servings, targetServings) : undefined;
    if (stock.length === 0) return { ...row, status: 'missing', unit, required };
    // Aliases in multiple recipe rows could spend the same stock twice. Request review.
    const shared = matches.some((other, otherIndex) => otherIndex !== index && other.some((food) => stock.some((item) => item.id === food.id)));
    if (!unit || required === undefined || shared || scaleRecipeAmount(amount, recipe.servings, targetServings).needsReview) return { ...row, status: 'review' };
    const comparable = stock.filter((food) => food.quantityUnit === unit && Number.isFinite(food.quantity) && food.quantity >= 0);
    const available = comparable.reduce((total, food) => total + food.quantity, 0);
    if (available + 1e-9 >= required) return { ...row, status: 'sufficient', unit, required, available };
    // An additional package of unknown size could cover the difference; do not suggest overbuying.
    if (comparable.length !== stock.length) return { ...row, status: 'review' };
    const shortage = Math.ceil((required - available - 1e-9) * 100) / 100;
    return { ...row, status: 'shortage', unit, required, available, shortage };
  });
}

export function getStockLabel(row: RecipeStockRow): string {
  if (row.status === 'shortage') return `あと${formatFoodQuantity(row.shortage!, row.unit!)}必要`;
  if (row.status === 'sufficient') return '分量が足ります';
  if (row.status === 'review') return '分量は要確認（単位・登録内容を確認）';
  if (row.status === 'missing') return row.required === undefined ? '在庫なし・分量は要確認' : '使える在庫がありません';
  return '調理用に用意';
}
