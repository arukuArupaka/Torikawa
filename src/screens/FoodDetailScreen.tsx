import { FoodImage } from '../components/FoodImage';
import { ProductAttribution } from '../components/ProductAttribution';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { useFoodStatusFeedback } from '../hooks/useFoodStatusFeedback';
import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { FormField } from '../components/FormField';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useAppToast } from '../context/AppToastContext';
import { useReducedMotion } from '../context/MotionPreferenceContext';
import { RootStackParamList } from '../navigation/types';
import { returnToMainTab } from '../navigation/returnToMainTab';
import { FoodItem, FoodQuantityUnit, FoodStatus, StorageLocation } from '../types';
import { assertStorageEpoch, getStorageEpoch } from '../services/storage';
import { daysUntil, formatDateJa, getRemainingLabel } from '../utils/date';
import { foodCategoryLabels } from '../utils/foodCategory';
import { foodQuantityUnitLabels, formatFoodQuantity, isValidQuantity, parseQuantityInput } from '../utils/foodQuantity';
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
  const alert = useAppAlert();
  const toast = useAppToast();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const statusFeedback = useFoodStatusFeedback();
  useCurrentDay();
  const { foods, recipes, addShoppingItem, deleteFood, markFoodDisposed, markFoodUsed, restoreFood, updateFoodQuantity } = useAppData();
  const food = foods.find((item) => item.id === route.params.foodId);
  const [historyFoodId, setHistoryFoodId] = useState<string | null>(null);
  const [quantityEditor, setQuantityEditor] = useState<{
    foodId: string; food: FoodItem; quantity: number; unit: FoodQuantityUnit; epoch: number;
  } | null>(null);
  const [quantityDraft, setQuantityDraft] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const quantityInput = useRef<TextInput>(null);
  const quantitySaveLock = useRef(false);
  useEffect(() => {
    if (quantityEditor && (!food || food.id !== quantityEditor.foodId || food.status !== 'active')) setQuantityEditor(null);
  }, [food?.id, food?.status, quantityEditor]);

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

  const openQuantityEditor = () => {
    quantitySaveLock.current = false;
    setQuantityDraft(String(food.quantity));
    setQuantityError('');
    setQuantityEditor({ foodId: food.id, food, quantity: food.quantity,
      unit: food.quantityUnit, epoch: getStorageEpoch() });
  };
  const closeQuantityEditor = () => { Keyboard.dismiss(); setQuantityEditor(null); };
  const saveQuantity = () => {
    if (!quantityEditor || quantitySaveLock.current) return;
    if (quantityDraft.trim() === String(quantityEditor.quantity)) { closeQuantityEditor(); return; }
    if (!isValidQuantity(quantityDraft)) {
      setQuantityError(quantityDraft.trim() !== '' && parseQuantityInput(quantityDraft) === 0
        ? '使い切った場合は、閉じて「使い切った」で記録してください。'
        : '0より大きく99999以下の数値を入力してください。小数は2桁まで使えます。');
      quantityInput.current?.focus();
      return;
    }
    try {
      assertStorageEpoch(quantityEditor.epoch);
      quantitySaveLock.current = true;
      const quantity = parseQuantityInput(quantityDraft);
      updateFoodQuantity(quantityEditor.foodId, quantity, quantityEditor.food, (undo) => {
        toast(`残量を${formatFoodQuantity(quantity, quantityEditor.unit)}に変更しました。`, {
          label: '元に戻す', hint: 'この食材の残量だけを戻します。',
          onPress: () => {
            if (!undo(() => toast('残量を元に戻しました。'))) toast('食材の内容が変わっています。現在の残量を確認してください。');
          },
        });
      });
      closeQuantityEditor();
    } catch (error) {
      quantitySaveLock.current = false;
      setQuantityError(error instanceof Error ? error.message : '残量を変更できませんでした。現在の内容を確認してください。');
    }
  };

  const returnHome = () => returnToMainTab(navigation);
  const addToShoppingList = () => {
    const added = addShoppingItem(displayName, '使い切った食材から追加');
    if (!added) {
      alert('追加済みです', `「${displayName}」は未完了の買い物リストにあります。`);
    }
  };

  const confirmMarkUsed = () => {
    alert('使い切ったとして記録', 'この食材を使い切ったとして記録しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '記録だけ',
        onPress: () => {
          markFoodUsed(food.id, statusFeedback(food, 'used'));
          returnHome();
        },
      },
      {
        text: '買い物リストにも追加',
        onPress: () => {
          markFoodUsed(food.id, statusFeedback(food, 'used', true));
          addToShoppingList();
          returnHome();
        },
      },
    ]);
  };

  const confirmMarkDisposed = () => {
    alert('捨てたとして記録', 'この食材を捨てたとして記録しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: () => {
          markFoodDisposed(food.id, statusFeedback(food, 'disposed'));
          returnHome();
        },
      },
    ]);
  };

  const confirmRestore = () => {
    alert('記録を取り消す', 'この食材を管理中に戻しますか？', [
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
    alert(
      '食材の登録を削除',
      `「${displayName}」を現在の一覧・履歴から削除します。\n\n端末の商品候補、復元前の退避データ、書き出したバックアップは残ります。参照されている写真も保持されます。`,
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
          <FoodImage source={{ uri: food.image }} style={styles.image} />
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
          {food.status === 'active' ? <Pressable accessibilityRole="button" accessibilityLabel="残量を変更"
            onPress={openQuantityEditor} style={styles.quantityShortcut}>
            <Ionicons name="cube-outline" size={19} color={colors.primaryDark} />
            <Text style={styles.quantityShortcutValue}>残量 {formatFoodQuantity(food.quantity, food.quantityUnit)}</Text>
            <Text style={styles.quantityChange}>変更</Text>
          </Pressable> : null}
        </View>

        {food.status === 'active' ? (
          <PrimaryButton icon="checkmark-circle-outline" label="使い切った" onPress={confirmMarkUsed} />
        ) : null}

        <ProductAttribution source={food.productSource} image={food.image} />
        <View style={styles.infoCard}>
          {food.productName ? <DetailRow icon="barcode-outline" label="商品名" value={food.productName} /> : null}
          <DetailRow icon="restaurant-outline" label="レシピ用分類" value={ingredientName} />
          <DetailRow icon="calendar-outline" label="期限日" value={formatDateJa(food.expiryDate)} />
          <DetailRow icon="pricetag-outline" label="カテゴリ" value={foodCategoryLabels[food.category]} />
          <DetailRow icon="pricetags-outline" label="タグ" value={food.tags.length > 0 ? food.tags.join('、') : 'タグはありません'} />
          <DetailRow icon="snow-outline" label="保存場所" value={storageLabels[food.storage]} />
          {food.status !== 'active' ? <DetailRow icon="cube-outline" label="残量" value={formatFoodQuantity(food.quantity, food.quantityUnit)} /> : null}
          <DetailRow icon="bag-handle-outline" label="購入日" value={formatDateJa(food.purchaseDate)} />
          <DetailRow icon="document-text-outline" label="メモ" value={food.memo || 'メモはありません'} last />
        </View>

        {food.consumptionHistory?.length ? (
          <View style={styles.infoCard}>
            <AnimatedDisclosure expanded={historyFoodId === food.id} header={<Pressable
              accessibilityRole="button" accessibilityLabel="調理での使用履歴"
              accessibilityState={{ expanded: historyFoodId === food.id }} aria-expanded={historyFoodId === food.id}
              onPress={() => setHistoryFoodId((current) => current === food.id ? null : food.id)} style={styles.historyToggle}>
              <Text style={styles.historyTitle}>調理での使用履歴</Text>
              <Text style={styles.historyCount}>{food.consumptionHistory.length}件</Text>
              <Ionicons name={historyFoodId === food.id ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primaryDark} />
            </Pressable>}>
            <Text style={styles.historyNote}>新しい順に表示しています。</Text>
            {[...food.consumptionHistory].reverse().map((entry, index) => (
              <DetailRow key={entry.operationId} icon="restaurant-outline"
                label={new Date(entry.recordedAt).toLocaleDateString('ja-JP')}
                value={`${recipes.find((recipe) => recipe.id === entry.recipeId)?.name ?? '削除済みレシピ'}：${formatFoodQuantity(entry.amount, entry.unit)}使用／当時の残量 ${formatFoodQuantity(entry.after, entry.unit)}`}
                last={index === food.consumptionHistory!.length - 1} />
            ))}
            </AnimatedDisclosure>
          </View>
        ) : null}

        {food.status === 'active' ? (
          <>
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
        <PrimaryButton icon="add-circle-outline" label="もう一度登録する" onPress={() => navigation.navigate('AddFood', { reuseFoodId: food.id })} variant="outline" />
        <PrimaryButton label="食材の登録を削除する" onPress={confirmDelete} variant="danger" />
      </ScrollView>
      {quantityEditor ? <Modal visible transparent presentationStyle="overFullScreen" animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={closeQuantityEditor} onShow={() => quantityInput.current?.focus()}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.quantityBackdrop}>
          <Pressable accessible={false} onPress={closeQuantityEditor} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined}
            aria-modal={Platform.OS === 'web' ? true : undefined} accessibilityLabel="残量を変更" style={styles.quantitySheet}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quantitySheetContent} style={styles.sheetScroll}>
              <View style={styles.sheetHeading}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>残量を変更</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="残量の変更を閉じる" onPress={closeQuantityEditor} style={styles.sheetClose}>
                  <Ionicons name="close" size={23} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.sheetFoodName}>{displayName}</Text>
              <Text style={styles.sheetDescription}>今ある量を入力してください。</Text>
              <Text style={styles.quantityBefore}>変更前：{formatFoodQuantity(quantityEditor.quantity, quantityEditor.unit)}</Text>
              <FormField label="変更後の残量">
                <View style={styles.quantityInputRow}>
                  <TextInput ref={quantityInput} autoFocus selectTextOnFocus accessibilityLabel="変更後の残量"
                    accessibilityHint={quantityError || `${foodQuantityUnitLabels[quantityEditor.unit]}単位で残っている量を入力します。`}
                    keyboardType="decimal-pad" returnKeyType="done" maxLength={8}
                    value={quantityDraft} onChangeText={(value) => { setQuantityDraft(value); setQuantityError(''); }}
                    onSubmitEditing={saveQuantity} style={[styles.quantityInput, Boolean(quantityError) && styles.quantityInputError]} />
                  <Text style={styles.quantityUnit}>{foodQuantityUnitLabels[quantityEditor.unit]}</Text>
                </View>
              </FormField>
              {quantityError ? <Text accessibilityRole="alert" style={styles.quantityValidationError}>{quantityError}</Text> : null}
              {isValidQuantity(quantityDraft) ? <Text accessibilityLiveRegion="polite" style={styles.quantityPreview}>
                保存後：{formatFoodQuantity(parseQuantityInput(quantityDraft), quantityEditor.unit)}
              </Text> : null}
            </ScrollView>
            <View style={[styles.quantityActions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
              <View style={styles.quantityAction}><PrimaryButton label="キャンセル" variant="outline" onPress={closeQuantityEditor} /></View>
              <View style={styles.quantityAction}><PrimaryButton label="残量を保存" icon="checkmark" onPress={saveQuantity} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal> : null}
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
  quantityShortcut: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md,
    backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: '100%' },
  quantityShortcutValue: { color: colors.primaryDark, fontSize: 16, fontWeight: '700', flex: 1 },
  quantityChange: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  quantityBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,32,26,0.45)' },
  quantitySheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    maxHeight: '85%', width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden' },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  sheetScroll: { flexShrink: 1 },
  quantitySheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: '800', flexShrink: 1 },
  sheetClose: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  sheetFoodName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sheetDescription: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  quantityBefore: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  quantityInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quantityInput: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    backgroundColor: colors.background, color: colors.text, fontSize: 22, paddingHorizontal: 14, paddingVertical: 10 },
  quantityInputError: { borderColor: colors.danger },
  quantityValidationError: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  quantityUnit: { color: colors.text, fontSize: 18, fontWeight: '700', minWidth: 32 },
  quantityPreview: { color: colors.primaryDark, fontSize: 14, lineHeight: 21 },
  quantityActions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border },
  quantityAction: { flex: 1 },
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
  historyToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  historyTitle: { flex: 1, color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  historyCount: { color: colors.textMuted, fontSize: 13 },
  historyNote: { color: colors.textMuted, fontSize: 12, paddingTop: spacing.sm },
  detailRow: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 17 },
  lastRow: { borderBottomWidth: 0 },
  detailLabel: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', marginLeft: 28, marginTop: 7 },
  missing: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  missingText: { color: colors.textMuted },
});
