import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BarcodeProduct } from '../data/productCatalog';
import {
  AppDataSnapshot,
  FoodCategory,
  FoodItem,
  FoodQuantityUnit,
  NotificationSettings,
  Recipe,
  RecipeCategory,
  ShoppingItem,
  StorageLocation,
} from '../types';
import { isFoodCategory } from '../utils/foodCategory';
import { isFoodQuantityUnit } from '../utils/foodQuantity';
import { isRecipeCategory } from '../utils/recipeCategory';
import { LearnedProductCatalog } from './learnedProductService';
import { loadStoredValue, saveStoredValue, storageKeys } from './storage';

const BACKUP_FORMAT = 'refrigerator-note-backup';
const BACKUP_VERSION = 1;

export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  data: AppDataSnapshot & {
    learnedProducts: LearnedProductCatalog;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStorageLocation(value: unknown): value is StorageLocation {
  return value === 'refrigerated' || value === 'frozen' || value === 'room';
}

function isFoodItem(value: unknown): value is FoodItem {
  if (!isObject(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.image === 'string'
    && isFoodCategory(value.category as FoodCategory)
    && isStorageLocation(value.storage)
    && Number.isFinite(value.quantity)
    && (value.quantityUnit === undefined || isFoodQuantityUnit(value.quantityUnit as FoodQuantityUnit))
    && typeof value.expiryDate === 'string'
    && typeof value.purchaseDate === 'string'
    && typeof value.memo === 'string'
    && typeof value.createdAt === 'string'
    && (value.status === 'active' || value.status === 'used' || value.status === 'disposed')
    && (value.usedAt === null || typeof value.usedAt === 'string')
    && (value.disposedAt === null || typeof value.disposedAt === 'string');
}

function isShoppingItem(value: unknown): value is ShoppingItem {
  if (!isObject(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.memo === undefined || typeof value.memo === 'string')
    && typeof value.checked === 'boolean'
    && typeof value.createdAt === 'string';
}

function isRecipe(value: unknown): value is Recipe {
  if (!isObject(value) || !isObject(value.ingredientAmounts)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.image === 'string'
    && (value.category === undefined || isRecipeCategory(value.category as RecipeCategory))
    && Array.isArray(value.ingredients)
    && value.ingredients.every((ingredient) => typeof ingredient === 'string')
    && Object.values(value.ingredientAmounts).every((amount) => typeof amount === 'string')
    && Array.isArray(value.steps)
    && value.steps.every((step) => typeof step === 'string')
    && Number.isInteger(value.minutes)
    && typeof value.isFavorite === 'boolean'
    && typeof value.createdAt === 'string';
}

function isNotificationSettings(value: unknown): value is NotificationSettings {
  if (!isObject(value)) return false;
  return typeof value.enabled === 'boolean'
    && Array.isArray(value.daysBeforeList)
    && value.daysBeforeList.every((day) => Number.isInteger(day) && day >= 0 && day <= 365)
    && typeof value.time === 'string'
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time);
}

function isBarcodeProduct(value: unknown): value is BarcodeProduct {
  if (!isObject(value)) return false;
  return typeof value.barcode === 'string'
    && typeof value.name === 'string'
    && typeof value.image === 'string'
    && typeof value.category === 'string'
    && isStorageLocation(value.storage);
}

function validatePayload(value: unknown): BackupPayload {
  if (!isObject(value)
    || value.format !== BACKUP_FORMAT
    || value.version !== BACKUP_VERSION
    || typeof value.exportedAt !== 'string'
    || typeof value.appVersion !== 'string'
    || !isObject(value.data)) {
    throw new Error('対応していないバックアップ形式です。');
  }

  const data = value.data;
  if (!Array.isArray(data.foods) || !data.foods.every(isFoodItem)
    || !Array.isArray(data.recipes) || !data.recipes.every(isRecipe)
    || !Array.isArray(data.shoppingItems) || !data.shoppingItems.every(isShoppingItem)
    || !isNotificationSettings(data.notificationSettings)
    || !isObject(data.learnedProducts)
    || !Object.values(data.learnedProducts).every(isBarcodeProduct)) {
    throw new Error('バックアップの内容が壊れているか、不足しています。');
  }

  return value as BackupPayload;
}

function getImageExtension(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  return '.jpg';
}

function getImageMimeType(uri: string): string {
  const cleanUri = uri.split('?')[0].toLowerCase();
  if (cleanUri.endsWith('.png')) return 'image/png';
  if (cleanUri.endsWith('.webp')) return 'image/webp';
  if (cleanUri.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function embedImage(uri: string): Promise<string> {
  if (!uri.startsWith('file:') && !uri.startsWith('content:')) return uri;
  const file = new File(uri);
  if (!file.exists) throw new Error('保存画像を読み込めませんでした。');
  const base64 = await file.base64();
  return `data:${getImageMimeType(uri)};base64,${base64}`;
}

function restoreImage(uri: string, prefix: string): string {
  if (!uri.startsWith('data:')) return uri;
  const match = uri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('バックアップ画像の形式が正しくありません。');
  const file = new File(
    Paths.document,
    `restored-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${getImageExtension(match[1])}`,
  );
  file.write(match[2], { encoding: 'base64' });
  return file.uri;
}

export async function shareBackup(data: AppDataSnapshot): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('この端末ではファイル共有を利用できません。');
  }

  const learnedProducts = await loadStoredValue<LearnedProductCatalog>(storageKeys.learnedProducts) ?? {};
  const foods = await Promise.all(data.foods.map(async (food) => ({
    ...food,
    image: await embedImage(food.image),
  })));
  const recipes = await Promise.all(data.recipes.map(async (recipe) => ({
    ...recipe,
    image: await embedImage(recipe.image),
  })));
  const learnedEntries = await Promise.all(Object.entries(learnedProducts).map(async ([barcode, product]) => [
    barcode,
    { ...product, image: await embedImage(product.image) },
  ] as const));

  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '1.20.0',
    data: {
      ...data,
      foods,
      recipes,
      learnedProducts: Object.fromEntries(learnedEntries),
    },
  };
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `refrigerator-note-backup-${date}.json`);
  file.write(JSON.stringify(payload));
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '冷蔵庫ノートのバックアップを保存',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
}

export async function pickBackup(): Promise<BackupPayload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/plain', 'application/octet-stream'],
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  const contents = await file.text();
  return validatePayload(JSON.parse(contents) as unknown);
}

export async function restoreBackup(payload: BackupPayload): Promise<AppDataSnapshot> {
  const foods = payload.data.foods.map((food) => ({
    ...food,
    image: restoreImage(food.image, 'food'),
  }));
  const recipes = payload.data.recipes.map((recipe) => ({
    ...recipe,
    image: restoreImage(recipe.image, 'recipe'),
  }));
  const learnedProducts = Object.fromEntries(
    Object.entries(payload.data.learnedProducts).map(([barcode, product]) => [
      barcode,
      { ...product, image: restoreImage(product.image, `catalog-${barcode}`) },
    ]),
  );
  const snapshot: AppDataSnapshot = {
    foods,
    recipes,
    shoppingItems: payload.data.shoppingItems,
    notificationSettings: payload.data.notificationSettings,
  };

  await Promise.all([
    saveStoredValue(storageKeys.foods, snapshot.foods),
    saveStoredValue(storageKeys.recipes, snapshot.recipes),
    saveStoredValue(storageKeys.shopping, snapshot.shoppingItems),
    saveStoredValue(storageKeys.notifications, snapshot.notificationSettings),
    saveStoredValue(storageKeys.learnedProducts, learnedProducts),
  ]);
  return snapshot;
}
