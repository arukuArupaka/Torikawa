import { FoodCategory } from '../types';

export const fallbackFoodImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300';

type FoodImageRule = {
  keywords: string[];
  image: string;
};

const foodImageRules: FoodImageRule[] = [
  { keywords: ['牛乳', 'ミルク'], image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300' },
  { keywords: ['ヨーグルト', 'バター', '生クリーム'], image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300' },
  { keywords: ['チーズ'], image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=300' },
  { keywords: ['豆腐', '卵豆腐', '玉子豆腐'], image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=300' },
  { keywords: ['卵', 'たまご', '玉子'], image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=300' },
  { keywords: ['キャベツ'], image: 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=300' },
  { keywords: ['トマト'], image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300' },
  { keywords: ['玉ねぎ', '玉葱', 'たまねぎ'], image: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=300' },
  { keywords: ['にんじん', '人参', 'ニンジン'], image: 'https://images.unsplash.com/photo-1447175008436-054170c2e979?w=300' },
  { keywords: ['じゃがいも', 'ジャガイモ', '馬鈴薯'], image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300' },
  { keywords: ['きのこ', 'しめじ', 'えのき', '舞茸', 'まいたけ', 'しいたけ', '椎茸'], image: 'https://images.unsplash.com/photo-1504545102780-26774c1bb073?w=300' },
  { keywords: ['鶏肉', '豚肉', '牛肉', 'ひき肉', '挽肉', '肉', 'ハム', 'ベーコン', 'ソーセージ'], image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300' },
  { keywords: ['鮭', 'サーモン', 'さば', '鯖', '魚', 'ツナ', 'えび', '海鮮'], image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300' },
  { keywords: ['パン', '食パン', 'ロールパン'], image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300' },
  { keywords: ['米', 'ごはん', 'ご飯', '白米', 'ライス'], image: 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=300' },
  { keywords: ['パスタ', 'うどん', 'そば', '蕎麦', '中華麺', '焼きそば', '麺'], image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=300' },
  { keywords: ['醤油', 'しょうゆ', '味噌', 'みそ', '塩', '砂糖', 'ソース', 'ケチャップ', 'マヨネーズ', '調味料'], image: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=300' },
  { keywords: ['ジュース', 'お茶', 'コーヒー', 'ミネラルウォーター', '炭酸水', '飲料', 'ドリンク'], image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300' },
];

const categoryFallbackImages: Record<FoodCategory, string> = {
  vegetables: fallbackFoodImage,
  meat: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300',
  seafood: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300',
  dairy: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300',
  eggs: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=300',
  staples: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300',
  seasonings: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=300',
  beverages: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300',
  other: fallbackFoodImage,
};

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
}

export function getFoodFallbackImage({
  category,
  ingredientName = '',
  name = '',
  productName = '',
}: {
  category?: FoodCategory;
  ingredientName?: string;
  name?: string;
  productName?: string | null;
}): string {
  const text = normalizeText(`${ingredientName} ${name} ${productName ?? ''}`);
  const rule = foodImageRules.find((item) =>
    item.keywords.some((keyword) => text.includes(normalizeText(keyword))),
  );

  if (rule) return rule.image;
  if (category) return categoryFallbackImages[category];
  return fallbackFoodImage;
}
