import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { FoodItem, NotificationSettings } from '../types';
import { parseDate } from '../utils/date';
import { getFoodDisplayName } from '../utils/ingredientNormalizer';
import { loadStoredValue, saveStoredValue, storageKeys, isDataErasing } from './storage';

const CHANNEL_ID = 'expiry-reminders';
const KIND = 'tabedoki-expiry-v2';
type IdMap = Record<string, string[]>;
export type NotificationStatusSummary = {
  permission: 'granted' | 'denied' | 'undetermined' | 'unsupported';
  scheduledCount: number;
};
let syncQueue: Promise<void> = Promise.resolve();

export function initializeNotificationHandling(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }) });
}
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '食材の期限通知', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
  });
}
function isPermissionGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(current)) return true;
  return isPermissionGranted(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } }));
}

export function buildNotificationPlan(foods: FoodItem[], settings: NotificationSettings) {
  if (!settings.enabled) return [];
  const [hour, minute] = settings.time.split(':').map(Number);
  return foods.filter((food) => food.status === 'active').flatMap((food) => {
    const expiry = parseDate(food.expiryDate);
    return [...new Set(settings.daysBeforeList)].flatMap((daysBefore) => {
      const date = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate() - daysBefore, hour, minute);
      if (date.getTime() <= Date.now()) return [];
      const title = `「${getFoodDisplayName(food)}」の期限が近づいています`;
      const body = daysBefore === 0 ? '今日が期限です。忘れずに使い切りましょう。' : `${daysBefore}日後が期限です。使い道を確認しましょう。`;
      const key = JSON.stringify([food.id, daysBefore, date.getTime(), title, body]);
      return [{ foodId: food.id, daysBefore, date, title, body, key }];
    });
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}
function getCurrentScope(): string | null {
  if (!Constants.expoVersion) return null;
  const scope = Constants.manifest2?.extra?.scopeKey;
  if (!scope) throw new Error('アプリの通知情報を確認できません。Expo Goでアプリを開き直してください。');
  return scope;
}
function isInCurrentScope(item: Notifications.NotificationRequest): boolean {
  // Expo Go on iOS lists every experience's reservations, but cancellation is scoped.
  // Old connections must not be mistaken for reservations this experience can remove.
  const scope = getCurrentScope();
  return !scope || (item.content.data?.scopeKey ?? item.content.data?.experienceId) === scope;
}
function isManaged(item: Notifications.NotificationRequest, known: Set<string> = new Set()): boolean {
  if (!isInCurrentScope(item)) return false;
  const data = item.content.data;
  return data?.kind === KIND || known.has(item.identifier)
    || (!data?.kind && typeof data?.foodId === 'string' && typeof data?.daysBefore === 'number');
}
async function reconcile(foods: FoodItem[], settings: NotificationSettings): Promise<void> {
  if (Platform.OS === 'web') return;
  if (isDataErasing()) throw new Error('削除中は通知を予約できません。');
  getCurrentScope();
  await ensureAndroidChannel();
  const permission = await Notifications.getPermissionsAsync();
  const plan = isPermissionGranted(permission) ? buildNotificationPlan(foods, settings) : [];
  let stored: Record<string, string | string[]> = {};
  try { stored = await loadStoredValue<typeof stored>(storageKeys.notificationIds) ?? {}; }
  catch { /* OS metadata also recovers reservations when the index is unreadable. */ }
  const known = new Set(Object.values(stored).flatMap((value) => typeof value === 'string' ? [value] : Array.isArray(value) ? value : []));
  const actual = await Notifications.getAllScheduledNotificationsAsync();
  const desired = new Map(plan.map((item) => [item.key, item]));
  const kept = new Set<string>();
  const ids: IdMap = Object.create(null);
  const track = (foodId: string, id: string) => { (ids[foodId] ??= []).push(id); };
  let failed = false;
  for (const item of actual.filter((item) => isManaged(item, known))) {
    const key = String(item.content.data?.planKey ?? '');
    const expected = desired.get(key);
    if (expected && !kept.has(key) && item.content.title === expected.title && item.content.body === expected.body) {
      kept.add(key); track(expected.foodId, item.identifier);
    } else {
      try { await Notifications.cancelScheduledNotificationAsync(item.identifier); }
      catch { track(String(item.content.data?.foodId ?? 'unknown'), item.identifier); failed = true; }
    }
  }
  // Retain failed cancellations before creating anything else.
  await saveStoredValue(storageKeys.notificationIds, ids);
  if (failed) throw new Error('解除できない期限通知があります。「通知を再同期」で再試行してください。');
  for (const item of plan) {
    if (kept.has(item.key)) continue;
    const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, sound: 'default',
        data: { kind: KIND, planKey: item.key, foodId: item.foodId, daysBefore: item.daysBefore } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined },
    });
    track(item.foodId, identifier);
    // A failure later in this food's day list must not lose earlier reservations.
    await saveStoredValue(storageKeys.notificationIds, ids);
  }
  // OS cancellation can reach the pending list after the native call resolves.
  // Recheck briefly without rescheduling, then keep reporting a real mismatch.
  let matches = false;
  for (const delay of [0, 150, 350, 750]) {
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const verified = (await Notifications.getAllScheduledNotificationsAsync()).filter((item) => isManaged(item, known));
    const keys = verified.map((item) => item.content.data?.planKey);
    matches = keys.length === plan.length && new Set(keys).size === plan.length
      && verified.every((item) => {
        const expected = desired.get(String(item.content.data?.planKey ?? ''));
        return expected && item.content.title === expected.title && item.content.body === expected.body;
      });
    if (matches) break;
  }
  if (!matches) throw new Error(`端末の通知予約が予定と一致しません（予定${plan.length}件）。「通知を再同期」で再試行してください。`);
  if (settings.enabled && !isPermissionGranted(permission)) throw new Error('通知が許可されていません。端末の設定で通知を許可して再同期してください。');
}
export function queueNotificationSync(foods: FoodItem[], settings: NotificationSettings): Promise<void> {
  // Take a snapshot; later callers run after this operation, including after failures.
  syncQueue = syncQueue.catch(() => undefined).then(() => reconcile(foods, settings));
  return syncQueue;
}
export async function scheduleTestNotification(food?: Pick<FoodItem, 'id' | 'name' | 'productName'>): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Web版では通知を利用できません。スマートフォンでお試しください。');
  syncQueue = syncQueue.catch(() => undefined).then(async () => {
    if (isDataErasing()) throw new Error('削除中は通知を予約できません。');
    await ensureAndroidChannel();
    if (isDataErasing()) throw new Error('削除中は通知を予約できません。');
    await Notifications.scheduleNotificationAsync({
    content: { title: food ? `「${getFoodDisplayName(food)}」のテスト通知` : 'たべどき！！のテスト通知',
      body: food ? 'タップすると食材の詳細画面を開きます。' : '期限通知を受け取る準備ができました。',
      data: { kind: 'tabedoki-test', ...(food ? { foodId: food.id } : {}) }, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined },
    });
  });
  return syncQueue;
}

