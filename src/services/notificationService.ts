import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { FoodItem, NotificationSettings } from '../types';
import { parseDate } from '../utils/date';
import { getFoodDisplayName } from '../utils/ingredientNormalizer';
import { loadStoredValue, saveStoredValue, storageKeys } from './storage';

const CHANNEL_ID = 'expiry-reminders';
type NotificationIdMap = Record<string, string[]>;
type StoredNotificationIdMap = Record<string, string | string[]>;

export type NotificationStatusSummary = {
  permission: 'granted' | 'denied' | 'undetermined';
  scheduledCount: number;
};

let syncQueue: Promise<void> = Promise.resolve();

export function initializeNotificationHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '食材の期限通知',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

function isPermissionGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted
    || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(current)) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return isPermissionGranted(requested);
}

function getTriggerDate(
  food: FoodItem,
  daysBefore: number,
  time: string,
): Date | null {
  const [hour, minute] = time.split(':').map(Number);
  const expiry = parseDate(food.expiryDate);
  const trigger = new Date(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate() - daysBefore,
    hour,
    minute,
    0,
    0,
  );
  return trigger.getTime() > Date.now() ? trigger : null;
}

async function cancelManagedNotifications(): Promise<void> {
  const storedIds = await loadStoredValue<StoredNotificationIdMap>(storageKeys.notificationIds);
  const identifiers = Object.values(storedIds ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  await Promise.all(
    identifiers.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (error) {
        console.warn('期限通知を解除できませんでした。', error);
      }
    }),
  );
  await saveStoredValue(storageKeys.notificationIds, {});
}

async function syncFoodNotifications(
  foods: FoodItem[],
  settings: NotificationSettings,
): Promise<void> {
  await cancelManagedNotifications();
  if (!settings.enabled) return;

  await ensureAndroidChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (!isPermissionGranted(permission)) return;

  const scheduledIds: NotificationIdMap = {};
  try {
    for (const food of foods) {
      const identifiers: string[] = [];
      for (const daysBefore of [...new Set(settings.daysBeforeList)]) {
        const triggerDate = getTriggerDate(food, daysBefore, settings.time);
        if (!triggerDate) continue;

        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: `「${getFoodDisplayName(food)}」の期限が近づいています`,
            body: daysBefore === 0
              ? '今日が期限です。忘れずに使い切りましょう。'
              : `${daysBefore}日後が期限です。使い道を確認しましょう。`,
            data: { foodId: food.id, daysBefore },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
          },
        });
        identifiers.push(identifier);
      }
      if (identifiers.length > 0) scheduledIds[food.id] = identifiers;
    }
  } finally {
    // 途中で失敗しても、作成済みの予約を次回同期で解除できるようにします。
    await saveStoredValue(storageKeys.notificationIds, scheduledIds);
  }
}

export function queueNotificationSync(
  foods: FoodItem[],
  settings: NotificationSettings,
): Promise<void> {
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(() => syncFoodNotifications(foods, settings));
  return syncQueue;
}

export async function scheduleTestNotification(food?: Pick<FoodItem, 'id' | 'name' | 'productName'>): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: food ? `「${getFoodDisplayName(food)}」のテスト通知` : '冷蔵庫ノートのテスト通知',
      body: food
        ? 'タップすると食材の詳細画面を開きます。'
        : '期限通知を受け取る準備ができました。',
      data: food ? { foodId: food.id } : {},
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
}

export async function getNotificationStatusSummary(): Promise<NotificationStatusSummary> {
  const [permission, scheduled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const permissionLabel = isPermissionGranted(permission)
    ? 'granted'
    : permission.status === 'denied'
      ? 'denied'
      : 'undetermined';

  return {
    permission: permissionLabel,
    scheduledCount: scheduled.filter((notification) =>
      typeof notification.content.data.foodId === 'string',
    ).length,
  };
}
