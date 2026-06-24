import { File, Paths } from 'expo-file-system';
import { BarcodeProduct } from '../data/productCatalog';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { loadStoredValue, saveStoredValue, storageKeys } from './storage';

export type LearnedProductCatalog = Record<string, BarcodeProduct>;
type StoredBarcodeProduct = Omit<BarcodeProduct, 'ingredientName' | 'tags'> & {
  ingredientName?: string;
  tags?: string[];
};

function copyImageForCatalog(imageUri: string, barcode: string): string {
  if (!imageUri.startsWith('file:') && !imageUri.startsWith('content:')) return imageUri;
  if (imageUri.includes('/catalog-')) return imageUri;

  const cleanUri = imageUri.split('?')[0];
  const extension = cleanUri.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.jpg';
  const source = new File(imageUri);
  const destination = new File(
    Paths.document,
    `catalog-${barcode}-${Date.now()}${extension}`,
  );
  source.copy(destination);
  return destination.uri;
}

export async function findLearnedProduct(barcode: string): Promise<BarcodeProduct | null> {
  const catalog = await loadStoredValue<Record<string, StoredBarcodeProduct>>(storageKeys.learnedProducts);
  const product = catalog?.[barcode];
  if (!product) return null;
  const normalized = normalizeProductToIngredient(product.name);
  return {
    ...product,
    ingredientName: product.ingredientName?.trim() || normalized.ingredientName,
    tags: Array.isArray(product.tags) && product.tags.length > 0 ? product.tags : normalized.tags,
    category: product.category || normalized.categoryLabel,
  };
}

export async function saveLearnedProduct(product: BarcodeProduct): Promise<void> {
  const catalog = await loadStoredValue<LearnedProductCatalog>(storageKeys.learnedProducts) ?? {};
  const image = copyImageForCatalog(product.image, product.barcode);

  catalog[product.barcode] = { ...product, image };
  await saveStoredValue(storageKeys.learnedProducts, catalog);
}
