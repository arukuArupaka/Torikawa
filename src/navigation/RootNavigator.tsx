import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
  const { isReady } = useAppData();

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen component={MainTabs} name="MainTabs" />
      <Stack.Screen component={AddFoodScreen} name="AddFood" options={{ presentation: 'modal' }} />
      <Stack.Screen component={FoodDetailScreen} name="FoodDetail" />
      <Stack.Screen component={RecipeDetailScreen} name="RecipeDetail" />
      <Stack.Screen component={AddRecipeScreen} name="AddRecipe" options={{ presentation: 'modal' }} />
      <Stack.Screen component={ShoppingListScreen} name="ShoppingList" />
      <Stack.Screen component={StatisticsScreen} name="Statistics" />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 68, paddingBottom: 7, paddingTop: 7 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  iconWrap: { alignItems: 'center', height: 30, justifyContent: 'center', width: 44 },
  barcodeIconWrap: { backgroundColor: colors.primary, borderColor: colors.surface, borderRadius: 24, borderWidth: 3, height: 48, marginTop: -19, width: 48 },
});
