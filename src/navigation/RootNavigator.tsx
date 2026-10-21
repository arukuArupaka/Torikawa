import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { DataRecoveryPanel } from '../components/DataRecoveryPanel';
import { DataErasurePanel } from '../components/DataErasurePanel';
import { NotificationSyncNotice } from '../components/NotificationSyncNotice';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { AddFoodScreen } from '../screens/AddFoodScreen';
import { BarcodeScreen } from '../screens/BarcodeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { FoodDetailScreen } from '../screens/FoodDetailScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen';
import { AddRecipeScreen } from '../screens/AddRecipeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { UsageGuideScreen } from '../screens/UsageGuideScreen';
import { AppInformationScreen } from '../screens/AppInformationScreen';
import { OssLicensesScreen } from '../screens/OssLicensesScreen';
import { ShoppingListScreen } from '../screens/ShoppingListScreen';
import { StatisticsScreen } from '../screens/StatisticsScreen';
import { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const tabIcons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Calendar: 'calendar-outline',
  Barcode: 'barcode-outline',
  Recipes: 'restaurant-outline',
  Settings: 'settings-outline',
};

const tabLabels: Record<keyof MainTabParamList, string> = {
  Home: 'ホーム',
  Calendar: 'カレンダー',
  Barcode: 'バーコード',
  Recipes: 'レシピ',
  Settings: '設定',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabel: tabLabels[route.name],
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color, focused }) => {
          const isBarcode = route.name === 'Barcode';
          return (
            <View style={[styles.iconWrap, isBarcode && styles.barcodeIconWrap]}>
              <Ionicons
                color={isBarcode ? colors.surface : color}
                name={focused && !isBarcode ? tabIcons[route.name].replace('-outline', '') as keyof typeof Ionicons.glyphMap : tabIcons[route.name]}
                size={isBarcode ? 29 : 23}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen component={HomeScreen} name="Home" />
      <Tab.Screen component={CalendarScreen} name="Calendar" />
      <Tab.Screen component={BarcodeScreen} name="Barcode" />
      <Tab.Screen component={RecipesScreen} name="Recipes" />
      <Tab.Screen component={SettingsScreen} name="Settings" />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { isReady, isRestoring, erasurePending, erasureError, loadError, saveError, retrySave, notificationSyncError } = useAppData();

  if (!isReady) {
    return (
      <SafeAreaView style={styles.loading}>
        {erasurePending || erasureError ? <DataErasurePanel /> : isRestoring ? <>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadErrorText}>バックアップを復元しています…</Text>
        </> : loadError ? (
          <DataRecoveryPanel />
        ) : <ActivityIndicator color={colors.primary} size="large" />}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Modal visible={isRestoring} transparent animationType="none" onRequestClose={() => {}}>
        <View accessibilityViewIsModal style={styles.restoring}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text accessibilityRole="alert" style={styles.loadErrorText}>バックアップを復元しています…</Text>
          <Text style={styles.loadErrorText}>完了するまでアプリを閉じずにお待ちください。</Text>
        </View>
      </Modal>
      {saveError ? (
        <SafeAreaView edges={['top']} style={styles.saveError}>
          <Text accessibilityRole="alert" style={styles.loadErrorText}>{saveError}</Text>
          <PrimaryButton label="保存を再試行" onPress={retrySave} variant="outline" />
        </SafeAreaView>
      ) : null}
      <NotificationSyncNotice error={notificationSyncError} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen component={MainTabs} name="MainTabs" />
        <Stack.Screen component={AddFoodScreen} name="AddFood" options={{ presentation: 'modal' }} />
        <Stack.Screen component={FoodDetailScreen} name="FoodDetail" />
        <Stack.Screen component={RecipeDetailScreen} name="RecipeDetail" />
        <Stack.Screen component={AddRecipeScreen} name="AddRecipe" options={{ presentation: 'modal' }} />
        <Stack.Screen component={ShoppingListScreen} name="ShoppingList" />
        <Stack.Screen component={StatisticsScreen} name="Statistics" />
        <Stack.Screen component={UsageGuideScreen} name="UsageGuide" />
        <Stack.Screen component={AppInformationScreen} name="AppInformation" />
        <Stack.Screen component={OssLicensesScreen} name="OssLicenses" />
      </Stack.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  restoring: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadError: { width: '100%', maxWidth: 420, padding: 24, gap: 20 },
  loadErrorText: { color: colors.text, fontSize: 16, lineHeight: 26 },
  saveError: { backgroundColor: colors.warningSoft, padding: 16, gap: 10 },
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 68, paddingBottom: 7, paddingTop: 7 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  iconWrap: { alignItems: 'center', height: 30, justifyContent: 'center', width: 44 },
  barcodeIconWrap: { backgroundColor: colors.primary, borderColor: colors.surface, borderRadius: 24, borderWidth: 3, height: 48, marginTop: -19, width: 48 },
});
