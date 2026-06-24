import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationNavigationHandler } from './src/components/NotificationNavigationHandler';
import { AppDataProvider } from './src/context/AppDataContext';
import { navigationRef } from './src/navigation/navigationRef';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initializeNotificationHandling } from './src/services/notificationService';

initializeNotificationHandling();

export default function App() {
  const [navigationReady, setNavigationReady] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppDataProvider>
          <NavigationContainer ref={navigationRef} onReady={() => setNavigationReady(true)}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
          <NotificationNavigationHandler navigationReady={navigationReady} />
        </AppDataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
