import { FoodItem } from '../types';

export function normalizeIngredientName(value: string): string {
  return value.trim().toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
}

export function findMatchingFood(ingredient: string, foods: FoodItem[]): FoodItem | undefined {
  const ingredientName = normalizeIngredientName(ingredient);
  return foods
    .filter((food) => {
      const foodName = normalizeIngredientName(food.name);
      return foodName === ingredientName
        || foodName.includes(ingredientName)
        || ingredientName.includes(foodName);
    })
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
}
