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
    keywords: ['バター'],
    ingredientName: 'バター',
    category: 'dairy',
    categoryLabel: '乳製品',
    tags: ['バター', '乳製品'],
  },
  {
    keywords: ['生クリーム', 'ホイップ'],
    ingredientName: '生クリーム',
    category: 'dairy',
    categoryLabel: '乳製品',
    tags: ['生クリーム', '乳製品'],
  },
  {
    keywords: ['卵豆腐', '玉子豆腐', 'たまご豆腐'],
    ingredientName: '卵豆腐',
    category: 'other',
    categoryLabel: '大豆製品',
    tags: ['卵豆腐', '豆腐', '大豆製品'],
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
    keywords: ['鶏肉', '鶏もも', '鶏むね', '鶏胸', 'サラダチキン'],
    ingredientName: '鶏肉',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['鶏肉', '肉'],
  },
  {
    keywords: ['豚肉', '豚こま', '豚バラ', '豚ロース'],
    ingredientName: '豚肉',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['豚肉', '肉'],
  },
  {
    keywords: ['牛肉', '牛こま', '牛バラ', '牛切り落とし'],
    ingredientName: '牛肉',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['牛肉', '肉'],
  },
  {
    keywords: ['ひき肉', '挽肉', 'ミンチ'],
    ingredientName: 'ひき肉',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['ひき肉', '肉'],
  },
  {
    keywords: ['ベーコン'],
    ingredientName: 'ベーコン',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['ベーコン', '肉'],
  },
  {
    keywords: ['ハム', 'ロースハム'],
    ingredientName: 'ハム',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['ハム', '肉'],
  },
  {
    keywords: ['ウインナー', 'ウィンナー', 'ソーセージ'],
    ingredientName: 'ソーセージ',
    category: 'meat',
    categoryLabel: '肉',
    tags: ['ソーセージ', 'ウインナー', '肉'],
  },
  {
    keywords: ['ツナ', 'シーチキン'],
    ingredientName: 'ツナ',
    category: 'seafood',
    categoryLabel: '魚介',
    tags: ['ツナ', '魚介', '缶詰'],
  },
  {
    keywords: ['さば缶', '鯖缶', 'サバ缶'],
    ingredientName: 'さば',
    category: 'seafood',
    categoryLabel: '魚介',
    tags: ['さば', '魚介', '缶詰'],
  },
  {
    keywords: ['鮭', 'サーモン'],
    ingredientName: '鮭',
    category: 'seafood',
    categoryLabel: '魚介',
    tags: ['鮭', 'サーモン', '魚介'],
  },
  {
    keywords: ['ちくわ', '竹輪'],
    ingredientName: 'ちくわ',
    category: 'seafood',
    categoryLabel: '魚介',
    tags: ['ちくわ', '魚介', '練り物'],
  },
  {
    keywords: ['玉ねぎ', '玉葱', 'たまねぎ'],
    ingredientName: '玉ねぎ',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['玉ねぎ', '野菜'],
  },
  {
    keywords: ['じゃがいも', 'ジャガイモ', '馬鈴薯'],
    ingredientName: 'じゃがいも',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['じゃがいも', '野菜', 'いも'],
  },
  {
    keywords: ['にんじん', '人参', 'ニンジン'],
    ingredientName: 'にんじん',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['にんじん', '野菜'],
  },
  {
    keywords: ['キャベツ'],
    ingredientName: 'キャベツ',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['キャベツ', '野菜'],
  },
  {
    keywords: ['レタス'],
    ingredientName: 'レタス',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['レタス', '野菜'],
  },
  {
    keywords: ['トマト缶', 'カットトマト', 'ホールトマト'],
    ingredientName: 'トマト',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['トマト', '野菜', '缶詰'],
  },
  {
    keywords: ['トマト'],
    ingredientName: 'トマト',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['トマト', '野菜'],
  },
  {
    keywords: ['もやし'],
    ingredientName: 'もやし',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['もやし', '野菜'],
  },
  {
    keywords: ['しめじ', 'えのき', '舞茸', 'まいたけ', 'しいたけ', '椎茸', 'きのこ', 'キノコ'],
    ingredientName: 'きのこ',
    category: 'vegetables',
    categoryLabel: '野菜',
    tags: ['きのこ', '野菜'],
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
  {
    keywords: ['パスタ', 'スパゲッティ', 'スパゲティ'],
    ingredientName: 'パスタ',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['パスタ', '麺', '主食'],
  },
  {
    keywords: ['うどん'],
    ingredientName: 'うどん',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['うどん', '麺', '主食'],
  },
  {
    keywords: ['そば', '蕎麦'],
    ingredientName: 'そば',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['そば', '麺', '主食'],
  },
  {
    keywords: ['中華麺', '焼きそば麺'],
    ingredientName: '中華麺',
    category: 'staples',
    categoryLabel: '主食',
    tags: ['中華麺', '麺', '主食'],
  },
  {
    keywords: ['しょうゆ', '醤油'],
    ingredientName: '醤油',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['醤油', '調味料'],
  },
  {
    keywords: ['みそ', '味噌'],
    ingredientName: '味噌',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['味噌', '調味料'],
  },
  {
    keywords: ['めんつゆ', '麺つゆ'],
    ingredientName: 'めんつゆ',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['めんつゆ', '調味料'],
  },
  {
    keywords: ['ポン酢', 'ぽん酢'],
    ingredientName: 'ポン酢',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['ポン酢', '調味料'],
  },
  {
    keywords: ['みりん', '味醂'],
    ingredientName: 'みりん',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['みりん', '調味料'],
  },
  {
    keywords: ['料理酒'],
    ingredientName: '料理酒',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['料理酒', '調味料'],
  },
  {
    keywords: ['マヨネーズ', 'マヨ'],
    ingredientName: 'マヨネーズ',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['マヨネーズ', '調味料'],
  },
  {
    keywords: ['ケチャップ'],
    ingredientName: 'ケチャップ',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['ケチャップ', '調味料'],
  },
  {
    keywords: ['中濃ソース', 'ウスターソース', 'お好みソース'],
    ingredientName: 'ソース',
    category: 'seasonings',
    categoryLabel: '調味料',
    tags: ['ソース', '調味料'],
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
