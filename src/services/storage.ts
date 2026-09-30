import AsyncStorage from '@react-native-async-storage/async-storage';

export const storageKeys = {
  foods: '@food-manager/foods',
  shopping: '@food-manager/shopping',
  notifications: '@food-manager/notifications',
  notificationIds: '@food-manager/notification-ids',
  learnedProducts: '@food-manager/learned-products',
  recipes: '@food-manager/recipes',
  swipeGuideSeen: '@food-manager/swipe-guide-seen',
} as const;

export const generationKey = '@food-manager/active-generation';
const generationPrefix = '@food-manager/generation/';
export const snapshotKeys = [storageKeys.foods, storageKeys.recipes, storageKeys.shopping,
  storageKeys.notifications, storageKeys.learnedProducts] as const;
const isSnapshotKey = (key: string) => (snapshotKeys as readonly string[]).includes(key);

// All managed reads, writes, restoration and image collection share one queue.
// A rejected operation must not prevent a later retry from running.
let queue: Promise<unknown> = Promise.resolve();
let restoring = false;
let epoch = 0;
let uncertainCommit = false;
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => undefined).then(operation);
  queue = result;
  return result;
}

async function readGeneration(): Promise<string | null> {
  return parseGeneration(await AsyncStorage.getItem(generationKey));
}
function parseGeneration(raw: string | null): string | null {
  if (raw === null) return null;
  const head = JSON.parse(raw);
  if (head?.version !== 1 || typeof head.id !== 'string' || !/^[a-z0-9-]+$/.test(head.id)) {
    throw new Error('保存先の情報を読み込めません。原本を保護しています。');
  }
  return head.id;
}
function physicalKey(key: string, generation: string | null): string {
  return generation && isSnapshotKey(key) ? `${generationPrefix}${generation}/${key.split('/').at(-1)}` : key;
}
async function readValue(key: string, generation: string | null): Promise<unknown> {
  const raw = await AsyncStorage.getItem(physicalKey(key, generation));
  if (raw === null && generation && isSnapshotKey(key)) {
    throw new Error('保存データの一部が見つかりません。原本を保護しています。');
  }
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (value === null && isSnapshotKey(key)) throw new Error('保存データがnullになっています。原本を保護しています。');
  return value;
}

export function loadStoredValues(keys: readonly string[]): Promise<unknown[]> {
  return serialized(async () => {
    const generation = keys.some(isSnapshotKey) ? await readGeneration() : null;
    const values = await Promise.all(keys.map((key) => readValue(key, generation)));
    // After an ambiguous commit, a full read is required before writing again.
    if (snapshotKeys.every((key) => keys.includes(key))) uncertainCommit = false;
    return values;
  });
}
export async function loadStoredValue<T>(key: string): Promise<T | null> {
  return (await loadStoredValues([key]))[0] as T | null;
}

export function saveStoredValue<T>(key: string, value: T): Promise<void> {
  const json = JSON.stringify(value);
  const writeEpoch = epoch;
  if (isSnapshotKey(key) && (restoring || uncertainCommit)) return Promise.reject(new Error('復元中のため保存を待機してください。'));
  return serialized(async () => {
    if (isSnapshotKey(key) && writeEpoch !== epoch) throw new Error('復元前の変更は保存できません。');
    const generation = isSnapshotKey(key) ? await readGeneration() : null;
    await AsyncStorage.setItem(physicalKey(key, generation), json);
  });
}

export function updateStoredValue<T>(key: string, update: (value: T | null) => T): Promise<void> {
  if (restoring || uncertainCommit) return Promise.reject(new Error('復元中は商品学習を更新できません。'));
  const writeEpoch = epoch;
  return serialized(async () => {
    if (writeEpoch !== epoch) throw new Error('復元前の変更は保存できません。');
    const generation = await readGeneration();
    const next = update(await readValue(key, generation) as T | null);
    await AsyncStorage.setItem(physicalKey(key, generation), JSON.stringify(next));
  });
}

