import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';

type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  leftAction,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  leftAction?: HeaderAction;
  action?: HeaderAction;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable accessibilityLabel="戻る" hitSlop={12} onPress={onBack}>
            <Ionicons color={colors.text} name="chevron-back" size={26} />
          </Pressable>
        ) : leftAction ? (
          <Pressable accessibilityLabel={leftAction.label} hitSlop={10} onPress={leftAction.onPress}>
            <Ionicons color={colors.text} name={leftAction.icon} size={24} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.titleArea}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.side, styles.right]}>
        {action ? (
          <Pressable accessibilityLabel={action.label} hitSlop={10} onPress={action.onPress}>
            <Ionicons color={colors.text} name={action.icon} size={24} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  side: { width: 44 },
  right: { alignItems: 'flex-end' },
  titleArea: { alignItems: 'center', flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
