import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { createInitialData } from '../data/initialData';
import { eraseStoredValues, storageKeys } from './storage';
import { clearNotificationsForErasure } from './notificationService';

function eraseOwnedFiles(raw: Record<string, string | null>) {
  if (Platform.OS === 'web') return;
  const references = new Set<string>();
  const pending: unknown[] = Object.values(raw);
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string' && /^[\s]*[\[{]/.test(value)) {
      try { pending.push(JSON.parse(value)); } catch { /* Known file prefixes also cover orphaned/corrupt records. */ }
    } else if (value && typeof value === 'object') {
      if ('image' in value && typeof value.image === 'string') references.add(value.image);
      for (const child of Object.values(value)) pending.push(child);
    }
  }
  const locations = [
    { directory: Paths.document, includeReferences: true, pattern: /^(food-|catalog-|restored-(food|recipe|catalog)-)/ },
    { directory: Paths.cache, includeReferences: false, pattern: /^tabedoki-(backup|recovery)-.*\.json$/ },
  ];
  for (const { directory, pattern, includeReferences } of locations) {
    if (!directory.exists) continue;
    const owned = () => directory.list().filter((item) => item instanceof File && (pattern.test(item.name)
      || (includeReferences && references.has(item.uri)))
      && item.parentDirectory.uri.replace(/\/+$/, '') === directory.uri.replace(/\/+$/, '')) as File[];
    for (const file of owned()) file.delete();
    if (owned().length > 0) throw new Error('アプリが保存した写真や一時ファイルを削除できませんでした。');
  }
}

export async function eraseAppStoredData() {
  const empty = createInitialData(false);
  await eraseStoredValues({
    [storageKeys.foods]: empty.foods, [storageKeys.shopping]: empty.shoppingItems,
    [storageKeys.recipes]: empty.recipes, [storageKeys.notifications]: empty.notificationSettings,
    [storageKeys.learnedProducts]: {},
  }, async (raw) => { await clearNotificationsForErasure(raw[storageKeys.notificationIds]); eraseOwnedFiles(raw); });
  return empty;
}
