import { FoodItem, ShoppingItem } from '../types';
import { getFoodIngredientName } from './ingredientNormalizer';

export type FrequentShoppingSuggestion = {
  name: string;
  count: number;
};

export function normalizeShoppingName(name: string): string {
  return name.trim().toLocaleLowerCase('ja-JP');
}

export function hasPendingShoppingItem(items: ShoppingItem[], name: string): boolean {
  const normalizedName = normalizeShoppingName(name);
  if (!normalizedName) return false;
  return items.some((item) => !item.checked && normalizeShoppingName(item.name) === normalizedName);
}

export function getFrequentShoppingSuggestions(
  foods: FoodItem[],
  shoppingItems: ShoppingItem[],
  limit = 8,
): FrequentShoppingSuggestion[] {
  const pendingNames = new Set(
    shoppingItems
      .filter((item) => !item.checked)
      .map((item) => normalizeShoppingName(item.name))
      .filter(Boolean),
  );
  const suggestions = new Map<string, FrequentShoppingSuggestion>();

  const addCandidate = (name: string) => {
    const trimmedName = name.trim();
    const normalizedName = normalizeShoppingName(trimmedName);
    if (!trimmedName || !normalizedName || pendingNames.has(normalizedName)) return;

    const current = suggestions.get(normalizedName);
    if (current) {
      current.count += 1;
      return;
    }
    suggestions.set(normalizedName, { name: trimmedName, count: 1 });
  };

  foods.forEach((food) => addCandidate(getFoodIngredientName(food)));
  shoppingItems.filter((item) => item.checked).forEach((item) => addCandidate(item.name));

  return [...suggestions.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja-JP'))
    .slice(0, limit);
}
