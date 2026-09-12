import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
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

    await Notifications.clearLastNotificationResponseAsync();
  }, [foods, isReady, navigationReady]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handleResponse(response);
    });
    return () => subscription.remove();
  }, [handleResponse]);

  useEffect(() => {
    if (pendingResponse.current && isReady && navigationReady) {
      void handleResponse(pendingResponse.current);
    }
  }, [handleResponse, isReady, navigationReady]);

  return null;
}