export function clearNotificationsForErasure(rawIds: string | null): Promise<void> {
  const known = new Set<string>();
  try {
    const parsed = JSON.parse(rawIds ?? '{}');
    if (parsed && typeof parsed === 'object') for (const value of Object.values(parsed)) {
      for (const id of Array.isArray(value) ? value : [value]) if (typeof id === 'string') known.add(id);
    }
  } catch { /* Managed OS metadata still identifies notifications when the index is corrupt. */ }
  const managed = (request: Notifications.NotificationRequest) => isInCurrentScope(request)
    && (isManaged(request, known) || request.content.data?.kind === 'tabedoki-test');
  syncQueue = syncQueue.catch(() => undefined).then(async () => {
    if (Platform.OS === 'web') return;
    getCurrentScope();
    for (const request of await Notifications.getAllScheduledNotificationsAsync()) if (managed(request)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
    for (const notification of await Notifications.getPresentedNotificationsAsync()) if (managed(notification.request)) await Notifications.dismissNotificationAsync(notification.request.identifier);
    const last = Notifications.getLastNotificationResponse();
    if (last && managed(last.notification.request)) Notifications.clearLastNotificationResponse();
    if ((await Notifications.getAllScheduledNotificationsAsync()).some(managed)
      || (await Notifications.getPresentedNotificationsAsync()).some((item) => managed(item.request))) throw new Error('削除できていない通知があります。削除を再試行してください。');
  });
  return syncQueue;
}
export async function getNotificationStatusSummary(): Promise<NotificationStatusSummary> {
  if (Platform.OS === 'web') return { permission: 'unsupported', scheduledCount: 0 };
  await syncQueue.catch(() => undefined);
  getCurrentScope();
  const [permission, scheduled] = await Promise.all([Notifications.getPermissionsAsync(), Notifications.getAllScheduledNotificationsAsync()]);
  return { permission: isPermissionGranted(permission) ? 'granted' : permission.status === 'denied' ? 'denied' : 'undetermined',
    scheduledCount: scheduled.filter((item) => isManaged(item)).length };
}
