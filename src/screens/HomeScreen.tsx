import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { SwipeableFoodCard } from '../components/SwipeableFoodCard';
import { MotionIconButton } from '../components/MotionIconButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { SelectionHighlight } from '../components/SelectionHighlight';
import { colors, radius, spacing } from '../constants/theme';
import { useFoodData } from '../context/AppDataContext';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { useViewModeFade } from '../hooks/useViewModeFade';
import { useFoodStatusFeedback } from '../hooks/useFoodStatusFeedback';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { loadStoredValue, saveStoredValue, storageKeys } from '../services/storage';
import { FoodItem } from '../types';
import { daysUntil, parseDate } from '../utils/date';
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
type ExpiryFilter = 'all' | 'expired' | 'today' | 'soon';

const expiryFilterLabels = { expired: '期限切れ', today: '今日まで', soon: '明日〜3日以内' };

const viewModeOptions: { key: HomeViewMode; label: string }[] = [
  { key: 'expiry', label: '期限順' },
  { key: 'storage', label: '保存場所別' },
  { key: 'category', label: 'カテゴリ別' },
];

export function HomeScreen({ navigation }: Props) {
  const alert = useAppAlert();
  const statusFeedback = useFoodStatusFeedback();
  const { foods, addShoppingItem, markFoodDisposed, markFoodUsed } = useFoodData();
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<HomeViewMode>('expiry');
  const listMotion = useViewModeFade(`${viewMode}-${expiryFilter}`);
  const [viewModeWidth, setViewModeWidth] = useState(0);
  const listMotionStyle = { opacity: listMotion.opacity, transform: [{ translateY: listMotion.translateY }] };
  const currentDay = useCurrentDay();
  const [showSwipeGuide, setShowSwipeGuide] = useState(false);
  const activeFoods = useMemo(
    () => foods.filter((food) => food.status === 'active'),
    [foods],
  );
  const expirySummary = useMemo(() => {
    const today = parseDate(currentDay);
    return activeFoods.reduce((counts, food) => {
      const days = daysUntil(food.expiryDate, today);
      if (days < 0) counts.expired += 1;
      else if (days === 0) counts.today += 1;
      else if (days >= 1 && days <= 3) counts.soon += 1;
      return counts;
    }, { expired: 0, today: 0, soon: 0 });
  }, [activeFoods, currentDay]);
  const hasUrgentFoods = expirySummary.today + expirySummary.soon > 0;

  useEffect(() => {
    if (expiryFilter === 'expired' && expirySummary.expired === 0) setExpiryFilter('all');
  }, [expiryFilter, expirySummary.expired]);

  const sections = useMemo<FoodSection[]>(() => {
    const today = parseDate(currentDay);
    const normalizedQuery = query.trim().toLocaleLowerCase('ja-JP');
    const filtered = activeFoods
      .filter((food) => {
        const days = daysUntil(food.expiryDate, today);
        return expiryFilter === 'all' || (expiryFilter === 'expired' && days < 0)
          || (expiryFilter === 'today' && days === 0) || (expiryFilter === 'soon' && days >= 1 && days <= 3);
      })
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
      { key: 'expired', title: '期限切れ', tone: 'red', foods: filtered.filter((food) => daysUntil(food.expiryDate, today) < 0) },
      { key: 'today', title: '今日まで', tone: 'orange', foods: filtered.filter((food) => daysUntil(food.expiryDate, today) === 0) },
      { key: 'soon', title: '3日以内', tone: 'orange', foods: filtered.filter((food) => {
        const days = daysUntil(food.expiryDate, today);
        return days >= 1 && days <= 3;
      }) },
      { key: 'other', title: 'その他', tone: 'green', foods: filtered.filter((food) => daysUntil(food.expiryDate, today) > 3) },
    ];
  }, [activeFoods, currentDay, query, viewMode, expiryFilter]);

  const showExpiryFilter = (filter: ExpiryFilter) => {
    setExpiryFilter(filter);
    setQuery('');
    setViewMode('expiry');
  };

  useEffect(() => {
    let mounted = true;

    void loadStoredValue<boolean>(storageKeys.swipeGuideSeen)
      .then((seen) => {
        if (mounted) setShowSwipeGuide(!seen);
      })
      .catch((error) => {
        console.warn('スワイプ操作ガイドの状態を読み込めませんでした。', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const dismissSwipeGuide = () => {
    setShowSwipeGuide(false);
    void saveStoredValue(storageKeys.swipeGuideSeen, true).catch((error) => {
      console.warn('スワイプ操作ガイドの確認状態を保存できませんでした。', error);
    });
  };

  const confirmStatusChange = (food: FoodItem, status: 'used' | 'disposed') => {
    const isUsed = status === 'used';
    const displayName = getFoodDisplayName(food);
    const addToShoppingList = () => {
      const added = addShoppingItem(displayName, '使い切った食材から追加');
      if (!added) {
        alert('追加済みです', `「${displayName}」は未完了の買い物リストにあります。`);
      }
    };
    if (isUsed) {
      alert(
        '使い切ったとして記録',
        `「${displayName}」を使い切ったとして記録しますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '記録だけ', onPress: () => markFoodUsed(food.id, statusFeedback(food, 'used')) },
          {
            text: '買い物リストにも追加',
            onPress: () => {
              markFoodUsed(food.id, statusFeedback(food, 'used', true));
              addToShoppingList();
            },
          },
        ],
      );
      return;
    }

    alert(
      '捨てたとして記録',
      `「${displayName}」を捨てたとして記録しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'OK',
          style: 'destructive',
          onPress: () => markFoodDisposed(food.id, statusFeedback(food, 'disposed')),
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
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        sections={sections.filter((section) => section.foods.length > 0).map((section) => ({ ...section, data: section.foods }))}
        keyExtractor={(food) => food.id}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Animated.View style={listMotionStyle}><SectionHeader count={section.data.length} title={section.title} tone={section.tone} /></Animated.View>}
        renderItem={({ item: food }) => <Animated.View style={[{ marginBottom: spacing.sm }, listMotionStyle]}><SwipeableFoodCard food={food}
          onMarkDisposed={() => confirmStatusChange(food, 'disposed')}
          onMarkUsed={() => confirmStatusChange(food, 'used')}
          onPress={() => navigation.navigate('FoodDetail', { foodId: food.id })} /></Animated.View>}
        ListHeaderComponent={<>
        {expirySummary.expired > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`期限切れ${expirySummary.expired}件を確認`}
          accessibilityState={{ selected: expiryFilter === 'expired' }} aria-pressed={expiryFilter === 'expired'}
          onPress={() => showExpiryFilter('expired')} style={styles.expiredNotice}>
          <Text style={styles.expiredTitle}>期限切れ {expirySummary.expired}件を確認</Text>
          <Text style={styles.expiredHint}>期限と状態を確認してください。食べられるかどうかを判定する表示ではありません。</Text>
        </Pressable> : null}
        {activeFoods.length > 0 ? (
          <View style={styles.expirySummary}>
            <View style={styles.summaryHeading}>
              <Text accessibilityRole="header" style={styles.summaryTitle}>早めに使いたい食材</Text>
              <Text style={styles.summaryScope}>在庫全体</Text>
            </View>
            <View style={styles.summaryCounts}>
              <Pressable accessibilityRole="button" accessibilityLabel={`今日まで ${expirySummary.today}件`}
                accessibilityHint="今日が期限の食材だけを表示します。"
                accessibilityState={{ selected: expiryFilter === 'today' }} aria-pressed={expiryFilter === 'today'}
                onPress={() => showExpiryFilter('today')}
                style={({ pressed }) => [styles.summaryCount, expiryFilter === 'today' && styles.selectedSummaryCount, pressed && styles.summaryCountPressed]}>
                <Text style={styles.summaryLabel}>今日まで</Text>
                <Text style={styles.summaryNumber}>{expirySummary.today}<Text style={styles.summaryUnit}> 件</Text></Text>
                <View style={styles.summaryLink}><Text style={styles.summaryLinkText}>食材を見る</Text><Ionicons name="chevron-forward" size={14} color={colors.primaryDark} /></View>
              </Pressable>
              <View style={styles.summaryDivider} />
              <Pressable accessibilityRole="button" accessibilityLabel={`明日から3日以内 ${expirySummary.soon}件`}
                accessibilityHint="明日から3日後が期限の食材だけを表示します。"
                accessibilityState={{ selected: expiryFilter === 'soon' }} aria-pressed={expiryFilter === 'soon'}
                onPress={() => showExpiryFilter('soon')}
                style={({ pressed }) => [styles.summaryCount, expiryFilter === 'soon' && styles.selectedSummaryCount, pressed && styles.summaryCountPressed]}>
                <Text style={styles.summaryLabel}>明日〜3日以内</Text>
                <Text style={styles.summaryNumber}>{expirySummary.soon}<Text style={styles.summaryUnit}> 件</Text></Text>
                <View style={styles.summaryLink}><Text style={styles.summaryLinkText}>食材を見る</Text><Ionicons name="chevron-forward" size={14} color={colors.primaryDark} /></View>
              </Pressable>
            </View>
            {!hasUrgentFoods ? <Text style={styles.summaryEmpty}>{expirySummary.expired > 0 ? '期限内で3日以内の食材はありません' : '期限が近い食材はありません'}</Text> : null}
            <Pressable
              accessibilityLabel={hasUrgentFoods ? '期限が近い食材でレシピを探す' : 'レシピを見る'}
              accessibilityRole="button"
              onPress={() => navigation.navigate('Recipes', { initialFilter: hasUrgentFoods ? 'urgent' : 'all' })}
              style={({ pressed }) => [styles.recipeButton, pressed && styles.recipeButtonPressed]}
            >
              <Ionicons color={colors.surface} name="restaurant-outline" size={18} />
              <Text style={styles.recipeButtonText}>{hasUrgentFoods ? 'この食材でレシピを探す' : 'レシピを見る'}</Text>
              <Ionicons color={colors.surface} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textMuted} name="search" size={19} />
            <TextInput
              accessibilityLabel="食材を検索"
              onChangeText={setQuery}
              placeholder="食材を検索"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <Pressable
            accessibilityLabel="バーコード登録"
            accessibilityRole="button"
            onPress={() => navigation.navigate('Barcode')}
            style={styles.squareButton}
          >
            <Ionicons color={colors.text} name="barcode-outline" size={25} />
          </Pressable>
          <MotionIconButton
            accessibilityLabel="食材を追加"
            onPress={() => navigation.navigate('AddFood')}
            size={27}
            style={[styles.squareButton, styles.addButton]}
          />
        </View>

        {expiryFilter !== 'all' ? <Pressable accessibilityRole="button" accessibilityLabel="絞り込みを解除してすべての食材を表示"
          onPress={() => showExpiryFilter('all')} style={[styles.filterNotice, expiryFilter === 'expired' && styles.expiredNotice]}>
          <Text style={[styles.filterTitle, expiryFilter === 'expired' && styles.expiredTitle]}>{expiryFilterLabels[expiryFilter]}のみ表示中 · すべての食材に戻す</Text>
          <Ionicons name="close-circle-outline" size={20} color={expiryFilter === 'expired' ? colors.danger : colors.primaryDark} />
        </Pressable> : null}

        <View style={styles.viewModeTabs}>
          <View style={styles.viewModeRow} onLayout={(event) => setViewModeWidth(event.nativeEvent.layout.width / viewModeOptions.length)}>
          <SelectionHighlight index={viewModeOptions.findIndex((option) => option.key === viewMode)} width={viewModeWidth} />
          {viewModeOptions.map((option) => {
            const selected = viewMode === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }} aria-pressed={selected}
                key={option.key}
                onPress={() => setViewMode(option.key)}
                style={styles.viewModeTab}
              >
                <Text style={[styles.viewModeText, selected && styles.selectedViewModeText]}>{option.label}</Text>
              </Pressable>
            );
          })}
          </View>
        </View>

        {activeFoods.length > 0 && showSwipeGuide ? (
          <View style={styles.swipeHint}>
            <Ionicons color={colors.primary} name="swap-horizontal-outline" size={18} />
            <Text style={styles.swipeHintText}>
              {'左へスワイプ：使い切った\n右へスワイプ：捨てた'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="スワイプ操作の案内を閉じる"
              onPress={dismissSwipeGuide} style={styles.swipeHintClose}>
              <Ionicons color={colors.textMuted} name="close" size={20} />
            </Pressable>
          </View>
        ) : null}

        {activeFoods.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.primary} name="leaf-outline" size={48} />
            <Text style={styles.emptyTitle}>食材を登録してみましょう</Text>
            <Text style={styles.emptyText}>期限が近い食材をここで確認できます。</Text>
            <View style={styles.emptyActions}>
              <PrimaryButton icon="add-outline" label="食材を登録" onPress={() => navigation.navigate('AddFood')} />
              <PrimaryButton icon="barcode-outline" label="バーコードで登録" onPress={() => navigation.navigate('Barcode')} variant="outline" />
            </View>
          </View>
        ) : null}

        {activeFoods.length > 0 && sections.every((section) => section.foods.length === 0) ? (
          <Text accessibilityLiveRegion="polite" style={styles.noResults}>{query.trim()
            ? `「${query}」に一致する食材はありません。`
            : expiryFilter !== 'all' ? `「${expiryFilterLabels[expiryFilter]}」の食材はありません。` : '食材はありません。'}</Text>
        ) : null}
        </>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  expiredNotice: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, marginTop: spacing.sm, gap: 6 },
  expiredTitle: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  expiredHint: { color: colors.text, fontSize: 13, lineHeight: 20 },
  expirySummary: { backgroundColor: colors.primarySoft, borderRadius: radius.md, marginBottom: spacing.md, padding: spacing.md },
  summaryHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  summaryScope: { color: colors.primaryDark, fontSize: 12 },
  summaryCounts: { alignItems: 'center', flexDirection: 'row', marginVertical: 12 },
  summaryCount: { flex: 1, minHeight: 88, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent', padding: spacing.sm },
  selectedSummaryCount: { backgroundColor: colors.surface, borderColor: colors.primary },
  summaryCountPressed: { opacity: 0.7 },
  summaryLink: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  summaryLinkText: { color: colors.primaryDark, fontSize: 12, fontWeight: '600' },
  summaryLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '600' },
  summaryNumber: { color: colors.text, fontSize: 28, fontWeight: '800', lineHeight: 36 },
  summaryUnit: { fontSize: 14, fontWeight: '500' },
  summaryDivider: { alignSelf: 'stretch', backgroundColor: '#CBE4D0', marginHorizontal: spacing.sm, width: 1 },
  filterNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primarySoft,
    borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  filterTitle: { flex: 1, color: colors.primaryDark, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  summaryEmpty: { color: colors.primaryDark, fontSize: 13, marginBottom: 12 },
  recipeButton: { alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  recipeButtonPressed: { opacity: 0.8 },
  recipeButtonText: { color: colors.surface, flex: 1, fontSize: 14, fontWeight: '700' },
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
  viewModeTabs: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: spacing.sm, padding: 3 },
  viewModeRow: { flexDirection: 'row' },
  viewModeTab: { alignItems: 'center', borderRadius: 7, flex: 1, justifyContent: 'center', minHeight: 44, paddingVertical: 6 },
  viewModeText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  selectedViewModeText: { color: colors.primaryDark },
  swipeHint: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.sm, marginBottom: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.xs, paddingVertical: spacing.xs },
  swipeHintText: { color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 20 },
  swipeHintClose: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  list: { gap: spacing.sm },
  empty: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 70 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  emptyText: { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  emptyActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  noResults: { color: colors.textMuted, paddingVertical: 60, textAlign: 'center' },
});
