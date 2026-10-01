import * as DocumentPicker from 'expo-document-picker';
import { discardRestoredImage, embedImage, restoreImage } from './backupImages';
import { AppDataSnapshot } from '../types';
import type { LearnedProductCatalog } from './learnedProductService';
import { commitRestoredValues, loadStoredValue, readRecoveryData, storageKeys, getStorageEpoch, assertStorageEpoch } from './storage';
import { isObject, isTimestamp, validateSnapshot, validateEmbeddedImage } from './dataValidation';
import { checkBackupSize, checkImageSize, MAX_TOTAL_IMAGE_BYTES, textBytes } from './backupLimits';
import { readBackupText, shareJsonFile } from './backupFileAccess';

const BACKUP_FORMAT = 'refrigerator-note-backup';
const BACKUP_VERSION = 2;
const IMAGE_REF = 'tabedoki-image:';
const ASSET_REF = 'tabedoki-asset:';
declare const require: (path: string) => { sampleRecipeImages: Record<string, string> };
const bundledImages = () => require('../data/sampleData').sampleRecipeImages;

export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: 1 | 2;
  images?: Record<string, string>;
  exportedAt: string;
  appVersion: string;
  data: AppDataSnapshot & {
    learnedProducts: LearnedProductCatalog;
  };
};

export function validatePayload(value: unknown): BackupPayload {
  if (!isObject(value)
    || value.format !== BACKUP_FORMAT
    || (value.version !== 1 && value.version !== BACKUP_VERSION)
    || !isTimestamp(value.exportedAt)
    || typeof value.appVersion !== 'string'
    || !isObject(value.data)) {
    throw new Error('対応していないバックアップ形式です。');
  }

  try {
    checkBackupSize(textBytes(JSON.stringify(value)));
    validateSnapshot(value.data, true);
    const settings = value.data.notificationSettings;
    if (!isObject(settings) || typeof settings.enabled !== 'boolean' || typeof settings.time !== 'string'
      || !Array.isArray(settings.daysBeforeList)) throw new Error('通知設定が不足しています。');
    validateImages(value as BackupPayload);
  } catch (error) {
    throw new Error('バックアップの内容が壊れているか、不足しています。' + (error instanceof Error ? error.message : ''));
  }

  return value as BackupPayload;
}

function imageUris(payload: BackupPayload): string[] {
  return [...payload.data.foods, ...payload.data.recipes, ...Object.values(payload.data.learnedProducts)].map((item) => item.image);
}
function validateImages(payload: BackupPayload): void {
  if (payload.version === 2 && !isObject(payload.images)) throw new Error('画像一覧がありません。');
  const unique = new Set<string>();
  let total = 0;
  const embedded = (uri: string) => {
    if (unique.has(uri)) return;
    unique.add(uri);
    const { size } = validateEmbeddedImage(uri);
    checkImageSize(size); total += size;
    if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('写真の合計容量は10MBまでです。');
  };
  for (const uri of Object.values(payload.images ?? {})) {
    if (typeof uri !== 'string') throw new Error('画像の内容が正しくありません。');
    embedded(uri);
  }
  for (const uri of imageUris(payload)) {
    if (uri.startsWith('data:')) embedded(uri);
    if (uri.startsWith(IMAGE_REF) && (!payload.images || !Object.hasOwn(payload.images, uri.slice(IMAGE_REF.length)))) throw new Error('参照する写真がありません。');
    if (uri.startsWith(ASSET_REF) && !/^recipe-[1-8]$/.test(uri.slice(ASSET_REF.length))) throw new Error('対応していない組み込み画像です。');
  }
}
export type PreparedBackup = { contents: string; bytes: number; embeddedCount: number; externalCount: number; storageEpoch: number };
export async function prepareBackup(data: AppDataSnapshot): Promise<PreparedBackup> {
  const storageEpoch = getStorageEpoch();
  assertStorageEpoch(storageEpoch);
  const learnedProducts = await loadStoredValue<LearnedProductCatalog>(storageKeys.learnedProducts) ?? {};
  validateSnapshot({ ...data, learnedProducts }, true);
  const images: Record<string, string> = {};
  const cache = new Map<string, string>();
  const byContent = new Map<string, string>();
  const assets = Object.entries(bundledImages());
  let total = 0;
  let externalCount = 0;
  const image = async (uri: string): Promise<string> => {
    if (cache.has(uri)) return cache.get(uri)!;
    const asset = assets.find(([, source]) => source === uri);
    if (asset) return ASSET_REF + asset[0];
    const embedded = await embedImage(uri);
    if (!embedded.startsWith('data:')) {
      if (/^https?:/.test(embedded)) externalCount++;
      cache.set(uri, embedded); return embedded;
    }
    const size = validateEmbeddedImage(embedded).size;
    checkImageSize(size);
    let key = byContent.get(embedded);
    if (!key) {
      total += size;
      if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('写真の合計容量は10MBまでです。小さい写真を選び直してください。');
      key = `image-${byContent.size + 1}`;
      images[key] = embedded; byContent.set(embedded, key);
    }
    cache.set(uri, IMAGE_REF + key); return IMAGE_REF + key;
  };
  // Bound peak memory: one image read at a time, with shared image references.
  const foods = [];
  for (const food of data.foods) foods.push({ ...food, image: await image(food.image) });
  const recipes = [];
  for (const recipe of data.recipes) recipes.push({ ...recipe, image: await image(recipe.image) });
  const learned: LearnedProductCatalog = {};
  for (const [barcode, product] of Object.entries(learnedProducts)) learned[barcode] = { ...product, image: await image(product.image) };

  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '1.20.0',
    images,
    data: {
      ...data,
      foods,
      recipes,
      learnedProducts: learned,
    },
  };
  validatePayload(payload);
  const contents = JSON.stringify(payload);
  const bytes = textBytes(contents);
  checkBackupSize(bytes);
  assertStorageEpoch(storageEpoch);
  return { contents, bytes, embeddedCount: Object.keys(images).length, externalCount, storageEpoch };
}
export async function sharePreparedBackup(backup: PreparedBackup): Promise<void> {
  assertStorageEpoch(backup.storageEpoch);
  await shareJsonFile(backup.contents, `tabedoki-backup-${new Date().toISOString().slice(0, 10)}.json`, 'たべどき！！のバックアップを保存');
}
export async function shareBackup(data: AppDataSnapshot): Promise<void> {
  await sharePreparedBackup(await prepareBackup(data));
}

