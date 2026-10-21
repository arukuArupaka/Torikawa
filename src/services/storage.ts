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
export const RETAINED_GENERATIONS = 2;
export const snapshotKeys = [storageKeys.foods, storageKeys.recipes, storageKeys.shopping,
  storageKeys.notifications, storageKeys.learnedProducts] as const;
const isSnapshotKey = (key: string) => (snapshotKeys as readonly string[]).includes(key);

// All managed reads, writes, restoration and image collection share one queue.
// A rejected operation must not prevent a later retry from running.
let queue: Promise<unknown> = Promise.resolve();
let restoring = false;
let epoch = 0;
let uncertainCommit = false;
export const erasureKey = '@food-manager/erasure-pending';
let erasing = false;
let erasureRunning = false;
let knownGeneration: string | null | undefined;
export class DataErasurePendingError extends Error {}
export function isDataErasing() { return erasing; }
export function getStorageEpoch() { return epoch; }
export function assertStorageEpoch(expected: number) {
  if (expected !== epoch || erasing) throw new Error('保存データが変更されています。現在の画面から操作し直してください。');
}
async function assertNoErasure() {
  if (erasing || await AsyncStorage.getItem(erasureKey) !== null) {
    erasing = true;
    throw new DataErasurePendingError('保存データの削除が完了していません。削除を再試行してください。');
  }
}
async function writableGeneration() {
  await assertNoErasure();
  const generation = await readGeneration();
  if (knownGeneration !== undefined && generation !== knownGeneration) {
    uncertainCommit = true;
    throw new RestoreNeedsReloadError('別の画面で保存データが変わりました。再読み込みしてください。');
  }
  knownGeneration = generation;
  return generation;
}
export function hasPendingDataErasure(): Promise<boolean> {
  return serialized(async () => {
    const pending = await AsyncStorage.getItem(erasureKey) !== null;
    if (!erasureRunning) erasing = pending;
    return pending;
  });
}
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
    await assertNoErasure();
    const generation = keys.some(isSnapshotKey) ? await readGeneration() : null;
    const complete = snapshotKeys.every((key) => keys.includes(key));
    if (!complete && keys.some(isSnapshotKey) && knownGeneration !== undefined && generation !== knownGeneration) {
      throw new RestoreNeedsReloadError('別の画面で保存データが変わりました。再読み込みしてください。');
    }
    const values = await Promise.all(keys.map((key) => readValue(key, generation)));
    // After an ambiguous commit, a full read is required before writing again.
    if (snapshotKeys.every((key) => keys.includes(key))) { uncertainCommit = false; knownGeneration = generation; }
    return values;
  });
}
export async function loadStoredValue<T>(key: string): Promise<T | null> {
  return (await loadStoredValues([key]))[0] as T | null;
}

export function saveStoredValue<T>(key: string, value: T): Promise<void> {
  const json = JSON.stringify(value);
  const writeEpoch = epoch;
  if (erasing) return Promise.reject(new DataErasurePendingError('削除中は保存できません。'));
  if (isSnapshotKey(key) && (restoring || uncertainCommit)) return Promise.reject(new Error('復元中のため保存を待機してください。'));
  return serialized(async () => {
    if (writeEpoch !== epoch) throw new Error('変更前の操作は保存できません。');
    const generation = await writableGeneration();
    await AsyncStorage.setItem(physicalKey(key, generation), json);
  });
}

export function updateStoredValue<T>(key: string, update: (value: T | null) => T): Promise<void> {
  if (erasing) return Promise.reject(new DataErasurePendingError('削除中は商品学習を更新できません。'));
  if (restoring || uncertainCommit) return Promise.reject(new Error('復元中は商品学習を更新できません。'));
  const writeEpoch = epoch;
  return serialized(async () => {
    if (writeEpoch !== epoch) throw new Error('復元前の変更は保存できません。');
    const generation = await writableGeneration();
    const next = update(await readValue(key, generation) as T | null);
    await AsyncStorage.setItem(physicalKey(key, generation), JSON.stringify(next));
  });
}

/** Includes raw strings so malformed JSON can be exported without parsing it. */
export function readRecoveryData(): Promise<Record<string, string | null>> {
  return serialized(async () => {
    await assertNoErasure();
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('@food-manager/'));
    return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await AsyncStorage.getItem(key)])));
  });
}

export class RestoreNeedsReloadError extends Error {}

