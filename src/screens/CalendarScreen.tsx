import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FoodCard } from '../components/FoodCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { daysUntil, parseDate, toDateString } from '../utils/date';
import { getFoodDisplayName } from '../utils/ingredientNormalizer';

const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Calendar'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function CalendarScreen({ navigation }: Props) {
  const { foods, updateFood } = useAppData();
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateString(new Date()));
  const [movingFoodId, setMovingFoodId] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstWeekDay).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [visibleMonth]);

  const activeFoods = useMemo(() => foods.filter((food) => food.status === 'active'), [foods]);

  const upcoming = [...activeFoods]
    .filter((food) => daysUntil(food.expiryDate) >= 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 5);

  const selectedFoods = useMemo(
    () => activeFoods
      .filter((food) => food.expiryDate === selectedDate)
      .sort((a, b) => getFoodDisplayName(a).localeCompare(getFoodDisplayName(b), 'ja')),
    [activeFoods, selectedDate],
  );
  const movingFood = activeFoods.find((food) => food.id === movingFoodId);

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelectedDate(null);
  };

  const selectDate = (dateString: string) => {
    if (!movingFood) {
      setSelectedDate((current) => current === dateString ? null : dateString);
      return;
    }

    if (movingFood.expiryDate === dateString) {
      setMovingFoodId(null);
      setSelectedDate(dateString);
      return;
    }

    const date = parseDate(dateString);
    const displayName = getFoodDisplayName(movingFood);
    Alert.alert(
      '期限日を変更',
      `「${displayName}」の期限を${date.getMonth() + 1}月${date.getDate()}日に変更しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更する',
          onPress: () => {
            const { id, createdAt, ...input } = movingFood;
            updateFood(id, { ...input, expiryDate: dateString });
            setMovingFoodId(null);
            setSelectedDate(dateString);
          },
        },
      ],
    );
  };

  const selectedDateLabel = selectedDate
    ? (() => {
        const date = parseDate(selectedDate);
        return `${date.getMonth() + 1}月${date.getDate()}日（${weekDays[date.getDay()]}）の期限`;
      })()
    : '';

  return (
    <Screen>
      <ScreenHeader title="カレンダー" />
      <ScrollView contentContainerStyle={styles.content}>
        {movingFood ? (
          <View style={styles.movingBanner}>
            <Ionicons color={colors.primary} name="calendar-outline" size={23} />
            <View style={styles.movingBannerText}>
              <Text style={styles.movingTitle}>「{getFoodDisplayName(movingFood)}」の移動先を選択</Text>
              <Text style={styles.movingDescription}>新しい期限日をカレンダーからタップしてください。</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => setMovingFoodId(null)}>
              <Ionicons color={colors.textMuted} name="close" size={23} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable hitSlop={12} onPress={() => changeMonth(-1)}>
              <Ionicons color={colors.text} name="chevron-back" size={24} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月
            </Text>
            <Pressable hitSlop={12} onPress={() => changeMonth(1)}>
              <Ionicons color={colors.text} name="chevron-forward" size={24} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((day, index) => (
              <Text key={day} style={[styles.weekDay, index === 0 && styles.sunday, index === 6 && styles.saturday]}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {calendarDays.map((day, index) => {
              const dateString = day
                ? toDateString(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day))
                : '';
              const dayFoods = day ? activeFoods.filter((food) => food.expiryDate === dateString) : [];
              const isToday = dateString === toDateString(new Date());
              const isSelected = dateString === selectedDate;
              return (
                <View key={`${day ?? 'empty'}-${index}`} style={styles.dayCellSlot}>
                  {day ? (
                    <Pressable
                      accessibilityLabel={`${visibleMonth.getMonth() + 1}月${day}日、期限の食材${dayFoods.length}件`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => selectDate(dateString)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        isSelected && styles.selectedDayCell,
                        movingFood && styles.movingDayCell,
                        pressed && styles.pressedDayCell,
                      ]}
                    >
                      <View style={[styles.dayNumberWrap, isToday && styles.todayCircle]}>
                        <Text style={[styles.dayNumber, isToday && styles.todayText]}>{day}</Text>
                      </View>
                      {dayFoods.slice(0, 2).map((food) => (
                        <View key={food.id} style={styles.foodLabel}>
                          <Text numberOfLines={1} style={styles.foodLabelText}>{getFoodDisplayName(food)}</Text>
                        </View>
                      ))}
                      {dayFoods.length > 2 ? <Text style={styles.more}>+{dayFoods.length - 2}</Text> : null}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {selectedDate ? (
          <View>
            <View style={styles.selectedSectionHeader}>
              <Text style={styles.sectionTitle}>{selectedDateLabel}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{selectedFoods.length}件</Text>
              </View>
            </View>
            {selectedFoods.length > 0 ? (
              <View style={styles.selectedFoodList}>
                {selectedFoods.map((food) => (
                  <View key={food.id} style={styles.selectedFoodGroup}>
                    <FoodCard
                      food={food}
                      onPress={() => navigation.navigate('FoodDetail', { foodId: food.id })}
                    />
                    <Pressable
                      accessibilityLabel={`${getFoodDisplayName(food)}の期限日を変更`}
                      accessibilityRole="button"
                      onPress={() => setMovingFoodId(food.id)}
                      style={styles.moveButton}
                    >
                      <Ionicons color={colors.primary} name="calendar-outline" size={17} />
                      <Text style={styles.moveButtonText}>期限日を変更</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.selectedEmptyCard}>
                <Ionicons color={colors.primary} name="checkmark-circle-outline" size={28} />
                <Text style={styles.selectedEmptyText}>この日に期限を迎える食材はありません。</Text>
              </View>
            )}
            {!movingFood ? (
              <PrimaryButton
                icon="add"
                label="この日を期限にして食材を追加"
                onPress={() => navigation.navigate('AddFood', { initialExpiryDate: selectedDate })}
                style={styles.addForDateButton}
                variant="outline"
              />
            ) : null}
          </View>
        ) : null}

        <View>
          <Text style={[styles.sectionTitle, styles.upcomingTitle]}>近日の予定</Text>
          <View style={styles.upcomingCard}>
            {upcoming.length === 0 ? (
              <Text style={styles.empty}>近日中に期限を迎える食材はありません。</Text>
            ) : (
              upcoming.map((food, index) => {
                const date = parseDate(food.expiryDate);
                return (
                  <View key={food.id} style={[styles.upcomingRow, index === upcoming.length - 1 && styles.lastRow]}>
                    <View style={styles.dateBadge}>
                      <Text style={styles.dateMonth}>{date.getMonth() + 1}月</Text>
                      <Text style={styles.dateDay}>{date.getDate()}</Text>
                    </View>
                    <View style={styles.upcomingText}>
                      <Text style={styles.foodName}>{getFoodDisplayName(food)}の期限</Text>
                      <Text style={styles.remaining}>あと{daysUntil(food.expiryDate)}日</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl },
  movingBanner: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', padding: 13 },
  movingBannerText: { flex: 1, marginHorizontal: spacing.sm },
  movingTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  movingDescription: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  calendarCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekDay: { color: colors.textMuted, flex: 1, fontSize: 12, fontWeight: '700', paddingBottom: spacing.sm, textAlign: 'center' },
  sunday: { color: colors.danger },
  saturday: { color: colors.frozen },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCellSlot: { minHeight: 74, padding: 1, width: '14.285%' },
  dayCell: { alignItems: 'center', borderColor: 'transparent', borderRadius: radius.sm, borderWidth: 1, flex: 1, paddingHorizontal: 1, paddingTop: 3 },
  selectedDayCell: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  movingDayCell: { borderColor: colors.primary, borderStyle: 'dashed' },
  pressedDayCell: { opacity: 0.65 },
  dayNumberWrap: { alignItems: 'center', borderRadius: 20, height: 25, justifyContent: 'center', width: 25 },
  todayCircle: { backgroundColor: colors.primary },
  dayNumber: { color: colors.text, fontSize: 12 },
  todayText: { color: colors.surface, fontWeight: '800' },
  foodLabel: { backgroundColor: colors.primarySoft, borderRadius: 4, marginTop: 2, maxWidth: '100%', paddingHorizontal: 3, paddingVertical: 2 },
  foodLabelText: { color: colors.primaryDark, fontSize: 8, fontWeight: '700' },
  more: { color: colors.textMuted, fontSize: 8 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  selectedSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  countBadge: { backgroundColor: colors.primarySoft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  selectedFoodList: { gap: spacing.sm },
  selectedFoodGroup: { gap: spacing.xs },
  moveButton: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  moveButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  selectedEmptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  selectedEmptyText: { color: colors.textMuted, flex: 1, fontSize: 14 },
  addForDateButton: { marginTop: spacing.sm },
  upcomingTitle: { marginBottom: spacing.sm },
  upcomingCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  upcomingRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 13 },
  lastRow: { borderBottomWidth: 0 },
  dateBadge: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  dateMonth: { color: colors.primaryDark, fontSize: 10, fontWeight: '700' },
  dateDay: { color: colors.primaryDark, fontSize: 18, fontWeight: '800' },
  upcomingText: { flex: 1, marginLeft: 13 },
  foodName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  remaining: { color: colors.warning, fontSize: 12, fontWeight: '700', marginTop: 3 },
  empty: { color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },
});
