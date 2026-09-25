import { FoodItem } from '../types';
import { getFoodIngredientName } from './ingredientNormalizer';

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

function ingredientKey(value: string): string {
  const normalized = normalizeIngredientName(value);
  return ingredientAliases.find((aliases) => aliases.includes(normalized))?.[0] ?? normalized;
}

export function findMatchingFood(ingredient: string, foods: FoodItem[]): FoodItem | undefined {
  return findMatchingFoods(ingredient, foods)[0];
}

export function findMatchingFoods(ingredient: string, foods: FoodItem[]): FoodItem[] {
  const ingredientName = ingredientKey(ingredient);
  if (!ingredientName) return [];
  return foods
    .filter((food) => ingredientKey(getFoodIngredientName(food)) === ingredientName)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}
