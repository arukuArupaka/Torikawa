import { FoodCategory } from '../types';

export const foodCategoryOptions: { value: FoodCategory; label: string }[] = [
  { value: 'vegetables', label: '野菜・果物' },
  { value: 'meat', label: '肉' },
  { value: 'seafood', label: '魚介' },
  { value: 'dairy', label: '乳製品' },
  { value: 'eggs', label: '卵' },
  { value: 'staples', label: '主食' },
  { value: 'seasonings', label: '調味料' },
  { value: 'beverages', label: '飲料' },
  { value: 'other', label: 'その他' },
];

export const foodCategoryLabels = Object.fromEntries(
  foodCategoryOptions.map((option) => [option.value, option.label]),
) as Record<FoodCategory, string>;

export function isFoodCategory(value: unknown): value is FoodCategory {
  return foodCategoryOptions.some((option) => option.value === value);
}

export function inferFoodCategory(name: string, sourceCategory = ''): FoodCategory {
  const text = `${name} ${sourceCategory}`.toLocaleLowerCase('ja-JP');
  const includesAny = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

  if (includesAny(['卵', 'たまご', '玉子', 'egg'])) return 'eggs';
  if (includesAny(['牛乳', '乳製品', 'ヨーグルト', 'チーズ', 'バター', 'milk', 'dairy'])) return 'dairy';
  if (includesAny(['豚', '牛肉', '鶏', '肉', 'ハム', 'ソーセージ', 'meat'])) return 'meat';
  if (includesAny(['魚', '鮭', 'さけ', 'まぐろ', 'ツナ', 'えび', '海鮮', 'fish', 'seafood'])) return 'seafood';
  if (includesAny(['野菜', '果物', 'キャベツ', '玉ねぎ', '人参', 'にんじん', 'レタス', 'トマト', 'りんご', 'バナナ'])) return 'vegetables';
  if (includesAny(['米', 'ごはん', 'パン', '麺', 'パスタ', 'うどん', 'そば', 'rice', 'bread'])) return 'staples';
  if (includesAny(['醤油', 'しょうゆ', '味噌', 'みそ', '塩', '砂糖', '酢', '調味料', 'ソース'])) return 'seasonings';
  if (includesAny(['飲料', 'ジュース', 'お茶', 'コーヒー', '水', 'drink', 'beverage'])) return 'beverages';
  return 'other';
}
