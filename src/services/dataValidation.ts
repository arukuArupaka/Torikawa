import { FoodCategory, RecipeCategory } from '../types';
import { isFoodCategory } from '../utils/foodCategory';
import { isFoodQuantityUnit } from '../utils/foodQuantity';
import { isRecipeCategory } from '../utils/recipeCategory';
import { isValidServings } from '../utils/recipeServings';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateEmbeddedImage(uri: string): { mime: string; base64: string; size: number } {
  const match = uri.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) throw new Error('バックアップ画像の形式が正しくありません。');
  const base64 = match[2];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return { mime: match[1], base64, size: base64.length / 4 * 3 - padding };
}
const text = (value: unknown): value is string => typeof value === 'string';
const name = (value: unknown) => text(value) && value.trim().length > 0;
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
const storage = (value: unknown) => ['refrigerated', 'frozen', 'room'].includes(value as string);

export function isCalendarDate(value: unknown): boolean {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
export function isTimestamp(value: unknown): value is string {
  if (!text(value)) return false;
  if (isCalendarDate(value)) return true; // Dates used by earlier app versions.
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function food(value: unknown): boolean {
  if (!isObject(value)) return false;
  const status = value.status ?? 'active';
  const used = value.usedAt ?? null;
  const disposed = value.disposedAt ?? null;
  return name(value.id) && name(value.name)
    && optional(value.sourceShoppingItemId, name)
    && optional(value.barcode, (v) => v === null || text(v) && /^\d{8,14}$/.test(v))
    && optional(value.productSource, productSource)
    && optional(value.revision, (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
    && optional(value.consumptionHistory, consumptionHistory)
    && optional(value.status, (v) => v === 'active' || v === 'used' || v === 'disposed')
    && optional(value.productName, (v) => v === null || text(v))
    && optional(value.ingredientName, name)
    && text(value.image) && text(value.memo) && storage(value.storage)
    && optional(value.category, (v) => isFoodCategory(v as FoodCategory))
    && optional(value.tags, strings)
    && optional(value.quantity, (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 99999)
    && optional(value.quantityUnit, isFoodQuantityUnit)
    && isCalendarDate(value.expiryDate) && isCalendarDate(value.purchaseDate) && isTimestamp(value.createdAt)
    && (status === 'active' ? used === null && disposed === null
      : status === 'used' ? isCalendarDate(used) && disposed === null
        : status === 'disposed' && used === null && isCalendarDate(disposed));
}
function consumptionHistory(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (!isObject(entry) || !name(entry.operationId) || !name(entry.recipeId) || !isTimestamp(entry.recordedAt)
      || !isFoodQuantityUnit(entry.unit) || typeof entry.before !== 'number' || !Number.isFinite(entry.before)
      || entry.before <= 0 || entry.before > 99999 || typeof entry.after !== 'number' || !Number.isFinite(entry.after)
      || entry.after < 0 || typeof entry.amount !== 'number' || !Number.isFinite(entry.amount) || entry.amount <= 0
      || entry.amount > entry.before || Math.abs(entry.before - entry.amount - entry.after) > 1e-7
      || ids.has(entry.operationId as string)) return false;
    ids.add(entry.operationId as string);
    return true;
  });
}
function recipe(value: unknown): boolean {
  return isObject(value) && name(value.id) && name(value.name) && text(value.image)
    && optional(value.category, (v) => isRecipeCategory(v as RecipeCategory))
    && strings(value.ingredients) && isObject(value.ingredientAmounts)
    && Object.values(value.ingredientAmounts).every(text) && strings(value.steps)
    && typeof value.minutes === 'number' && Number.isSafeInteger(value.minutes) && value.minutes > 0
    && optional(value.servings, (v) => v === null || isValidServings(v))
    && optional(value.isFavorite, (v) => typeof v === 'boolean')
    && optional(value.createdAt, isTimestamp);
}
function shopping(value: unknown): boolean {
  return isObject(value) && name(value.id) && name(value.name) && optional(value.memo, text)
    && typeof value.checked === 'boolean' && isTimestamp(value.createdAt);
}
function collection(value: unknown, check: (item: unknown) => boolean): boolean {
  if (!Array.isArray(value) || !value.every(check)) return false;
  const ids = value.map((item) => item.id);
  return new Set(ids).size === ids.length;
}
function notifications(value: unknown): boolean {
  if (!isObject(value)) return false;
  const day = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 365;
  return optional(value.enabled, (v) => typeof v === 'boolean')
    && optional(value.time, (v) => text(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v))
    && optional(value.daysBefore, day)
    && optional(value.daysBeforeList, (v) => Array.isArray(v) && v.every(day));
}
function catalog(value: unknown): boolean {
  return isObject(value) && Object.entries(value).every(([barcode, item]) =>
    /^\d{8,14}$/.test(barcode) && isObject(item) && item.barcode === barcode
    && name(item.name) && text(item.image) && text(item.category) && storage(item.storage)
    && optional(item.ingredientName, name) && optional(item.tags, strings)
    && optional(item.productSource, productSource));
}

function productSource(value: unknown): boolean {
  if (!isObject(value) || !['open-food-facts', 'yahoo-shopping'].includes(value.provider as string)
    || !text(value.barcode) || !/^\d{8,14}$/.test(value.barcode) || !isTimestamp(value.fetchedAt)
    || !optional(value.modified, (v) => typeof v === 'boolean') || !httpsUrl(value.productUrl)) return false;
  if (value.provider === 'open-food-facts' && value.productUrl !== `https://world.openfoodfacts.org/product/${value.barcode}`) return false;
  return optional(value.image, (v) => isObject(v) && value.provider === 'open-food-facts'
    && httpsUrl(v.url) && new URL(v.url as string).hostname === 'images.openfoodfacts.org'
    && name(v.author) && (v.author as string).length <= 120 && v.license === 'CC-BY-SA-3.0');
}
function httpsUrl(value: unknown): boolean {
  if (!text(value) || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

export type StoredDataKind = 'foods' | 'recipes' | 'shoppingItems' | 'notificationSettings' | 'learnedProducts';
export function validateStoredData(kind: StoredDataKind, value: unknown): void {
  const valid = kind === 'foods' ? collection(value, food)
    : kind === 'recipes' ? collection(value, recipe)
      : kind === 'shoppingItems' ? collection(value, shopping)
        : kind === 'notificationSettings' ? notifications(value) : catalog(value);
  if (!valid) throw new Error(`${kind} の内容が正しくありません。IDの重複、日付、数量、記録の状態を確認してください。`);
  if (kind === 'foods') {
    const linked = (value as { sourceShoppingItemId?: string }[]).map((food) => food.sourceShoppingItemId).filter(Boolean);
    if (new Set(linked).size !== linked.length) throw new Error('同じ購入分に複数の食材が登録されています。');
  }
}

export function validateSnapshot(value: unknown, includeCatalog = false): void {
  if (!isObject(value)) throw new Error('保存データの形式が正しくありません。');
  const kinds: StoredDataKind[] = ['foods', 'recipes', 'shoppingItems', 'notificationSettings'];
  if (includeCatalog) kinds.push('learnedProducts');
  kinds.forEach((kind) => validateStoredData(kind, value[kind]));
}
