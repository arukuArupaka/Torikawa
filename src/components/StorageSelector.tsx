import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { StorageLocation } from '../types';

const options: { value: StorageLocation; label: string }[] = [
  { value: 'refrigerated', label: '冷蔵' },
  { value: 'frozen', label: '冷凍' },
  { value: 'room', label: '常温' },
];

export function StorageSelector({
  value,
  onChange,
}: {
  value: StorageLocation;
  onChange: (value: StorageLocation) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  label: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  selectedLabel: { color: colors.primaryDark },
});
