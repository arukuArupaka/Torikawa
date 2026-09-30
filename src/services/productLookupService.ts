import { BarcodeProduct, findProductByBarcode } from '../data/productCatalog';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { findLearnedProduct } from './learnedProductService';
import { lookupYahooProductByBarcode } from './yahooProductLookupService';
import { lookupSharedProduct } from './sharedProductService';

export type ProductLookupSource = 'learned' | 'local' | 'shared' | 'yahoo-shopping' | 'open-food-facts' | 'none';

export type ProductLookupResult = {
  product: BarcodeProduct | null;
  source: ProductLookupSource;
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    code?: string;
    product_name?: string;
    product_name_ja?: string;
    generic_name?: string;
    generic_name_ja?: string;
    image_front_small_url?: string;
    categories?: string;
  };
};

const fallbackImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300';

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  try {
    const learnedProduct = await findLearnedProduct(barcode);
    if (learnedProduct) return { product: learnedProduct, source: 'learned' };
  } catch (error) {
    console.warn('端末の商品候補を読み込めませんでした。外部検索を続けます。', error);
  }

  const localProduct = findProductByBarcode(barcode);
  if (localProduct) return { product: localProduct, source: 'local' };

  try {
    const shared = await lookupSharedProduct(barcode);
    if (shared) return { product: shared, source: 'shared' };
  } catch {
    // A shared catalog outage must not prevent the existing lookup or manual entry.
  }

  try {
    const yahooProduct = await lookupYahooProductByBarcode(barcode);
    if (yahooProduct) return { product: yahooProduct, source: 'yahoo-shopping' };
  } catch (error) {
    console.warn('Yahoo!ショッピングの商品検索に失敗しました。Open Food Factsへ進みます。', error);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const fields = [
    'code',
    'product_name',
    'product_name_ja',
    'generic_name',
    'generic_name_ja',
    'image_front_small_url',
    'categories',
  ].join(',');

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RefrigeratorNote/1.8.0 (Expo learning project)',
        },
        signal: controller.signal,
      },
    );
    if (response.status === 404) return { product: null, source: 'none' };
    if (!response.ok) throw new Error(`Open Food Facts: HTTP ${response.status}`);

    const data = await response.json() as OpenFoodFactsResponse;
    const name = data.product?.product_name_ja
      || data.product?.product_name
      || data.product?.generic_name_ja
      || data.product?.generic_name;
    if (data.status !== 1 || !data.product || !name) {
      return { product: null, source: 'none' };
    }

    const normalized = normalizeProductToIngredient(name);
    const category = normalized.needsReview
      ? data.product.categories?.split(',')[0]?.trim() || normalized.categoryLabel
      : normalized.categoryLabel;
    return {
      product: {
        barcode,
        name,
        image: data.product.image_front_small_url || fallbackImage,
        category,
        ingredientName: normalized.ingredientName,
        tags: normalized.tags,
        storage: getFoodRegistrationDefaults({ ingredientName: normalized.ingredientName, category: normalized.category }).storage,
      },
      source: 'open-food-facts',
    };
  } finally {
    clearTimeout(timeout);
  }
}
