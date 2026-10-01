import { BarcodeProduct, findProductByBarcode } from '../data/productCatalog';
import { lookupOpenFoodFacts } from './openFoodFactsService';
import { findLearnedProduct } from './learnedProductService';
import { lookupYahooProductByBarcode } from './yahooProductLookupService';
import { lookupSharedProduct } from './sharedProductService';

export type ProductLookupSource = 'learned' | 'local' | 'shared' | 'yahoo-shopping' | 'open-food-facts' | 'none';

export type ProductLookupResult = {
  product: BarcodeProduct | null;
  source: ProductLookupSource;
};

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

  const product = await lookupOpenFoodFacts(barcode);
  return { product, source: product ? 'open-food-facts' : 'none' };
}