/** Keep current data and only the retained originals; never interpret unknown IDs as old data. */
export function pruneGenerations(): Promise<void> {
  if (restoring || erasing || uncertainCommit) return Promise.resolve();
  return serialized(async () => {
    try {
      if (restoring || erasing || uncertainCommit) return;
      await assertNoErasure();
      const current = await readGeneration();
      if (!current || (knownGeneration !== undefined && knownGeneration !== current)) return;
      const generations = new Map<string, number>();
      const entries = (await AsyncStorage.getAllKeys()).flatMap((key) => {
        if (!key.startsWith(generationPrefix)) return [];
        const match = /^([0-9a-z]+-[0-9a-z]+)\/(.+)$/.exec(key.slice(generationPrefix.length));
        if (!match) return [];
        const [id, suffix] = match.slice(1);
        const prefix = id.split('-')[0];
        const timestamp = Number.parseInt(prefix, 36);
        if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp.toString(36) !== prefix) return [];
        generations.set(id, timestamp);
        return [{ key, id, suffix }];
      });
      const retained = new Set([current, ...[...generations]
        .filter(([id]) => id !== current)
        .sort(([a, timeA], [b, timeB]) => timeB - timeA || b.localeCompare(a))
        .slice(0, RETAINED_GENERATIONS - 1).map(([id]) => id)]);
      const obsolete = entries.filter(({ id, suffix }) => id !== current && !(retained.has(id) && suffix === 'original'))
        // Remove obsolete data before archives, so an interrupted cleanup keeps photo references protected.
        .sort((a, b) => Number(a.suffix === 'original') - Number(b.suffix === 'original'));
      for (const { key } of obsolete) {
        if (restoring || erasing || uncertainCommit) return;
        if (await readGeneration() !== current) return;
        if (restoring || erasing || uncertainCommit) return;
        await AsyncStorage.removeItem(key);
      }
      // Photos referenced only by a removed original may now be removed by collectStoredImages.
      // References in current data and retained/unknown originals remain protected there.
    } catch (error) {
      console.warn('古い復元データの整理を次回に延期します。', error);
    }
  });
}

/** Prepare images under the same lock; the head is the only commit point. */
export async function commitRestoredValues(prepare: () => Promise<Record<string, unknown>>): Promise<void> {
  if (erasing) throw new DataErasurePendingError('削除中は復元できません。');
  if (restoring) throw new Error('復元はすでに実行中です。');
  restoring = true;
  try {
    await serialized(async () => {
      await assertNoErasure();
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
      knownGeneration = id;
    });
  } finally {
    restoring = false;
  }
  // Enqueue after leaving the restore lock; nesting serialized operations would deadlock.
  await pruneGenerations();
}

/** Delete only after durable saves, including references in retained originals. */
export function collectStoredImages(candidates: Set<string>, liveImages: () => Set<string>, remove: (uri: string) => void): Promise<void> {
  if (restoring || erasing || uncertainCommit || candidates.size === 0) return Promise.resolve();
  const live = liveImages();
  if (![...candidates].some((uri) => !live.has(uri))) return Promise.resolve();
  return serialized(async () => {
    await assertNoErasure();
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

/** A durable intent prevents hydration or old writes after partial, irreversible deletion. */
export async function eraseStoredValues(values: Record<string, unknown>, cleanup: (raw: Record<string, string | null>) => Promise<void>): Promise<void> {
  if (restoring || erasureRunning) throw new Error('データの処理はすでに実行中です。');
  if (!snapshotKeys.every((key) => Object.hasOwn(values, key))) throw new Error('削除後の初期データが不足しています。');
  erasureRunning = true; erasing = true; epoch += 1;
  try {
    const raw = await serialized(async () => {
      const intent = JSON.stringify({ version: 1 });
      try { await AsyncStorage.setItem(erasureKey, intent); }
      catch (error) { if (await AsyncStorage.getItem(erasureKey) !== intent) throw error; }
      if (await AsyncStorage.getItem(erasureKey) !== intent) throw new Error('削除開始の記録を保存できませんでした。');
      const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('@food-manager/'));
      return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await AsyncStorage.getItem(key)])));
    });
    // Never hold the storage queue while draining notification operations that use it.
    await cleanup(raw);
    await serialized(async () => {
      const ownedKeys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith('@food-manager/') && key !== erasureKey);
      for (const key of ownedKeys) await AsyncStorage.removeItem(key);
      if ((await AsyncStorage.getAllKeys()).some((key) => key.startsWith('@food-manager/') && key !== erasureKey)) throw new Error('保存データを削除できませんでした。');
      const id = `cleared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      for (const key of snapshotKeys) {
        const json = JSON.stringify(values[key]);
        const target = physicalKey(key, id);
        await AsyncStorage.setItem(target, json);
        if (await AsyncStorage.getItem(target) !== json) throw new Error('削除後の初期データを確認できませんでした。');
      }
      const head = JSON.stringify({ version: 1, id });
      await AsyncStorage.setItem(generationKey, head);
      if (await AsyncStorage.getItem(generationKey) !== head) throw new Error('削除後の保存先を確認できませんでした。');
      try { await AsyncStorage.removeItem(erasureKey); }
      catch (error) { if (await AsyncStorage.getItem(erasureKey) !== null) throw error; }
      if (await AsyncStorage.getItem(erasureKey) !== null) throw new Error('削除の完了を確認できませんでした。');
      knownGeneration = id; uncertainCommit = false; erasing = false;
    });
  } finally { erasureRunning = false; }
}
