import { FoodItem } from '../types';
import { getFoodIngredientName } from './ingredientNormalizer';
import { daysUntil, toDateString } from './date';

export function normalizeIngredientName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
}

// Only spelling equivalents belong here. Categories and search tags are not substitutes.
const ingredientAliases = [
  ['卵', 'たまご', '玉子'],
  ['玉ねぎ', 'たまねぎ', 'タマネギ', '玉葱'],
  ['にんじん', 'ニンジン', '人参'],
  ['じゃがいも', 'ジャガイモ', '馬鈴薯'],
  ['醤油', 'しょうゆ'],
  ['味噌', 'みそ'],
  ['ソーセージ', 'ウインナー', 'ウィンナー'],
  ['パスタ', 'スパゲティ', 'スパゲッティ'],
];

export function ingredientKey(value: string): string {
  const normalized = normalizeIngredientName(value);
  return ingredientAliases.find((aliases) => aliases.includes(normalized))?.[0] ?? normalized;
}

// App data is updated immutably. Reuse one index for all recipes in that snapshot.
const indexes = new WeakMap<FoodItem[], Map<string, FoodItem[]>>();
const usableSnapshots = new WeakMap<FoodItem[], { day: string; foods: FoodItem[] }>();

export function getUsableFoods(foods: FoodItem[]): FoodItem[] {
  const day = toDateString(new Date());
  const cached = usableSnapshots.get(foods);
  if (cached?.day === day) return cached.foods;
  const usable = foods.filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0);
  usableSnapshots.set(foods, { day, foods: usable });
  return usable;
}

function foodIndex(foods: FoodItem[]): Map<string, FoodItem[]> {
  const cached = indexes.get(foods);
  if (cached) return cached;
  const index = new Map<string, FoodItem[]>();
  for (const food of foods) {
    const key = ingredientKey(getFoodIngredientName(food));
    const items = index.get(key) ?? [];
    items.push(food);
    index.set(key, items);
  }
  index.forEach((items) => items.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)));
  indexes.set(foods, index);
  return index;
}

export function findMatchingFood(ingredient: string, foods: FoodItem[]): FoodItem | undefined {
  return foodIndex(foods).get(ingredientKey(ingredient))?.[0];
}

export function findMatchingFoods(ingredient: string, foods: FoodItem[]): FoodItem[] {
  const ingredientName = ingredientKey(ingredient);
  if (!ingredientName) return [];
  return [...(foodIndex(foods).get(ingredientName) ?? [])];
}
