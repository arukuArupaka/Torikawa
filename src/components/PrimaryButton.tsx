import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled = false,
  style,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          color={variant === 'primary' ? colors.surface : variant === 'danger' ? colors.danger : colors.primary}
          name={icon}
          size={19}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          variant === 'outline' && styles.outlineLabel,
          variant === 'danger' && styles.dangerLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  outline: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  label: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  outlineLabel: { color: colors.primary },
  dangerLabel: { color: colors.danger },
});
