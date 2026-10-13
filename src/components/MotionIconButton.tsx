import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../constants/theme';
import { usePressMotion } from '../hooks/usePressMotion';

export function MotionIconButton({ accessibilityLabel, onPress, icon = 'add', size = 25, disabled = false, style }: {
  accessibilityLabel: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale, onPressIn, onPressOut } = usePressMotion(disabled);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onPressIn={onPressIn} onPressOut={onPressOut}
    style={({ pressed }) => [styles.touchTarget, pressed && styles.pressed]}>
    <Animated.View pointerEvents="none" style={[styles.visual, style, disabled && styles.disabled, { transform: [{ scale }] }]}>
      <Ionicons name={icon} size={size} color={colors.surface} />
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  touchTarget: { height: 50, width: 50 },
  visual: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: colors.primary, borderRadius: radius.md },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});
