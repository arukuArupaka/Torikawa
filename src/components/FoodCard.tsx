import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import { FoodItem, StorageLocation } from '../types';
import { daysUntil, getRemainingLabel } from '../utils/date';
import { formatFoodQuantity } from '../utils/foodQuantity';

const storageLabels: Record<StorageLocation, string> = {
  refrigerated: '冷蔵',
  frozen: '冷凍',
  room: '常温',
};

export function FoodCard({
  food,
  onPress,
}: {
  food: FoodItem;
  onPress: () => void;
}) {
  const remaining = daysUntil(food.expiryDate);
  const urgencyColor = remaining < 0 ? colors.danger : remaining <= 3 ? colors.warning : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={{ uri: food.image }} style={styles.image} />
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.name}>{food.name}</Text>
        <Text style={[styles.remaining, { color: urgencyColor }]}>{getRemainingLabel(food.expiryDate)}</Text>
        <View style={styles.storageRow}>
          <Ionicons color={colors.textMuted} name="location-outline" size={14} />
          <Text style={styles.storage}>{storageLabels[food.storage]}</Text>
          <Text style={styles.metaDivider}>・</Text>
          <Ionicons color={colors.textMuted} name="cube-outline" size={14} />
          <Text style={styles.storage}>{formatFoodQuantity(food.quantity, food.quantityUnit)}</Text>
        </View>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 12,
  },
  pressed: { opacity: 0.7 },
  image: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 62, width: 62 },
  content: { flex: 1, marginLeft: 13 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  remaining: { fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  storageRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: 5 },
  storage: { color: colors.textMuted, fontSize: 12 },
  metaDivider: { color: colors.textMuted, fontSize: 12 },
});
