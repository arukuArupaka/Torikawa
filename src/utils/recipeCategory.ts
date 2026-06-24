import { RecipeCategory } from '../types';

export const recipeCategoryOptions: { value: RecipeCategory; label: string }[] = [
  { value: 'main', label: '主菜' },
  { value: 'side', label: '副菜' },
  { value: 'soup', label: '汁物' },
  { value: 'breakfast', label: '朝食' },
  { value: 'lunchbox', label: 'お弁当' },
  { value: 'mealPrep', label: '作り置き' },
  { value: 'quick', label: '時短' },
  { value: 'healthy', label: 'ヘルシー' },
  { value: 'other', label: 'その他' },
];

export const recipeCategoryLabels = Object.fromEntries(
  recipeCategoryOptions.map((option) => [option.value, option.label]),
) as Record<RecipeCategory, string>;

export function isRecipeCategory(value: unknown): value is RecipeCategory {
  return recipeCategoryOptions.some((option) => option.value === value);
}

export function inferRecipeCategory(
  name: string,
  ingredients: string[] = [],
  minutes = 15,
): RecipeCategory {
  const text = `${name} ${ingredients.join(' ')}`.toLocaleLowerCase('ja-JP');
  const includesAny = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

  if (includesAny(['味噌汁', 'みそ汁', 'スープ', '汁', 'ポタージュ'])) return 'soup';
  if (includesAny(['弁当', 'おにぎり', '作り置き', '常備菜'])) return 'lunchbox';
  if (includesAny(['朝食', 'トースト', 'オムレツ', 'ヨーグルト'])) return 'breakfast';
  if (includesAny(['サラダ', '和え', '副菜', '小鉢'])) return 'side';
  if (includesAny(['ヘルシー', '蒸し', '豆腐', '野菜たっぷり'])) return 'healthy';
  if (includesAny(['作り置き', '保存', '常備'])) return 'mealPrep';
  if (minutes <= 10 || includesAny(['時短', '簡単', 'レンジ', 'すぐ'])) return 'quick';
  if (includesAny(['炒め', '焼き', '煮', '丼', 'カレー', 'パスタ'])) return 'main';
  return 'other';
}
