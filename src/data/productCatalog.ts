import { ProductSource, StorageLocation } from '../types';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';

export type BarcodeProduct = {
  barcode: string;
  name: string;
  image: string;
  category: string;
  ingredientName: string;
  tags: string[];
  storage: StorageLocation;
  productSource?: ProductSource;
};

const sampleMilkInfo = normalizeProductToIngredient('明治おいしい牛乳');

export const sampleMilkProduct: BarcodeProduct = {
  barcode: '4901234567894',
  name: '明治おいしい牛乳',
  image: 'food-icon:dairy',
  category: sampleMilkInfo.categoryLabel,
  ingredientName: sampleMilkInfo.ingredientName,
  tags: sampleMilkInfo.tags,
  storage: 'refrigerated',
};

const productCatalog: BarcodeProduct[] = [sampleMilkProduct];

export function findProductByBarcode(barcode: string): BarcodeProduct | null {
  if (process.env.EXPO_PUBLIC_DEMO_DATA !== 'true') return null;
  return productCatalog.find((product) => product.barcode === barcode) ?? null;
}
