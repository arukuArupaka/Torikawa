import { normalizeSharedBarcode, validateSharedProduct, SharedProduct } from '../../shared/productContract';
import { BarcodeProduct } from '../data/productCatalog';
import { foodCategoryLabels } from '../utils/foodCategory';
import { getFoodFallbackImage } from '../utils/foodImages';
import { getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';

function apiBase() {
  const value = process.env.EXPO_PUBLIC_SHARED_PRODUCTS_URL?.trim().replace(/\/$/, '');
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? value : null;
  } catch { return null; }
}

export function isSharedProductsConfigured() { return apiBase() !== null; }

async function request(path: string, options: RequestInit = {}) {
  const base = apiBase();
  if (!base) throw new Error('共有先が設定されていません。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${base}${path}`, { ...options, credentials: 'omit', signal: controller.signal });
    const body = await response.json();
    return { status: response.status, ok: response.ok, body };
  } finally { clearTimeout(timeout); }
}

export async function lookupSharedProduct(barcode: string): Promise<BarcodeProduct | null> {
  const code = normalizeSharedBarcode(barcode);
  if (!apiBase() || !code) return null;
  const response = await request(`/v1/products/${code}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('共有商品情報を取得できませんでした。');
  const data = response.body;
  const product = validateSharedProduct(data?.product);
  if (!product || product.barcode !== code) throw new Error('共有商品情報の形式が正しくありません。');
  const defaults = getFoodRegistrationDefaults({ name: product.name, ingredientName: product.ingredientName, category: product.category });
  return {
    barcode: code, name: product.name, ingredientName: product.ingredientName,
    category: foodCategoryLabels[product.category], tags: [], storage: defaults.storage,
    image: getFoodFallbackImage({ name: product.name, ingredientName: product.ingredientName, category: product.category }),
  };
}

export type ShareResult = 'created' | 'already_shared' | 'already_exists';
export async function shareProduct(product: SharedProduct): Promise<ShareResult> {
  // Construct a whitelist payload even if callers accidentally pass a FoodItem-like object.
  const safe = validateSharedProduct({ barcode: product.barcode, name: product.name, ingredientName: product.ingredientName, category: product.category });
  if (!safe) throw new Error('商品名・分類・バーコードを確認してください。');
  const response = await request('/v1/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safe) });
  if (response.status === 409) return 'already_exists';
  if (response.status === 429) throw new Error('共有回数の上限に達しました。時間をおいてお試しください。');
  if (!response.ok) throw new Error('商品情報を共有できませんでした。時間をおいてお試しください。');
  const body = response.body;
  if (body.status !== 'created' && body.status !== 'already_shared') throw new Error('共有結果を確認できませんでした。再試行できます。');
  return body.status;
}
