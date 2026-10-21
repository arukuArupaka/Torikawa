import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { MotionIconButton } from '../components/MotionIconButton';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useAppToast } from '../context/AppToastContext';
import { useReducedMotion } from '../context/MotionPreferenceContext';
import { RootStackParamList } from '../navigation/types';
import { ShoppingItem } from '../types';
import { getFrequentShoppingSuggestions } from '../utils/shoppingList';

type Props = NativeStackScreenProps<RootStackParamList, 'ShoppingList'>;

export function ShoppingListScreen({ navigation }: Props) {
  const toast = useAppToast();
  const reduceMotion = useReducedMotion();
  const { foods, shoppingItems, addShoppingItem, toggleShoppingItem, deleteShoppingItem } = useAppData();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [showFrequent, setShowFrequent] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [leavingItems, setLeavingItems] = useState(new Map<string, boolean>());
  const leavingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const screenMounted = useRef(true);
  const [destinationPulse, setDestinationPulse] = useState({ checked: false, sequence: 0 });
  useEffect(() => {
    screenMounted.current = true;
    return () => {
      screenMounted.current = false;
      leavingTimers.current.forEach(clearTimeout);
      leavingTimers.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!reduceMotion) return;
    leavingTimers.current.forEach(clearTimeout);
    leavingTimers.current.clear();
    setLeavingItems((current) => current.size ? new Map() : current);
  }, [reduceMotion]);
  const clearLeaving = (id?: string) => {
    if (id === undefined) {
      leavingTimers.current.forEach(clearTimeout);
      leavingTimers.current.clear();
      setLeavingItems(new Map());
    } else {
      clearTimeout(leavingTimers.current.get(id));
      leavingTimers.current.delete(id);
      setLeavingItems((current) => { const next = new Map(current); next.delete(id); return next; });
    }
  };
  const changeView = (checked: boolean) => { clearLeaving(); setShowChecked(checked); };
  const pulseDestination = (checked: boolean) => setDestinationPulse((current) => ({ checked, sequence: current.sequence + 1 }));
  const registeredFoods = useMemo(() => new Map(foods.filter((food) => food.sourceShoppingItemId).map((food) => [food.sourceShoppingItemId!, food])), [foods]);
  const pendingItems = shoppingItems.filter((item) => !item.checked);
  const checkedItems = shoppingItems.filter((item) => item.checked);
  const frequentItems = useMemo(
    () => getFrequentShoppingSuggestions(foods, shoppingItems),
    [foods, shoppingItems],
  );

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const added = addShoppingItem(trimmedName, undefined, () => toast('買い物リストに追加しました'));
    if (added) {
      setName('');
      setNotice('');
      return;
    }
    setNotice(`「${trimmedName}」はすでに買うものにあります。`);
  };

  const handleAddFrequentItem = (itemName: string) => {
    const added = addShoppingItem(itemName, 'よく買うものから追加', () => toast('買い物リストに追加しました'));
    setNotice(added ? '' : `「${itemName}」はすでに買うものにあります。`);
  };

  const handleToggleItem = (item: ShoppingItem) => {
    if (registeredFoods.has(item.id)) {
      setNotice('この購入分は登録済みです。次の購入は「買うもの」に新しく追加してください。');
      return;
    }
    if (leavingTimers.current.has(item.id)) return;
    const changed = toggleShoppingItem(item.id, (undo) => {
      toast(`「${item.name}」を${item.checked ? '買うものに戻しました' : '購入済みにしました'}。`, {
        label: '元に戻す', hint: 'この商品の購入状態だけを戻します。',
        onPress: () => {
          if (undo(() => toast(`「${item.name}」の購入状態を元に戻しました。`))) {
            if (screenMounted.current) { clearLeaving(item.id); setShowChecked(item.checked); pulseDestination(item.checked); }
          } else toast('購入状態が変わっています。現在のリストを確認してください。');
        },
      });
    }, item.checked);
    if (!changed) return;
    if (!reduceMotion) {
      setLeavingItems((current) => new Map(current).set(item.id, item.checked));
      leavingTimers.current.set(item.id, setTimeout(() => clearLeaving(item.id), 500));
    }
    pulseDestination(!item.checked);
    setDeleteItemId(null);
    setNotice('');
  };

  const renderItem = ({ item }: { item: ShoppingItem }) => {
    const registered = registeredFoods.get(item.id);
    const leaving = !reduceMotion && leavingItems.get(item.id) === showChecked && item.checked !== showChecked;
    return <ShoppingCheckCard leaving={leaving} checked={item.checked}>
          <View style={styles.itemRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={registered ? `${item.name}は食材に登録済み` : `${item.name}を${item.checked ? '未購入に戻す' : '購入済みにする'}`}
              accessibilityHint={item.memo}
              accessibilityState={{ checked: item.checked, disabled: Boolean(registered) || leaving }} aria-checked={item.checked}
              disabled={Boolean(registered) || leaving}
              onPress={() => handleToggleItem(item)}
              style={styles.checkArea}
            >
              <ShoppingCheckIcon checked={item.checked} leaving={leaving} />
              <View style={styles.itemNameArea}>
                <Text style={[styles.itemName, item.checked && styles.checked]}>{item.name}</Text>
                {item.memo ? <Text style={styles.itemMemo}>{item.memo
                  .replace(/^(「.*」)(\d+人分|人数未設定) \/ /, '$1\n$2 / ')
                  .replace(/^(「.*」用) \/ /, '$1\n')}</Text> : null}
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を買い物リストから削除`} disabled={leaving}
              accessibilityState={{ disabled: leaving }} onPress={() => setDeleteItemId(item.id)} style={styles.iconButton}>
              <Ionicons color={colors.textMuted} name="trash-outline" size={20} />
            </Pressable>
          </View>
          {item.checked && !leaving ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={registered ? `${item.name}の登録済み食材を確認` : `${item.name}を食材として登録`}
              onPress={() => registered ? navigation.navigate('FoodDetail', { foodId: registered.id }) : navigation.navigate('AddFood', { initialName: item.name, initialMemo: item.memo ?? '', shoppingItemId: item.id })}
              style={styles.registerButton}
            >
              <Ionicons color={colors.primaryDark} name="add-circle-outline" size={18} />
              <Text style={styles.registerText}>{registered ? '登録済み · 食材を確認' : '食材を登録'}</Text>
            </Pressable>
          ) : null}
          {deleteItemId === item.id ? (
            <View style={styles.deleteConfirmation}>
              <Text style={styles.confirmationText}>「{item.name}」をリストから削除しますか？</Text>
              <View style={styles.confirmationActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}の削除をキャンセル`} onPress={() => setDeleteItemId(null)} style={styles.confirmationButton}>
                  <Text style={styles.registerText}>キャンセル</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}の削除を確定`} onPress={() => {
                  deleteShoppingItem(item.id);
                  setDeleteItemId(null);
                  setNotice(`「${item.name}」を削除しました。`);
                }} style={styles.confirmationButton}>
                  <Text style={styles.deleteText}>削除する</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ShoppingCheckCard>;
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} subtitle={`未購入${pendingItems.length}件・購入済み${checkedItems.length}件`} title="買い物リスト" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.purchaseTabs}>
          <PurchaseTab label="買うもの" count={pendingItems.length} selected={!showChecked} onPress={() => changeView(false)}
            pulse={destinationPulse.checked ? 0 : destinationPulse.sequence} />
          <PurchaseTab label="購入済み" count={checkedItems.length} selected={showChecked} onPress={() => changeView(true)}
            pulse={destinationPulse.checked ? destinationPulse.sequence : 0} />
        </View>
        <SectionList key={showChecked ? 'checked' : 'pending'} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          sections={[{ key: showChecked ? 'checked' : 'pending', data: shoppingItems.filter((item) => item.checked === showChecked
            || (!reduceMotion && leavingItems.get(item.id) === showChecked)) }]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={() => <Text accessibilityRole="header" style={styles.sectionTitle}>{showChecked ? '購入済み' : '買うもの'} {showChecked ? checkedItems.length : pendingItems.length}件</Text>}
          renderSectionFooter={({ section }) => section.data.length === 0
            ? <Text style={styles.emptyText}>{showChecked ? '購入済みの項目はありません。' : checkedItems.length > 0 ? '買うものはすべて購入済みです。' : '買うものを追加しましょう。'}</Text> : null}
          ListHeaderComponent={<>

          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="買う食材名"
              onChangeText={setName}
              onSubmitEditing={handleAdd}
              placeholder="食材を追加"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={styles.input}
              value={name}
            />
            <MotionIconButton accessibilityLabel="買い物リストに追加" disabled={!name.trim()} onPress={handleAdd} />
          </View>

          <View style={styles.purchaseHint}>
            <Ionicons color={colors.primary} name="checkmark-circle-outline" size={19} />
            <Text style={styles.purchaseHintText}>チェックで購入済みに。購入済みの一覧から食材を登録できます。登録後の次の購入は、新しい項目として追加してください。</Text>
          </View>

          {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

          </>}
          ListFooterComponent={<>
          {frequentItems.length > 0 ? (
            <View style={styles.frequentCard}>
              <AnimatedDisclosure expanded={showFrequent} header={<Pressable accessibilityRole="button" accessibilityLabel="よく買うもの" accessibilityState={{ expanded: showFrequent }} aria-expanded={showFrequent} onPress={() => setShowFrequent((value) => !value)} style={styles.sectionToggle}>
                <Text style={styles.frequentTitle}>よく買うもの</Text>
                <Ionicons color={colors.textMuted} name={showFrequent ? 'chevron-up' : 'chevron-down'} size={20} />
              </Pressable>}>
              <View style={styles.frequentList}>
                {frequentItems.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}を買い物リストに追加`}
                    key={item.name}
                    onPress={() => handleAddFrequentItem(item.name)}
                    style={({ pressed }) => [styles.frequentButton, pressed && styles.pressed]}
                  >
                    <Ionicons color={colors.primary} name="add-circle-outline" size={17} />
                    <Text numberOfLines={1} style={styles.frequentButtonText}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
              </AnimatedDisclosure>
            </View>
          ) : null}
          </>}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ShoppingCheckCard({ leaving, checked, children }: { leaving: boolean; checked: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation(); progress.setValue(0);
    if (!leaving || reduceMotion) return;
    Animated.timing(progress, { toValue: 1, duration: 480, easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    return () => progress.stopAnimation();
  }, [leaving, reduceMotion, progress]);
  const cardStyle = [styles.listCard, styles.itemGroup, leaving && styles.checkFeedback];
  if (reduceMotion) return <View style={cardStyle}>{children}</View>;
  return <Animated.View style={[cardStyle, {
    opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, checked ? 18 : -18] }) }],
  }]}>{children}</Animated.View>;
}

