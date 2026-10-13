import { FoodCategory, ProductSource } from '../types';
import { inferFoodCategory, isFoodCategory } from './foodCategory';

export function getFoodIcon(category: FoodCategory): string { return `food-icon:${category}`; }

export function foodIconCategory(uri: unknown): FoodCategory | null {
  if (typeof uri !== 'string' || !uri.startsWith('food-icon:')) return null;
  const category = uri.slice('food-icon:'.length);
  return isFoodCategory(category) ? category : 'other';
}

export function isYahooImage(uri: unknown): boolean {
  if (typeof uri !== 'string') return false;
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return host === 'yimg.jp' || host.endsWith('.yimg.jp')
      || host === 'yahoo.co.jp' || host.endsWith('.yahoo.co.jp');
  } catch { return false; }
}

/** Keep users' selected local photos, but never reuse Yahoo's remote images. */
export function withoutYahooImage<T extends { image: string; name: string; category?: string; productSource?: ProductSource }>(item: T): T {
  const remoteYahoo = item.productSource?.provider === 'yahoo-shopping' && /^https?:/i.test(item.image);
  if (!remoteYahoo && !isYahooImage(item.image)) return item;
  const category = isFoodCategory(item.category) ? item.category : inferFoodCategory(item.name, item.category);
  return { ...item, image: getFoodIcon(category) };
}
