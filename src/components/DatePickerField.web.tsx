import { createElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';
import { isValidDateString } from '../utils/date';

export function DatePickerField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {createElement('input', {
        type: 'date', 'aria-label': label, value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          if (isValidDateString(event.target.value)) onChange(event.target.value);
        },
        style: {
          backgroundColor: colors.surface, color: colors.text, border: `1px solid ${colors.border}`,
          borderRadius: radius.sm, minHeight: 48, padding: '0 14px', font: 'inherit',
          fontSize: 16, width: '100%', boxSizing: 'border-box',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