function ShoppingCheckIcon({ checked, leaving }: { checked: boolean; leaving: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation(); progress.setValue(0);
    if (!leaving || reduceMotion) return;
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    return () => progress.stopAnimation();
  }, [leaving, reduceMotion, progress]);
  const icon = <Ionicons color={checked ? colors.primary : colors.textMuted} name={checked ? 'checkbox' : 'square-outline'} size={25} />;
  if (reduceMotion || !leaving) return icon;
  return <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.8, 1.18, 1] }) }] }}>{icon}</Animated.View>;
}

function PurchaseTab({ label, count, selected, onPress, pulse }: {
  label: string; count: number; selected: boolean; onPress: () => void; pulse: number;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (!pulse || reduceMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 420, easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
    return () => progress.stopAnimation();
  }, [pulse, reduceMotion, progress]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}${count}件`}
    accessibilityState={{ selected }} aria-pressed={selected} onPress={onPress}
    style={({ pressed }) => [styles.purchaseTab, selected && styles.selectedTab, pressed && styles.pressed]}>
    {!reduceMotion ? <Animated.View accessible={false} pointerEvents="none" style={[styles.purchasePulse,
      { opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }) }]} /> : null}
    <Text style={styles.registerText}>{label}</Text>
    {reduceMotion ? <Text style={styles.purchaseCount}>{count}件</Text>
      : <Animated.Text style={[styles.purchaseCount,
        { transform: [{ scale: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1, 1.18, 1] }) }] }]}>{count}件</Animated.Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  purchaseTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  purchaseTab: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 48, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  purchasePulse: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: radius.sm, backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 },
  purchaseCount: { color: colors.primaryDark, fontSize: 13, fontWeight: '800', backgroundColor: colors.primarySoft, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm, overflow: 'hidden' },
  selectedTab: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  content: { gap: spacing.md, padding: spacing.md },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, flex: 1, fontSize: 16, height: 50, paddingHorizontal: 14 },
  purchaseHint: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 9 },
  purchaseHintText: { color: colors.primaryDark, flex: 1, fontSize: 13, lineHeight: 20 },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sectionToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  notice: { color: colors.primaryDark, fontSize: 13, lineHeight: 20 },
  frequentCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  frequentTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  frequentList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  frequentButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 5, maxWidth: '100%', minHeight: 44, paddingHorizontal: 10 },
  frequentButtonText: { color: colors.primaryDark, flexShrink: 1, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12 },
  checkFeedback: { backgroundColor: colors.primarySoft },
  itemGroup: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 4 },
  itemRow: { alignItems: 'center', flexDirection: 'row', minHeight: 61 },
  checkArea: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingVertical: 12 },
  iconButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 44 },
  lastRow: { borderBottomWidth: 0 },
  itemNameArea: { flex: 1, minWidth: 0 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  itemMemo: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  registerButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 44, marginLeft: 35, paddingHorizontal: 8 },
  registerText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
  deleteConfirmation: { backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: 12, marginBottom: 8 },
  confirmationText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  confirmationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'flex-end', marginTop: 4 },
  confirmationButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  checked: { color: colors.textMuted, textDecorationLine: 'line-through' },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 24 },
  emptyText: { color: colors.textMuted, marginTop: spacing.md },
});
