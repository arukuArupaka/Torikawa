import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { usePressMotion } from '../hooks/usePressMotion';

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
  const { scale, onPressIn, onPressOut } = usePressMotion(disabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.touchTarget,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Animated.View pointerEvents="none" style={[
        styles.base,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        { transform: [{ scale }] },
      ]}>
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
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: { minHeight: 50 },
  base: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  outline: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  label: { color: colors.surface, flexShrink: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  outlineLabel: { color: colors.primary },
  dangerLabel: { color: colors.danger },
});
