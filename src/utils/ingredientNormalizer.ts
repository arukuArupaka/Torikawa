import { FoodCategory, FoodItem } from '../types';
import { foodCategoryLabels, inferFoodCategory } from './foodCategory';

export type NormalizedIngredientInfo = {
  ingredientName: string;
  category: FoodCategory;
  categoryLabel: string;
  tags: string[];
};

type NormalizeRule = {
  keywords: string[];
  ingredientName: string;
  category: FoodCategory;
  categoryLabel: string;
  tags: string[];
};

const rules: NormalizeRule[] = [
  {
    keywords: ['牛乳', 'ミルク'],
    ingredientName: '牛乳',
    category: 'dairy',
    categoryLabel: '乳製品',
    tags: ['牛乳', '乳製品', '飲み物'],
  },
  {
    keywords: ['ヨーグルト'],
    ingredientName: 'ヨーグルト',
    category: 'dairy',
    categoryLabel: '乳製品',
    tags: ['ヨーグルト', '乳製品'],
  },
  {
    keywords: ['卵', 'たまご', '玉子'],
    ingredientName: '卵',
    category: 'eggs',
    categoryLabel: '卵',
    tags: ['卵', 'たまご'],
  },
  {
    keywords: ['豆腐'],
    ingredientName: '豆腐',
    category: 'other',
    categoryLabel: '大豆製品',
    tags: ['豆腐', '大豆製品'],
  },
  {
    keywords: ['納豆'],
    ingredientName: '納豆',
    category: 'other',
    categoryLabel: '大豆製品',
    tags: ['納豆', '大豆製品'],
  },
  {
    keywords: ['チーズ'],
    ingredientName: 'チーズ',
    category: 'dairy',
    categoryLabel: '乳製品',
    tags: ['チーズ', '乳製品'],
  },
  {
    keywords: ['パン', '食パン', 'ロールパン'],
    ingredientName: 'パン',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['パン', '主食'],
  },
  {
    keywords: ['ごはん', '御飯', '白米', '米'],
    ingredientName: '米',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['米', 'ごはん', '主食'],
  },
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeProductToIngredient(productName: string): NormalizedIngredientInfo {
  const normalizedName = productName.toLocaleLowerCase('ja-JP');
  const rule = rules.find((item) =>
    item.keywords.some((keyword) => normalizedName.includes(keyword.toLocaleLowerCase('ja-JP'))),
  );
  if (rule) {
    return {
      ingredientName: rule.ingredientName,
      category: rule.category,
      categoryLabel: rule.categoryLabel,
      tags: unique(rule.tags),
    };
  }

  const fallbackName = productName.trim();
  const category = inferFoodCategory(fallbackName);
  return {
    ingredientName: fallbackName,
    category,
    categoryLabel: foodCategoryLabels[category],
    tags: unique([fallbackName]),
  };
}

export function getFoodDisplayName(food: Pick<FoodItem, 'name' | 'productName'>): string {
  return food.productName?.trim() || food.name;
}

export function getFoodIngredientName(food: Pick<FoodItem, 'name' | 'ingredientName'>): string {
  return food.ingredientName?.trim() || food.name;
}

export function getFoodSearchTerms(food: Pick<FoodItem, 'name' | 'productName' | 'ingredientName' | 'tags'>): string[] {
  return unique([
    food.ingredientName ?? '',
    ...(food.tags ?? []),
    food.name,
    food.productName ?? '',
  ]);
}
