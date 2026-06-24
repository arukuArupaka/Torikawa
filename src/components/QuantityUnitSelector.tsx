import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { FoodQuantityUnit } from '../types';
import { foodQuantityUnitOptions } from '../utils/foodQuantity';

export function QuantityUnitSelector({
  value,
  onChange,
}: {
  value: FoodQuantityUnit;
  onChange: (value: FoodQuantityUnit) => void;
}) {
  return (
    <View style={styles.options}>
      {foodQuantityUnitOptions.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
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
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  selectedLabel: { color: colors.primaryDark },
});
