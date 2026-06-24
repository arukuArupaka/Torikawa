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

export async function loadStoredValue<T>(key: string): Promise<T | null> {
  const value = await AsyncStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function saveStoredValue<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