/** Includes raw strings so malformed JSON can be exported without parsing it. */
export function readRecoveryData(): Promise<Record<string, string | null>> {
  return serialized(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('@food-manager/'));
    return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await AsyncStorage.getItem(key)])));
  });
}

export class RestoreNeedsReloadError extends Error {}

/** Prepare images under the same lock; the head is the only commit point. */
export async function commitRestoredValues(prepare: () => Promise<Record<string, unknown>>): Promise<void> {
  if (restoring) throw new Error('復元はすでに実行中です。');
  restoring = true;
  try {
    await serialized(async () => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const originalHead = await AsyncStorage.getItem(generationKey);
      let oldGeneration: string | null;
      try { oldGeneration = parseGeneration(originalHead); } catch { oldGeneration = null; }
      // Never overwrite the old generation or the legacy keys, even if corrupt.
      const originalKeys = [generationKey, ...snapshotKeys.map((key) => physicalKey(key, oldGeneration))];
      const original = Object.fromEntries(await Promise.all(originalKeys.map(async (key) => [key, await AsyncStorage.getItem(key)])));
      await AsyncStorage.setItem(`${generationPrefix}${id}/original`, JSON.stringify(original));
      const values = await prepare();
      if (!snapshotKeys.every((key) => Object.hasOwn(values, key))) throw new Error('復元データが不足しています。');
      for (const key of snapshotKeys) {
        const json = JSON.stringify(values[key]);
        const target = physicalKey(key, id);
        await AsyncStorage.setItem(target, json);
        if (await AsyncStorage.getItem(target) !== json) throw new Error('復元データの保存を確認できませんでした。');
      }
      const nextHead = JSON.stringify({ version: 1, id });
      try {
        await AsyncStorage.setItem(generationKey, nextHead);
      } catch (error) {
        // Some storage adapters can throw after writing. Do not delete staged
        // photos or write old UI state when the result cannot be determined.
        let actual: string | null;
        try { actual = await AsyncStorage.getItem(generationKey); }
        catch {
          uncertainCommit = true;
          throw new RestoreNeedsReloadError('復元結果を確認できません。再読み込みして保存状態を確認してください。');
        }
        if (actual !== nextHead) {
          if (actual !== originalHead) {
            uncertainCommit = true;
            throw new RestoreNeedsReloadError('保存先が変更されました。再読み込みしてください。');
          }
          throw error;
        }
      }
      epoch += 1;
      uncertainCommit = false;
    });
  } finally {
    restoring = false;
  }
}

/** Delete only after durable saves, including references in retained originals. */
export function collectStoredImages(candidates: Set<string>, liveImages: () => Set<string>, remove: (uri: string) => void): Promise<void> {
  if (restoring || uncertainCommit || candidates.size === 0) return Promise.resolve();
  const live = liveImages();
  if (![...candidates].some((uri) => !live.has(uri))) return Promise.resolve();
  return serialized(async () => {
    const protectedImages = new Set(liveImages());
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ('image' in value && typeof value.image === 'string') protectedImages.add(value.image);
      Object.values(value).forEach(visit);
    };
    const generation = await readGeneration();
    for (const key of snapshotKeys) visit(await readValue(key, generation));
    const archives = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(generationPrefix) && key.endsWith('/original'));
    for (const key of archives) {
      const original = JSON.parse((await AsyncStorage.getItem(key))!);
      for (const raw of Object.values(original)) if (typeof raw === 'string') visit(JSON.parse(raw));
    }
    // Re-read in-memory references after awaiting storage. Failures above skip
    // collection entirely, keeping photos when their ownership is uncertain.
    liveImages().forEach((uri) => protectedImages.add(uri));
    for (const uri of candidates) {
      if (protectedImages.has(uri)) continue;
      try { remove(uri); candidates.delete(uri); }
      catch (error) { console.warn('未使用の写真の削除を次回に延期します。', error); }
    }
  });
}
