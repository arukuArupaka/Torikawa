import { version } from '../../package.json';
import { BarcodeProduct } from '../data/productCatalog';
import { getPublicationInformation } from '../constants/publication';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { getFoodFallbackImage } from '../utils/foodImages';

type Product = {
  product_name?: string; product_name_ja?: string; generic_name?: string; generic_name_ja?: string;
  image_front_small_url?: string; categories?: string;
  images?: Record<string, { imgid?: string | number; uploader?: string }>;
};

export class ProductLookupRateLimitError extends Error {}

export function isOffImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'images.openfoodfacts.org' && !url.username && !url.password; }
  catch { return false; }
}

export function productFromOpenFoodFacts(barcode: string, product: Product): BarcodeProduct | null {
  const name = product.product_name_ja || product.product_name || product.generic_name_ja || product.generic_name;
  if (!name?.trim()) return null;
  const normalized = normalizeProductToIngredient(name);
  const imageUrl = product.image_front_small_url;
  // The selected image points at a raw image ID, whose uploader is the attribution.
  const selectedKey = typeof imageUrl === 'string' ? imageUrl.match(/\/(front_[a-z]{2})\.\d+\.\d+\.jpg(?:\?|$)/)?.[1] : undefined;
  const id = selectedKey ? product.images?.[selectedKey]?.imgid : undefined;
  const uploader = id === undefined ? undefined : product.images?.[String(id)]?.uploader;
  const author = typeof uploader === 'string' && uploader.trim() && uploader.length <= 120 ? uploader.trim() : undefined;
  const attributedImage = isOffImageUrl(imageUrl) && author ? { url: imageUrl, author, license: 'CC-BY-SA-3.0' as const } : undefined;
  return {
    barcode, name, ingredientName: normalized.ingredientName, tags: normalized.tags,
    category: normalized.needsReview ? product.categories?.split(',')[0]?.trim() || normalized.categoryLabel : normalized.categoryLabel,
    storage: getFoodRegistrationDefaults({ ingredientName: normalized.ingredientName, category: normalized.category }).storage,
    image: attributedImage?.url ?? getFoodFallbackImage({ name, ingredientName: normalized.ingredientName, category: normalized.category }),
    productSource: { provider: 'open-food-facts', barcode, productUrl: `https://world.openfoodfacts.org/product/${barcode}`,
      fetchedAt: new Date().toISOString(), image: attributedImage },
  };
}

/** Per-process limiter; a shared IP still needs server-side coordination in production. */
export function createProductLookupGate(now = Date.now) {
  let requests: number[] = [];
  let blockedUntil = 0;
  return {
    take() {
      const current = now();
      requests = requests.filter((time) => current - time < 60_000);
      const retryAt = Math.max(blockedUntil, requests.length >= 15 ? requests[0] + 60_000 : 0);
      if (retryAt > current) throw new ProductLookupRateLimitError(`商品検索が混み合っています。${Math.ceil((retryAt - current) / 1000)}秒ほど待つか、手入力してください。`);
      requests.push(current);
    },
    block(milliseconds: number) { blockedUntil = Math.max(blockedUntil, now() + milliseconds); },
  };
}
const gate = createProductLookupGate();
const inFlight = new Map<string, Promise<BarcodeProduct | null>>();
const cache = new Map<string, { product: BarcodeProduct | null; expires: number }>();
const clone = (product: BarcodeProduct | null) => product ? JSON.parse(JSON.stringify(product)) as BarcodeProduct : null;

export async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  const cached = cache.get(barcode);
  if (cached && cached.expires > Date.now()) return clone(cached.product);
  const active = inFlight.get(barcode);
  if (active) return clone(await active);
  const lookup = requestProduct(barcode);
  inFlight.set(barcode, lookup);
  try {
    const product = await lookup;
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(barcode, { product, expires: Date.now() + 5 * 60_000 });
    return clone(product);
  } finally { inFlight.delete(barcode); }
}

async function requestProduct(barcode: string) {
  gate.take();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const fields = 'product_name,product_name_ja,generic_name,generic_name_ja,image_front_small_url,categories,images';
  const contact = getPublicationInformation().supportEmail ?? 'https://github.com/arukuArupaka/Torikawa';
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`, {
      headers: { Accept: 'application/json', 'User-Agent': `Tabedoki/${version} (${contact})` }, signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (response.status === 429) {
      const seconds = Number(response.headers?.get('Retry-After'));
      gate.block(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 24 * 60 * 60_000) : 60_000);
      throw new ProductLookupRateLimitError('商品検索の上限に達しました。時間をおいて再試行するか、手入力してください。');
    }
    if (!response.ok) throw new Error(`Open Food Facts: HTTP ${response.status}`);
    const data = await response.json() as { status?: number; product?: Product };
    return data.status === 1 && data.product ? productFromOpenFoodFacts(barcode, data.product) : null;
  } finally { clearTimeout(timeout); }
}
