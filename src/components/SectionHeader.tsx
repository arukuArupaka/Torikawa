import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export function SectionHeader({
  title,
  count,
  tone = 'green',
}: {
  title: string;
  count: number;
  tone?: 'red' | 'orange' | 'green' | 'blue';
}) {
  const tint = tone === 'red'
    ? colors.danger
    : tone === 'orange'
      ? colors.warning
      : tone === 'blue'
        ? colors.frozen
        : colors.primary;
  return (
    <View style={styles.row}>
      <View style={[styles.marker, { backgroundColor: tint }]} />
      <Text style={[styles.title, { color: tint }]}>{title}</Text>
      <View style={[styles.badge, { backgroundColor: `${tint}18` }]}>
        <Text style={[styles.count, { color: tint }]}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.sm, marginTop: spacing.md },
  marker: { borderRadius: radius.sm, height: 16, marginRight: spacing.sm, width: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  badge: { borderRadius: 20, marginLeft: spacing.sm, paddingHorizontal: 8, paddingVertical: 2 },
  count: { fontSize: 12, fontWeight: '800' },
});
