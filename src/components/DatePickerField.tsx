import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { formatDateJa, parseDate, toDateString } from '../utils/date';

export function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showPicker, setShowPicker] = React.useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'set' && date) onChange(toDateString(date));
  };

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setShowPicker(true)} style={styles.input}>
        <Text style={styles.value}>{formatDateJa(value)}</Text>
        <Ionicons color={colors.primary} name="calendar-outline" size={21} />
      </Pressable>
      {showPicker ? (
        <View style={styles.pickerArea}>
          <DateTimePicker
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            locale="ja-JP"
            mode="date"
            onChange={handleChange}
            value={parseDate(value)}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setShowPicker(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>決定</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  value: { color: colors.text, fontSize: 16 },
  pickerArea: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', padding: spacing.sm },
  closeButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: 11 },
  closeText: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
});