export async function pickBackup(): Promise<BackupPayload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/plain', 'application/octet-stream'],
  });
  if (result.canceled) return null;
  checkBackupSize(result.assets[0].size ?? 0);
  const contents = await readBackupText(result.assets[0].uri);
  checkBackupSize(textBytes(contents));
  return validatePayload(JSON.parse(contents) as unknown);
}

export async function restoreBackup(
  payload: BackupPayload,
  normalize: (data: AppDataSnapshot) => AppDataSnapshot = (data) => data,
): Promise<AppDataSnapshot> {
  // Validate here too: callers must not bypass the picker validation.
  const validated = validatePayload(payload);
  const source = normalize(validated.data);
  validateSnapshot(source);
  let snapshot!: AppDataSnapshot;
  await commitRestoredValues(async () => {
    const created: string[] = [];
    const restoredImages = new Map<string, string>();
    const image = (uri: string, prefix: string) => {
      if (uri.startsWith(ASSET_REF)) return bundledImages()[uri.slice(ASSET_REF.length)];
      const sourceUri = uri.startsWith(IMAGE_REF) ? validated.images![uri.slice(IMAGE_REF.length)] : uri;
      if (restoredImages.has(sourceUri)) return restoredImages.get(sourceUri)!;
      const restored = restoreImage(sourceUri, prefix, created);
      restoredImages.set(sourceUri, restored);
      return restored;
    };
    try {
      const foods = source.foods.map((food) => ({ ...food, image: image(food.image, 'food') }));
      const recipes = source.recipes.map((recipe) => ({ ...recipe, image: image(recipe.image, 'recipe') }));
      const learnedProducts = Object.fromEntries(Object.entries(validated.data.learnedProducts)
        .map(([barcode, product]) => [barcode, { ...product, image: image(product.image, 'catalog') }]));
      snapshot = { ...source, foods, recipes };
      return {
        [storageKeys.foods]: foods, [storageKeys.recipes]: recipes,
        [storageKeys.shopping]: snapshot.shoppingItems,
        [storageKeys.notifications]: snapshot.notificationSettings,
        [storageKeys.learnedProducts]: learnedProducts,
      };
    } catch (error) {
      // Only preparation failures can safely discard these newly created files.
      // Storage/commit failures retain staging files for crash-safe recovery.
      for (const uri of created) {
        try { discardRestoredImage(uri); }
        catch (cleanupError) { console.warn('復元途中の写真を削除できませんでした。', cleanupError); }
      }
      throw error;
    }
  });
  return snapshot;
}

export async function shareRecoveryData(): Promise<void> {
  const storageEpoch = getStorageEpoch();
  const raw = await readRecoveryData();
  assertStorageEpoch(storageEpoch);
  await shareJsonFile(JSON.stringify({ format: 'tabedoki-recovery-original', exportedAt: new Date().toISOString(), raw }),
    `tabedoki-recovery-${Date.now()}.json`, '読み込めない保存データの原本を退避');
}
