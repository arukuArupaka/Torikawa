import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAppData } from '../context/AppDataContext';
import { navigationRef } from '../navigation/navigationRef';

export function NotificationNavigationHandler({
  navigationReady,
}: {
  navigationReady: boolean;
}) {
  const { foods, isReady } = useAppData();
  const handledIdentifier = useRef<string | null>(null);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  const handleResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const identifier = response.notification.request.identifier;
    if (handledIdentifier.current === identifier) return;

    if (!isReady || !navigationReady || !navigationRef.isReady()) {
      pendingResponse.current = response;
      return;
    }

    handledIdentifier.current = identifier;
    pendingResponse.current = null;
    const foodId = response.notification.request.content.data?.foodId;

    if (typeof foodId === 'string' && foods.some((food) => food.id === foodId)) {
      navigationRef.navigate('FoodDetail', { foodId });
    } else if (typeof foodId === 'string') {
      navigationRef.navigate('MainTabs', { screen: 'Home' });
    }

    await Notifications.clearLastNotificationResponseAsync().catch((error) => console.warn('通知の確認済み状態を保存できませんでした。', error));
  }, [foods, isReady, navigationReady]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (active) void handleResponse(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      // Loading, restoration or unmounting can replace this food/navigation snapshot
      // before the native response arrives. Only the current effect may consume it.
      if (active && response) void handleResponse(response);
    }).catch((error) => console.warn('起動時の通知を確認できませんでした。', error));
    return () => { active = false; subscription.remove(); };
  }, [handleResponse]);

  useEffect(() => {
    if (pendingResponse.current && isReady && navigationReady) {
      void handleResponse(pendingResponse.current);
    }
  }, [handleResponse, isReady, navigationReady]);

  return null;
}
