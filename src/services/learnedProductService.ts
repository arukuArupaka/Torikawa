import { File, Paths } from 'expo-file-system';
import { BarcodeProduct } from '../data/productCatalog';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { loadStoredValue, updateStoredValue, storageKeys } from './storage';
import { validateStoredData } from './dataValidation';
import { FoodCategory } from '../types';
import { foodCategoryLabels } from '../utils/foodCategory';
import { getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { getFoodFallbackImage } from '../utils/foodImages';

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
  if (catalog !== null) validateStoredData('learnedProducts', catalog);
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
  await updateStoredValue<LearnedProductCatalog>(storageKeys.learnedProducts, (stored) => {
    const catalog = stored ?? {};
    validateStoredData('learnedProducts', catalog);
    const image = copyImageForCatalog(product.image, product.barcode);
    const next = { ...catalog, [product.barcode]: { ...product, image } };
    validateStoredData('learnedProducts', next);
    return next;
  });
}

export type ProductCorrection = { barcode: string; name: string; ingredientName: string; category: FoodCategory };

/** Only correct product metadata; this inventory's storage/photo/memo are not defaults. */
export async function correctLearnedProduct(correction: ProductCorrection): Promise<void> {
  await updateStoredValue<LearnedProductCatalog>(storageKeys.learnedProducts, (stored) => {
    const catalog = stored ?? {};
    validateStoredData('learnedProducts', catalog);
    const previous = catalog[correction.barcode];
    const next = { ...catalog, [correction.barcode]: {
      barcode: correction.barcode, name: correction.name, ingredientName: correction.ingredientName,
      category: foodCategoryLabels[correction.category], tags: [correction.ingredientName],
      image: previous?.image ?? getFoodFallbackImage(correction),
      storage: previous?.storage ?? getFoodRegistrationDefaults(correction).storage,
    } };
    validateStoredData('learnedProducts', next);
    return next;
  });
}
