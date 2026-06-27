import { FoodCategory, FoodQuantityUnit, StorageLocation } from '../types';
import { addDays, parseDate, toDateString } from './date';

type ExpiryDaysByStorage = Record<StorageLocation, number>;

type RegistrationDefaultRule = {
  keywords: string[];
  quantity: number;
  quantityUnit: FoodQuantityUnit;
  storage: StorageLocation;
  expiryDays: Partial<ExpiryDaysByStorage>;
};

export type FoodRegistrationDefaults = {
  quantity: number;
  quantityUnit: FoodQuantityUnit;
  storage: StorageLocation;
  expiryDays: number;
};

const categoryDefaults: Record<FoodCategory, Omit<FoodRegistrationDefaults, 'expiryDays'> & { expiryDays: ExpiryDaysByStorage }> = {
  vegetables: { quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 5 } },
  meat: { quantity: 300, quantityUnit: 'g', storage: 'refrigerated', expiryDays: { refrigerated: 3, frozen: 30, room: 1 } },
  seafood: { quantity: 200, quantityUnit: 'g', storage: 'refrigerated', expiryDays: { refrigerated: 2, frozen: 30, room: 1 } },
  dairy: { quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 1 } },
  eggs: { quantity: 10, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 14, frozen: 30, room: 7 } },
  staples: { quantity: 1, quantityUnit: 'pack', storage: 'room', expiryDays: { refrigerated: 7, frozen: 30, room: 30 } },
  seasonings: { quantity: 1, quantityUnit: 'bottle', storage: 'room', expiryDays: { refrigerated: 180, frozen: 180, room: 180 } },
  beverages: { quantity: 500, quantityUnit: 'ml', storage: 'room', expiryDays: { refrigerated: 14, frozen: 30, room: 30 } },
  other: { quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 7 } },
};

const registrationRules: RegistrationDefaultRule[] = [
  { keywords: ['牛乳', 'ミルク'], quantity: 1000, quantityUnit: 'ml', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 1 } },
  { keywords: ['ヨーグルト'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 1 } },
  { keywords: ['チーズ'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 14, frozen: 30, room: 1 } },
  { keywords: ['バター'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 30, frozen: 60, room: 1 } },
  { keywords: ['卵', 'たまご', '玉子'], quantity: 10, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 14, frozen: 30, room: 7 } },
  { keywords: ['豆腐', '卵豆腐', '玉子豆腐'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 3, frozen: 14, room: 1 } },
  { keywords: ['納豆'], quantity: 3, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 1 } },
  { keywords: ['鶏肉', '豚肉', '牛肉', 'ひき肉', '挽肉', '肉'], quantity: 300, quantityUnit: 'g', storage: 'refrigerated', expiryDays: { refrigerated: 3, frozen: 30, room: 1 } },
  { keywords: ['ハム', 'ベーコン', 'ソーセージ', 'ウインナー', 'ウィンナー'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 1 } },
  { keywords: ['鮭', 'サーモン', 'さば', '鯖', '魚', 'ツナ', 'えび', '海鮮'], quantity: 200, quantityUnit: 'g', storage: 'refrigerated', expiryDays: { refrigerated: 2, frozen: 30, room: 1 } },
  { keywords: ['キャベツ'], quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 5 } },
  { keywords: ['レタス', '小松菜', 'ほうれん草'], quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 4, frozen: 21, room: 2 } },
  { keywords: ['もやし'], quantity: 1, quantityUnit: 'bag', storage: 'refrigerated', expiryDays: { refrigerated: 2, frozen: 14, room: 1 } },
  { keywords: ['トマト'], quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 7, frozen: 30, room: 5 } },
  { keywords: ['玉ねぎ', '玉葱', 'たまねぎ', 'じゃがいも', 'ジャガイモ', '馬鈴薯'], quantity: 1, quantityUnit: 'piece', storage: 'room', expiryDays: { refrigerated: 14, frozen: 30, room: 30 } },
  { keywords: ['にんじん', '人参', 'ニンジン'], quantity: 1, quantityUnit: 'piece', storage: 'refrigerated', expiryDays: { refrigerated: 14, frozen: 30, room: 7 } },
  { keywords: ['きのこ', 'しめじ', 'えのき', '舞茸', 'まいたけ', 'しいたけ', '椎茸'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 4, frozen: 30, room: 1 } },
  { keywords: ['パン', '食パン', 'ロールパン'], quantity: 1, quantityUnit: 'pack', storage: 'room', expiryDays: { refrigerated: 5, frozen: 30, room: 4 } },
  { keywords: ['ごはん', 'ご飯', '白米'], quantity: 300, quantityUnit: 'g', storage: 'refrigerated', expiryDays: { refrigerated: 2, frozen: 30, room: 1 } },
  { keywords: ['米'], quantity: 1, quantityUnit: 'bag', storage: 'room', expiryDays: { refrigerated: 180, frozen: 180, room: 180 } },
  { keywords: ['パスタ', 'スパゲッティ', 'スパゲティ'], quantity: 1, quantityUnit: 'bag', storage: 'room', expiryDays: { refrigerated: 180, frozen: 180, room: 180 } },
  { keywords: ['うどん', 'そば', '蕎麦', '中華麺', '焼きそば', '麺'], quantity: 1, quantityUnit: 'pack', storage: 'refrigerated', expiryDays: { refrigerated: 5, frozen: 30, room: 1 } },
  { keywords: ['醤油', 'しょうゆ', '味噌', 'みそ', 'ソース', 'ケチャップ', 'マヨネーズ', 'めんつゆ', 'ポン酢', 'みりん', '料理酒'], quantity: 1, quantityUnit: 'bottle', storage: 'room', expiryDays: { refrigerated: 180, frozen: 180, room: 180 } },
  { keywords: ['ジュース', 'お茶', 'コーヒー', 'ミネラルウォーター', '炭酸水', '飲料', 'ドリンク'], quantity: 500, quantityUnit: 'ml', storage: 'room', expiryDays: { refrigerated: 14, frozen: 30, room: 30 } },
];

function normalizeText(value: string): string {
  return value.toLocaleLowerCase('ja-JP').replace(/\s+/g, '');
}

function getExpiryDays(
  expiryDays: Partial<ExpiryDaysByStorage>,
  storage: StorageLocation,
  category: FoodCategory,
): number {
  return expiryDays[storage] ?? categoryDefaults[category].expiryDays[storage];
}

export function getDefaultExpiryDate(purchaseDate: string, expiryDays: number): string {
  return toDateString(addDays(parseDate(purchaseDate), expiryDays));
}

export function getFoodRegistrationDefaults({
  category = 'other',
  ingredientName = '',
  name = '',
  productName = '',
  storage,
}: {
  category?: FoodCategory;
  ingredientName?: string;
  name?: string;
  productName?: string | null;
  storage?: StorageLocation;
}): FoodRegistrationDefaults {
  const text = normalizeText(`${ingredientName} ${name} ${productName ?? ''}`);
  const rule = registrationRules.find((item) =>
    item.keywords.some((keyword) => text.includes(normalizeText(keyword))),
  );
  const categoryDefault = categoryDefaults[category];
  const nextStorage = storage ?? rule?.storage ?? categoryDefault.storage;

  return {
    quantity: rule?.quantity ?? categoryDefault.quantity,
    quantityUnit: rule?.quantityUnit ?? categoryDefault.quantityUnit,
    storage: nextStorage,
    expiryDays: getExpiryDays(rule?.expiryDays ?? categoryDefault.expiryDays, nextStorage, category),
  };
}
