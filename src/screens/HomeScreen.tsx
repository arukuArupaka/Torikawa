import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { SwipeableFoodCard } from '../components/SwipeableFoodCard';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { loadStoredValue, saveStoredValue, storageKeys } from '../services/storage';
import { FoodItem } from '../types';
import { daysUntil } from '../utils/date';
import { foodCategoryOptions } from '../utils/foodCategory';
import { getFoodDisplayName, getFoodSearchTerms } from '../utils/ingredientNormalizer';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

type FoodSection = {
  key: string;
  title: string;
  tone: 'red' | 'orange' | 'green' | 'blue';
  foods: FoodItem[];
};

type HomeViewMode = 'expiry' | 'storage' | 'category';

const viewModeOptions: { key: HomeViewMode; label: string }[] = [
  { key: 'expiry', label: '期限順' },
  { key: 'storage', label: '保存場所別' },
  { key: 'category', label: 'カテゴリ別' },
];

export function HomeScreen({ navigation }: Props) {
  const { foods, markFoodDisposed, markFoodUsed } = useAppData();
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<HomeViewMode>('expiry');
  const swipeGuideCheckStarted = useRef(false);
  const activeFoods = useMemo(
    () => foods.filter((food) => food.status === 'active'),
    [foods],
  );

  const sections = useMemo<FoodSection[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ja-JP');
    const filtered = activeFoods
      .filter((food) =>
        !normalizedQuery
        || getFoodSearchTerms(food).some((term) => term.toLocaleLowerCase('ja-JP').includes(normalizedQuery)),
      )
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    if (viewMode === 'storage') {
      return [
        { key: 'refrigerated', title: '冷蔵', tone: 'green', foods: filtered.filter((food) => food.storage === 'refrigerated') },
        { key: 'frozen', title: '冷凍', tone: 'blue', foods: filtered.filter((food) => food.storage === 'frozen') },
        { key: 'room', title: '常温', tone: 'orange', foods: filtered.filter((food) => food.storage === 'room') },
      ];
    }

    if (viewMode === 'category') {
      return foodCategoryOptions.map((category) => ({
        key: category.value,
        title: category.label,
        tone: 'green' as const,
        foods: filtered.filter((food) => food.category === category.value),
      }));
    }

    return [
      { key: 'expired', title: '期限切れ', tone: 'red', foods: filtered.filter((food) => daysUntil(food.expiryDate) < 0) },
      { key: 'today', title: '今日まで', tone: 'orange', foods: filtered.filter((food) => daysUntil(food.expiryDate) === 0) },
      { key: 'soon', title: '3日以内', tone: 'orange', foods: filtered.filter((food) => {
        const days = daysUntil(food.expiryDate);
        return days >= 1 && days <= 3;
      }) },
      { key: 'other', title: 'その他', tone: 'green', foods: filtered.filter((food) => daysUntil(food.expiryDate) > 3) },
    ];
  }, [activeFoods, query, viewMode]);

  useEffect(() => {
    if (activeFoods.length === 0 || swipeGuideCheckStarted.current) return;
    swipeGuideCheckStarted.current = true;
    let mounted = true;

    void loadStoredValue<boolean>(storageKeys.swipeGuideSeen)
      .then((seen) => {
        if (!mounted || seen) return;
        Alert.alert(
          '食材カードの操作',
          '食材カードを右にスワイプすると「捨てた」、左にスワイプすると「使い切った」として記録できます。',
          [{
            text: 'OK',
            onPress: () => {
              void saveStoredValue(storageKeys.swipeGuideSeen, true).catch((error) => {
                console.warn('スワイプ操作ガイドの確認状態を保存できませんでした。', error);
              });
            },
          }],
          { cancelable: false },
        );
      })
      .catch((error) => {
        console.warn('スワイプ操作ガイドの状態を読み込めませんでした。', error);
      });

    return () => {
      mounted = false;
    };
  }, [activeFoods.length]);

  const confirmStatusChange = (food: FoodItem, status: 'used' | 'disposed') => {
    const isUsed = status === 'used';
    const displayName = getFoodDisplayName(food);
    Alert.alert(
      isUsed ? '使い切ったとして記録' : '捨てたとして記録',
      `「${displayName}」を${isUsed ? '使い切った' : '捨てた'}として記録しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'OK',
          style: isUsed ? 'default' : 'destructive',
          onPress: () => isUsed ? markFoodUsed(food.id) : markFoodDisposed(food.id),
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader
        action={{ icon: 'basket-outline', label: '買い物リスト', onPress: () => navigation.navigate('ShoppingList') }}
        leftAction={{ icon: 'stats-chart-outline', label: '食材ロス統計', onPress: () => navigation.navigate('Statistics') }}
        subtitle={`${activeFoods.length}件の食材`}
        title="食材管理"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.actionRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textMuted} name="search" size={19} />
            <TextInput
              onChangeText={setQuery}
              placeholder="食材を検索"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <Pressable
            accessibilityLabel="バーコード登録"
            onPress={() => navigation.navigate('MainTabs', { screen: 'Barcode' })}
            style={styles.squareButton}
          >
            <Ionicons color={colors.text} name="barcode-outline" size={25} />
          </Pressable>
          <Pressable
            accessibilityLabel="食材を追加"
            onPress={() => navigation.navigate('AddFood')}
            style={[styles.squareButton, styles.addButton]}
          >
            <Ionicons color={colors.surface} name="add" size={27} />
          </Pressable>
        </View>

        <View style={styles.viewModeTabs}>
          {viewModeOptions.map((option) => {
            const selected = viewMode === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.key}
                onPress={() => setViewMode(option.key)}
                style={[styles.viewModeTab, selected && styles.selectedViewModeTab]}
              >
                <Text style={[styles.viewModeText, selected && styles.selectedViewModeText]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {activeFoods.length > 0 ? (
          <View style={styles.swipeHint}>
            <Ionicons color={colors.primary} name="swap-horizontal-outline" size={18} />
            <Text style={styles.swipeHintText}>
              右スワイプ：捨てた　／　左スワイプ：使い切った
            </Text>
          </View>
        ) : null}

        {activeFoods.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.primary} name="leaf-outline" size={48} />
            <Text style={styles.emptyTitle}>食材を登録してみましょう</Text>
            <Text style={styles.emptyText}>期限が近い食材をここで確認できます。</Text>
          </View>
        ) : null}

        {sections.map((section) =>
          section.foods.length > 0 ? (
            <View key={section.key}>
              <SectionHeader count={section.foods.length} title={section.title} tone={section.tone} />
              <View style={styles.list}>
                {section.foods.map((food) => (
                  <SwipeableFoodCard
                    food={food}
                    key={food.id}
                    onMarkDisposed={() => confirmStatusChange(food, 'disposed')}
                    onMarkUsed={() => confirmStatusChange(food, 'used')}
                    onPress={() => navigation.navigate('FoodDetail', { foodId: food.id })}
                  />
                ))}
              </View>
            </View>
          ) : null,
        )}

        {activeFoods.length > 0 && sections.every((section) => section.foods.length === 0) ? (
          <Text style={styles.noResults}>「{query}」に一致する食材はありません。</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 13,
  },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, height: 50, marginLeft: spacing.sm },
  squareButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  addButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  viewModeTabs: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', marginTop: spacing.sm, padding: 3 },
  viewModeTab: { alignItems: 'center', borderRadius: 7, flex: 1, justifyContent: 'center', minHeight: 34 },
  selectedViewModeTab: { backgroundColor: colors.primarySoft },
  viewModeText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  selectedViewModeText: { color: colors.primaryDark },
  swipeHint: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: 12, paddingVertical: 9 },
  swipeHintText: { color: colors.primaryDark, flex: 1, fontSize: 11, lineHeight: 16 },
  list: { gap: spacing.sm },
  empty: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 70 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  emptyText: { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  noResults: { color: colors.textMuted, paddingVertical: 60, textAlign: 'center' },
});
