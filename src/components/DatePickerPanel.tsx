import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../constants/theme';
import { useReducedMotion } from '../context/MotionPreferenceContext';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { formatDateJa, isValidDateString, parseDate, toDateString } from '../utils/date';
import { PrimaryButton } from './PrimaryButton';

const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

export function DatePickerPanel({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const today = useCurrentDay();
  const openRef = useRef(false);
  const sessionRef = useRef(0);
  const selectedDayRef = useRef<View>(null);
  const [editor, setEditor] = useState<{ original: string; selected: string; month: string; session: number } | null>(null);

  useEffect(() => {
    if (editor && editor.original !== value) {
      openRef.current = false;
      setEditor(null);
    }
  }, [value, editor?.original]);

  const close = () => { openRef.current = false; setEditor(null); };
  const open = () => {
    Keyboard.dismiss();
    const selected = isValidDateString(value) ? value : today;
    openRef.current = true;
    sessionRef.current += 1;
    setEditor({ original: value, selected, month: `${selected.slice(0, 7)}-01`, session: sessionRef.current });
  };
  const confirm = () => {
    if (!editor || !openRef.current || editor.session !== sessionRef.current || editor.original !== value) return;
    openRef.current = false;
    setEditor(null);
    if (editor.selected !== value) onChange(editor.selected);
  };
  const month = editor ? parseDate(editor.month) : null;
  const previousMonth = month ? toDateString(new Date(month.getFullYear(), month.getMonth() - 1, 1)) : '';
  const nextMonth = month ? toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 1)) : '';
  const monthDays = month ? new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() : 0;
  const moveMonth = (target: string) => {
    if (isValidDateString(target)) setEditor((current) => current && { ...current, month: target });
  };

  return <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}：${formatDateJa(value)}`}
      accessibilityHint="日付を選ぶパネルを開きます。" accessibilityState={{ expanded: Boolean(editor) }}
      onPress={open} style={styles.input}>
      <Text style={styles.value}>{formatDateJa(value)}</Text>
      <Ionicons color={colors.primary} name="calendar-outline" size={21} />
    </Pressable>
    {editor && month ? <Modal visible transparent presentationStyle="overFullScreen"
      animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close} onShow={() => selectedDayRef.current?.focus()}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="日付の選択をキャンセル" onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
          aria-modal={Platform.OS === 'web' ? true : undefined} accessibilityLabel={`${label}を選択`} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>{label}を選択</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${label}の選択を閉じる`} onPress={close} style={styles.iconButton}>
              <Ionicons name="close" size={23} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.calendar} keyboardShouldPersistTaps="handled">
            <Text accessibilityLiveRegion="polite" style={styles.selection}>選択中：{formatDateJa(editor.selected)}</Text>
            <View style={styles.monthHeading}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${label}の前の月`} disabled={!isValidDateString(previousMonth)}
                accessibilityState={{ disabled: !isValidDateString(previousMonth) }} onPress={() => moveMonth(previousMonth)} style={styles.iconButton}>
                <Ionicons name="chevron-back" size={23} color={colors.primaryDark} />
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.monthTitle}>{month.getFullYear()}年{month.getMonth() + 1}月</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${label}の次の月`} disabled={!isValidDateString(nextMonth)}
                accessibilityState={{ disabled: !isValidDateString(nextMonth) }} onPress={() => moveMonth(nextMonth)} style={styles.iconButton}>
                <Ionicons name="chevron-forward" size={23} color={colors.primaryDark} />
              </Pressable>
            </View>
            <View style={styles.weekRow}>{weekDays.map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}</View>
            <View style={styles.grid}>{Array.from({ length: 42 }, (_, index) => {
              const day = index - month.getDay() + 1;
              if (day < 1 || day > monthDays) return <View key={index} style={styles.daySlot} />;
              const date = `${editor.month.slice(0, 7)}-${String(day).padStart(2, '0')}`;
              const selected = date === editor.selected;
              const isToday = date === today;
              return <View key={index} style={styles.daySlot}>
                <Pressable ref={selected ? selectedDayRef : undefined} accessibilityRole="button" accessibilityLabel={`${formatDateJa(date)}${isToday ? '、今日' : ''}`}
                  accessibilityState={{ selected }} aria-pressed={selected}
                  onPress={() => setEditor((current) => current && { ...current, selected: date })}
                  style={({ pressed }) => [styles.day, isToday && styles.today, selected && styles.selectedDay, pressed && styles.pressed]}>
                  <Text style={[styles.dayText, selected && styles.selectedDayText]}>{day}</Text>
                </Pressable>
              </View>;
            })}</View>
            <Pressable accessibilityRole="button" accessibilityLabel="今日を選ぶ"
              onPress={() => setEditor((current) => current && { ...current, selected: today, month: `${today.slice(0, 7)}-01` })} style={styles.todayButton}>
              <Text style={styles.todayText}>今日を選ぶ</Text>
            </Pressable>
          </ScrollView>
          <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.action}><PrimaryButton label="キャンセル" variant="outline" onPress={close} /></View>
            <View style={styles.action}><PrimaryButton label="決定" icon="checkmark" onPress={confirm} /></View>
          </View>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm,
    borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14, gap: spacing.sm },
  value: { color: colors.text, fontSize: 16, flexShrink: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,32,26,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' },
  handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', flex: 1 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  calendar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  selection: { color: colors.primaryDark, fontSize: 15, fontWeight: '600', marginVertical: spacing.sm },
  monthHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  weekRow: { flexDirection: 'row', paddingVertical: spacing.sm },
  weekDay: { width: '14.285714%', textAlign: 'center', color: colors.textMuted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  daySlot: { width: '14.285714%', height: 48, padding: 2 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: radius.sm },
  today: { borderColor: colors.primary },
  selectedDay: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  selectedDayText: { color: colors.surface },
  pressed: { opacity: 0.7 },
  todayButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  todayText: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border },
  action: { flex: 1 },
});
