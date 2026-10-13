import { BarcodeProduct } from '../data/productCatalog';
import { publicHttpsUrl } from '../constants/publication';
import { getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { getFoodIcon } from '../utils/yahooImagePolicy';
import { normalizeSharedBarcode } from '../../shared/productContract';

export function getYahooLookupUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_YAHOO_LOOKUP_URL?.trim();
  if (value === '/api/yahoo-product') return value;
  return publicHttpsUrl(value);
}
export function isYahooProductLookupConfigured() { return Boolean(getYahooLookupUrl()); }

export async function lookupYahooProductByBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const endpoint = getYahooLookupUrl();
  const code = normalizeSharedBarcode(barcode);
  if (!endpoint || !code) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await fetch(`${endpoint}${separator}barcode=${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal,
    });
    if (response.status === 404 || response.status === 503) return null;
    if (!response.ok) throw new Error(`Yahoo product lookup: HTTP ${response.status}`);
    const data = await response.json();
    const productUrl = publicHttpsUrl(data?.productUrl);
    if (data?.barcode !== code || typeof data.name !== 'string' || !data.name.trim()
      || data.name.length > 300 || !productUrl) return null;
    const normalized = normalizeProductToIngredient(data.name);
    return {
      barcode: code, name: data.name.trim(), image: getFoodIcon(normalized.category),
      category: normalized.categoryLabel, ingredientName: normalized.ingredientName, tags: normalized.tags,
      storage: getFoodRegistrationDefaults({ ingredientName: normalized.ingredientName, category: normalized.category }).storage,
      productSource: { provider: 'yahoo-shopping', barcode: code, productUrl, fetchedAt: new Date().toISOString() },
    };
  } finally { clearTimeout(timeout); }
}
