import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { FoodItem } from '../types';
import { formatDateJa, toDateString } from '../utils/date';

type Props = NativeStackScreenProps<RootStackParamList, 'Statistics'>;

const CHART_SIZE = 150;
const CHART_STROKE = 22;
const CHART_RADIUS = (CHART_SIZE - CHART_STROKE) / 2;
const CHART_CIRCUMFERENCE = 2 * Math.PI * CHART_RADIUS;

type StatsPeriod = 'current' | 'previous' | 'all';

const periodOptions: { key: StatsPeriod; label: string }[] = [
  { key: 'current', label: '今月' },
  { key: 'previous', label: '先月' },
  { key: 'all', label: '全期間' },
];

function getMonthKey(date: Date): string {
  return toDateString(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7);
}

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(year, month - 2, 1));
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}年${month}月`;
}

function getRecordDate(food: FoodItem): string | null {
  if (food.status === 'used') return food.usedAt;
  if (food.status === 'disposed') return food.disposedAt;
  return null;
}

export function StatisticsScreen({ navigation }: Props) {
  const { addShoppingItem, foods, restoreFood, shoppingItems } = useAppData();
  const [period, setPeriod] = useState<StatsPeriod>('current');
  const currentMonth = getMonthKey(new Date());
  const previousMonth = getPreviousMonthKey(currentMonth);
  const selectedMonth = period === 'current' ? currentMonth : period === 'previous' ? previousMonth : null;
  const periodLabel = period === 'all' ? '全期間' : period === 'current' ? '今月' : '先月';
  const periodSubtitle = selectedMonth ? formatMonthLabel(selectedMonth) : '全期間';

  const usedFoods = useMemo(
    () => foods.filter((food) =>
      food.status === 'used' && (!selectedMonth || food.usedAt?.startsWith(selectedMonth)),
    ),
    [foods, selectedMonth],
  );
  const disposedFoods = useMemo(
    () => foods.filter((food) =>
      food.status === 'disposed' && (!selectedMonth || food.disposedAt?.startsWith(selectedMonth)),
    ),
    [foods, selectedMonth],
  );
  const total = usedFoods.length + disposedFoods.length;
  const lossRate = total === 0 ? 0 : (disposedFoods.length / total) * 100;
  const usedRate = total === 0 ? 0 : (usedFoods.length / total) * 100;
  const history = useMemo(
    () => [...usedFoods, ...disposedFoods].sort((a, b) =>
      (getRecordDate(b) ?? '').localeCompare(getRecordDate(a) ?? ''),
    ),
    [disposedFoods, usedFoods],
  );
  const disposedRanking = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    disposedFoods.forEach((food) => {
        const name = food.name.trim();
        const key = name.toLocaleLowerCase('ja-JP');
        const current = counts.get(key);
        counts.set(key, { name: current?.name ?? name, count: (current?.count ?? 0) + 1 });
      });

    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
      .slice(0, 5);
  }, [disposedFoods]);
  const comparison = useMemo(() => {
    if (!selectedMonth) return null;

    const comparisonMonth = getPreviousMonthKey(selectedMonth);
    const comparisonUsed = foods.filter(
      (food) => food.status === 'used' && food.usedAt?.startsWith(comparisonMonth),
    ).length;
    const comparisonDisposed = foods.filter(
      (food) => food.status === 'disposed' && food.disposedAt?.startsWith(comparisonMonth),
    ).length;
    const comparisonTotal = comparisonUsed + comparisonDisposed;

    if (total === 0 || comparisonTotal === 0) {
      return { available: false as const, comparisonMonth };
    }

    const previousRate = (comparisonDisposed / comparisonTotal) * 100;
    return {
      available: true as const,
      comparisonMonth,
      difference: lossRate - previousRate,
    };
  }, [foods, lossRate, selectedMonth, total]);

  const confirmRestore = (food: FoodItem) => {
    Alert.alert('記録を取り消す', `「${food.name}」を管理中に戻しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '管理中に戻す', onPress: () => restoreFood(food.id) },
    ]);
  };

  const confirmAddToShoppingList = (name: string) => {
    const alreadyAdded = isPendingShoppingItem(name);
    if (alreadyAdded) {
      Alert.alert('追加済みです', `「${name}」は未完了の買い物リストにあります。`);
      return;
    }

    Alert.alert(
      '買い物リストに追加',
      `「${name}」を次回は少なめに買う項目として追加しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '追加する',
          onPress: () => addShoppingItem(name, '次回は少なめに買う'),
        },
      ],
    );
  };

  const isPendingShoppingItem = (name: string) => shoppingItems.some(
    (item) => !item.checked
      && item.name.trim().toLocaleLowerCase('ja-JP') === name.trim().toLocaleLowerCase('ja-JP'),
  );

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} subtitle={periodSubtitle} title="食材ロス統計" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.periodTabs}>
          {periodOptions.map((option) => {
            const selected = period === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.key}
                onPress={() => setPeriod(option.key)}
                style={[styles.periodTab, selected && styles.selectedPeriodTab]}
              >
                <Text style={[styles.periodTabText, selected && styles.selectedPeriodTabText]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard
            color={colors.primary}
            icon="checkmark-circle-outline"
            label={`${periodLabel}使い切った`}
            value={usedFoods.length}
          />
          <SummaryCard
            color={colors.danger}
            icon="trash-bin-outline"
            label={`${periodLabel}捨てた`}
            value={disposedFoods.length}
          />
        </View>

        <View style={styles.rateCard}>
          <View style={styles.rateHeader}>
            <View>
              <Text style={styles.rateLabel}>食材ロス率</Text>
              <Text style={styles.rateNote}>捨てた数 ÷ 記録した合計</Text>
            </View>
            <Text style={styles.rateValue}>{lossRate.toFixed(1)}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.progress, { width: `${Math.min(lossRate, 100)}%` }]} />
          </View>
          {comparison ? (
            comparison.available ? (
              <View style={styles.comparisonRow}>
                <Ionicons
                  color={comparison.difference === 0 ? colors.textMuted : comparison.difference < 0 ? colors.primary : colors.danger}
                  name={comparison.difference === 0 ? 'remove-outline' : comparison.difference < 0 ? 'trending-down-outline' : 'trending-up-outline'}
                  size={18}
                />
                <Text
                  style={[
                    styles.comparisonText,
                    { color: comparison.difference === 0 ? colors.textMuted : comparison.difference < 0 ? colors.primaryDark : colors.danger },
                  ]}
                >
                  前月比 {comparison.difference === 0
                    ? '変化なし'
                    : `${Math.abs(comparison.difference).toFixed(1)}ポイント${comparison.difference < 0 ? '改善' : '増加'}`}
                </Text>
              </View>
            ) : (
              <Text style={styles.comparisonUnavailable}>
                {formatMonthLabel(comparison.comparisonMonth)}との比較に必要な記録がありません
              </Text>
            )
          ) : null}
        </View>

        <View>
          <Text style={styles.sectionTitle}>{periodLabel}の使い切り・廃棄比率</Text>
          <View style={styles.chartCard}>
            <View style={styles.chartWrap}>
              <Svg height={CHART_SIZE} width={CHART_SIZE}>
                <Circle
                  cx={CHART_SIZE / 2}
                  cy={CHART_SIZE / 2}
                  fill="none"
                  r={CHART_RADIUS}
                  stroke={total === 0 ? colors.border : colors.primary}
                  strokeWidth={CHART_STROKE}
                />
                {disposedFoods.length > 0 ? (
                  <Circle
                    cx={CHART_SIZE / 2}
                    cy={CHART_SIZE / 2}
                    fill="none"
                    r={CHART_RADIUS}
                    rotation="-90"
                    origin={`${CHART_SIZE / 2}, ${CHART_SIZE / 2}`}
                    stroke={colors.danger}
                    strokeDasharray={`${CHART_CIRCUMFERENCE * (lossRate / 100)} ${CHART_CIRCUMFERENCE}`}
                    strokeLinecap="butt"
                    strokeWidth={CHART_STROKE}
                  />
                ) : null}
              </Svg>
              <View style={styles.chartCenter}>
                <Text style={styles.chartTotal}>{total}</Text>
                <Text style={styles.chartTotalLabel}>記録</Text>
              </View>
            </View>
            <View style={styles.legend}>
              <RatioLegend color={colors.primary} count={usedFoods.length} label="使い切った" rate={usedRate} />
              <RatioLegend color={colors.danger} count={disposedFoods.length} label="捨てた" rate={lossRate} />
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>よく捨てているもの</Text>
          <Text style={styles.sectionNote}>{periodLabel}の廃棄記録ランキング</Text>
          {disposedRanking.length === 0 ? (
            <View style={styles.rankingEmpty}>
              <Ionicons color={colors.textMuted} name="podium-outline" size={25} />
              <Text style={styles.rankingEmptyText}>廃棄記録はまだありません</Text>
            </View>
          ) : (
            <View style={styles.rankingCard}>
              {disposedRanking.map((item, index) => {
                const added = isPendingShoppingItem(item.name);
                return (
                <View key={item.name} style={[styles.rankingRow, index === disposedRanking.length - 1 && styles.lastRow]}>
                  <View style={[styles.rankBadge, index === 0 && styles.firstRankBadge]}>
                    <Text style={[styles.rankText, index === 0 && styles.firstRankText]}>{index + 1}</Text>
                  </View>
                  <View style={styles.rankingContent}>
                    <View style={styles.rankingHeader}>
                      <Text numberOfLines={1} style={styles.rankingName}>{item.name}</Text>
                      <Text style={styles.rankingCount}>{item.count}回</Text>
                    </View>
                    <View style={styles.rankingTrack}>
                      <View
                        style={[
                          styles.rankingProgress,
                          { width: `${(item.count / disposedRanking[0].count) * 100}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <Pressable
                    accessibilityLabel={`${item.name}を少なめに買う項目として追加`}
                    disabled={added}
                    onPress={() => confirmAddToShoppingList(item.name)}
                    style={({ pressed }) => [styles.shoppingButton, added && styles.addedButton, pressed && styles.pressed]}
                  >
                    <Ionicons
                      color={added ? colors.textMuted : colors.primary}
                      name={added ? 'checkmark-circle-outline' : 'basket-outline'}
                      size={15}
                    />
                    <Text style={[styles.shoppingButtonText, added && styles.addedButtonText]}>
                      {added ? '追加済み' : '少なめに買う'}
                    </Text>
                  </Pressable>
                </View>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <Text style={styles.sectionTitle}>{periodLabel}の記録</Text>
          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons color={colors.primary} name="leaf-outline" size={30} />
              <Text style={styles.emptyTitle}>{periodLabel}の記録はまだありません</Text>
              <Text style={styles.emptyText}>食材を使い切るか捨てると、ここに集計されます。</Text>
            </View>
          ) : (
            <View style={styles.historyCard}>
              {history.map((food, index) => {
                const recordDate = getRecordDate(food);
                const disposed = food.status === 'disposed';
                return (
                  <View key={food.id} style={[styles.historyRow, index === history.length - 1 && styles.lastRow]}>
                    <Pressable
                      onPress={() => navigation.navigate('FoodDetail', { foodId: food.id })}
                      style={({ pressed }) => [styles.historyMain, pressed && styles.pressed]}
                    >
                      <View style={[styles.recordIcon, disposed && styles.disposedIcon]}>
                        <Ionicons
                          color={disposed ? colors.danger : colors.primary}
                          name={disposed ? 'trash-bin-outline' : 'checkmark'}
                          size={19}
                        />
                      </View>
                      <View style={styles.historyText}>
                        <Text style={styles.foodName}>{food.name}</Text>
                        <Text style={[styles.recordMeta, disposed && styles.disposedText]}>
                          {disposed ? '捨てた' : '使い切った'}
                          {recordDate ? `・${formatDateJa(recordDate)}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${food.name}の記録を取り消す`}
                      hitSlop={8}
                      onPress={() => confirmRestore(food)}
                      style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.undoText}>取り消す</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function RatioLegend({
  color,
  count,
  label,
  rate,
}: {
  color: string;
  count: number;
  label: string;
  rate: number;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendText}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendCount}>{count}件</Text>
      </View>
      <Text style={styles.legendRate}>{rate.toFixed(1)}%</Text>
    </View>
  );
}

function SummaryCard({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons color={color} name={icon} size={25} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl },
  periodTabs: { backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', padding: 4 },
  periodTab: { alignItems: 'center', borderRadius: radius.sm, flex: 1, justifyContent: 'center', minHeight: 38 },
  selectedPeriodTab: { backgroundColor: colors.primary },
  periodTabText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  selectedPeriodTabText: { color: colors.surface },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flex: 1, padding: spacing.md },
  summaryValue: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 5 },
  summaryLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  rateCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rateHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rateLabel: { color: colors.text, fontSize: 17, fontWeight: '800' },
  rateNote: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  rateValue: { color: colors.danger, fontSize: 28, fontWeight: '800' },
  track: { backgroundColor: colors.border, borderRadius: 6, height: 10, marginTop: spacing.md, overflow: 'hidden' },
  progress: { backgroundColor: colors.danger, borderRadius: 6, height: '100%' },
  comparisonRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 12 },
  comparisonText: { fontSize: 12, fontWeight: '700' },
  comparisonUnavailable: { color: colors.textMuted, fontSize: 11, marginTop: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  sectionNote: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm, marginTop: -4 },
  chartCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.lg, padding: spacing.md },
  chartWrap: { height: CHART_SIZE, position: 'relative', width: CHART_SIZE },
  chartCenter: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  chartTotal: { color: colors.text, fontSize: 28, fontWeight: '800' },
  chartTotalLabel: { color: colors.textMuted, fontSize: 11 },
  legend: { flex: 1, gap: spacing.md },
  legendRow: { alignItems: 'center', flexDirection: 'row' },
  legendDot: { borderRadius: 5, height: 10, marginRight: spacing.sm, width: 10 },
  legendText: { flex: 1 },
  legendLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  legendCount: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  legendRate: { color: colors.text, fontSize: 14, fontWeight: '800' },
  rankingCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  rankingRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 66 },
  rankBadge: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  firstRankBadge: { backgroundColor: colors.warningSoft },
  rankText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  firstRankText: { color: colors.warning },
  rankingContent: { flex: 1, marginLeft: 12 },
  rankingHeader: { alignItems: 'center', flexDirection: 'row' },
  rankingName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '700' },
  rankingCount: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  rankingTrack: { backgroundColor: colors.dangerSoft, borderRadius: 3, height: 5, marginTop: 7, overflow: 'hidden' },
  rankingProgress: { backgroundColor: colors.danger, borderRadius: 3, height: '100%' },
  shoppingButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, gap: 2, marginLeft: spacing.sm, paddingHorizontal: 7, paddingVertical: 6 },
  shoppingButtonText: { color: colors.primaryDark, fontSize: 9, fontWeight: '700' },
  addedButton: { backgroundColor: colors.background },
  addedButtonText: { color: colors.textMuted },
  rankingEmpty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  rankingEmptyText: { color: colors.textMuted, fontSize: 13 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: 12, marginTop: 5, textAlign: 'center' },
  historyCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  historyRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 72 },
  lastRow: { borderBottomWidth: 0 },
  historyMain: { alignItems: 'center', flex: 1, flexDirection: 'row', paddingVertical: 12 },
  recordIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 38, justifyContent: 'center', width: 38 },
  disposedIcon: { backgroundColor: colors.dangerSoft },
  historyText: { flex: 1, marginLeft: 11 },
  foodName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  recordMeta: { color: colors.primaryDark, fontSize: 11, marginTop: 4 },
  disposedText: { color: colors.danger },
  undoButton: { paddingHorizontal: spacing.sm, paddingVertical: 8 },
  undoText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
