import { FoodItem } from '../types';
import { getFoodSearchTerms } from './ingredientNormalizer';

export function normalizeIngredientName(value: string): string {
  return value.trim().toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
}

export function findMatchingFood(ingredient: string, foods: FoodItem[]): FoodItem | undefined {
  const ingredientName = normalizeIngredientName(ingredient);
  return foods
    .filter((food) => {
      const terms = getFoodSearchTerms(food).map(normalizeIngredientName);
      return terms.some((term) =>
        term === ingredientName
        || term.includes(ingredientName)
        || ingredientName.includes(term),
      );
    })
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
}
