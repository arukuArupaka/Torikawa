import { BarcodeProduct } from '../data/productCatalog';
import { StorageLocation } from '../types';
import { inferFoodCategory } from '../utils/foodCategory';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';

type YahooShoppingHit = {
  name?: string;
  description?: string;
  janCode?: string;
  image?: {
    small?: string;
    medium?: string;
  };
  exImage?: {
    url?: string;
  };
  genreCategory?: {
    name?: string;
  };
  brand?: {
    name?: string;
  };
};

type YahooShoppingResponse = {
  hits?: YahooShoppingHit[];
};

const yahooShoppingEndpoint = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';
const fallbackImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300';

function getYahooShoppingAppId() {
  return process.env.EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID?.trim() ?? '';
}

function inferStorage(name: string, category: string): StorageLocation {
  const foodCategory = inferFoodCategory(name, category);
  if (
    foodCategory === 'dairy'
    || foodCategory === 'eggs'
    || foodCategory === 'meat'
    || foodCategory === 'seafood'
  ) {
    return 'refrigerated';
  }
  return 'room';
}

function toQueryString(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function pickBestHit(barcode: string, hits: YahooShoppingHit[]) {
  return hits.find((hit) => hit.janCode === barcode && hit.name)
    ?? hits.find((hit) => hit.name)
    ?? null;
}

export function isYahooProductLookupConfigured() {
  return getYahooShoppingAppId().length > 0;
}

export async function lookupYahooProductByBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const appId = getYahooShoppingAppId();
  if (!appId) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const query = toQueryString({
    appid: appId,
    jan_code: barcode,
    results: '10',
    image_size: '300',
  });

  try {
    const response = await fetch(`${yahooShoppingEndpoint}?${query}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Yahoo Shopping: HTTP ${response.status}`);

    const data = await response.json() as YahooShoppingResponse;
    const hit = pickBestHit(barcode, data.hits ?? []);
    if (!hit?.name) return null;

    const normalized = normalizeProductToIngredient(hit.name);
    const category = normalized.category === 'other'
      ? hit.genreCategory?.name || hit.brand?.name || normalized.categoryLabel
      : normalized.categoryLabel;
    const image = hit.exImage?.url
      || hit.image?.medium
      || hit.image?.small
      || fallbackImage;

    return {
      barcode,
      name: hit.name,
      image,
      category,
      ingredientName: normalized.ingredientName,
      tags: normalized.tags,
      storage: inferStorage(hit.name, category),
    };
  } finally {
    clearTimeout(timeout);
  }
}
