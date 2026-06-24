import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { FoodStatus, StorageLocation } from '../types';
import { daysUntil, formatDateJa, getRemainingLabel } from '../utils/date';
import { foodCategoryLabels } from '../utils/foodCategory';
import { formatFoodQuantity } from '../utils/foodQuantity';
import { getFoodDisplayName, getFoodIngredientName } from '../utils/ingredientNormalizer';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodDetail'>;

const storageLabels: Record<StorageLocation, string> = {
  refrigerated: '冷蔵',
  frozen: '冷凍',
  room: '常温',
};

const statusLabels: Record<FoodStatus, string> = {
  active: '管理中',
  used: '使い切った',
  disposed: '捨てた',
};

export function FoodDetailScreen({ navigation, route }: Props) {
  const { foods, deleteFood, markFoodDisposed, markFoodUsed, restoreFood } = useAppData();
  const food = foods.find((item) => item.id === route.params.foodId);

  if (!food) {
    return (
      <Screen>
        <ScreenHeader onBack={navigation.goBack} title="食材の詳細" />
        <View style={styles.missing}>
          <Text style={styles.missingText}>この食材は削除されています。</Text>
        </View>
      </Screen>
    );
  }

  const remaining = daysUntil(food.expiryDate);
  const displayName = getFoodDisplayName(food);
  const ingredientName = getFoodIngredientName(food);

  const returnHome = () => navigation.navigate('MainTabs', { screen: 'Home' });

  const confirmMarkUsed = () => {
    Alert.alert('使い切ったとして記録', 'この食材を使い切ったとして記録しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'OK',
        onPress: () => {
          markFoodUsed(food.id);
          returnHome();
        },
      },
    ]);
  };

  const confirmMarkDisposed = () => {
    Alert.alert('捨てたとして記録', 'この食材を捨てたとして記録しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: () => {
          markFoodDisposed(food.id);
          returnHome();
        },
      },
    ]);
  };

  const confirmRestore = () => {
    Alert.alert('記録を取り消す', 'この食材を管理中に戻しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '管理中に戻す',
        onPress: () => {
          restoreFood(food.id);
          returnHome();
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      '登録データを完全に削除',
      `「${displayName}」を完全に削除しますか？この操作は取り消せません。`,
      [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteFood(food.id);
          returnHome();
        },
      },
      ],
    );
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title="食材の詳細" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image source={{ uri: food.image }} style={styles.image} />
          <Text style={styles.name}>{displayName}</Text>
          {ingredientName !== displayName ? (
            <Text style={styles.ingredientName}>レシピ用分類：{ingredientName}</Text>
          ) : null}
          {food.status === 'active' ? (
            <View style={[styles.remainingBadge, remaining < 0 && styles.expiredBadge]}>
              <Text style={[styles.remaining, remaining < 0 && styles.expiredText]}>
                {getRemainingLabel(food.expiryDate)}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, food.status === 'disposed' && styles.disposedBadge]}>
              <Text style={[styles.statusText, food.status === 'disposed' && styles.disposedText]}>
                {statusLabels[food.status]}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          {food.productName ? <DetailRow icon="barcode-outline" label="商品名" value={food.productName} /> : null}
          <DetailRow icon="restaurant-outline" label="レシピ用分類" value={ingredientName} />
          <DetailRow icon="calendar-outline" label="期限日" value={formatDateJa(food.expiryDate)} />
          <DetailRow icon="pricetag-outline" label="カテゴリ" value={foodCategoryLabels[food.category]} />
          <DetailRow icon="pricetags-outline" label="タグ" value={food.tags.length > 0 ? food.tags.join('、') : 'タグはありません'} />
          <DetailRow icon="snow-outline" label="保存場所" value={storageLabels[food.storage]} />
          <DetailRow icon="cube-outline" label="残量" value={formatFoodQuantity(food.quantity, food.quantityUnit)} />
          <DetailRow icon="bag-handle-outline" label="購入日" value={formatDateJa(food.purchaseDate)} />
          <DetailRow icon="document-text-outline" label="メモ" value={food.memo || 'メモはありません'} last />
        </View>

        {food.status === 'active' ? (
          <>
            <PrimaryButton icon="checkmark-circle-outline" label="使い切った" onPress={confirmMarkUsed} />
            <PrimaryButton icon="trash-bin-outline" label="捨てた" onPress={confirmMarkDisposed} variant="danger" />
            <PrimaryButton
              icon="create-outline"
              label="この食材を編集"
              onPress={() => navigation.navigate('AddFood', { foodId: food.id })}
              variant="outline"
            />
          </>
        ) : (
          <PrimaryButton icon="arrow-undo-outline" label="記録を取り消す" onPress={confirmRestore} variant="outline" />
        )}
        <PrimaryButton label="登録データを完全に削除する" onPress={confirmDelete} variant="danger" />
      </ScrollView>
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && styles.lastRow]}>
      <View style={styles.detailLabel}>
        <Ionicons color={colors.primary} name={icon} size={20} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  image: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 132, width: 132 },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: spacing.md },
  ingredientName: { color: colors.primaryDark, fontSize: 13, fontWeight: '700', marginTop: 6 },
  remainingBadge: { backgroundColor: colors.warningSoft, borderRadius: 20, marginTop: spacing.sm, paddingHorizontal: 14, paddingVertical: 6 },
  expiredBadge: { backgroundColor: colors.dangerSoft },
  remaining: { color: colors.warning, fontWeight: '800' },
  expiredText: { color: colors.danger },
  statusBadge: { backgroundColor: colors.primarySoft, borderRadius: 20, marginTop: spacing.sm, paddingHorizontal: 14, paddingVertical: 6 },
  disposedBadge: { backgroundColor: colors.dangerSoft },
  statusText: { color: colors.primaryDark, fontWeight: '800' },
  disposedText: { color: colors.danger },
  infoCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  detailRow: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 17 },
  lastRow: { borderBottomWidth: 0 },
  detailLabel: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: 28, marginTop: 7 },
  missing: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  missingText: { color: colors.textMuted },
});
