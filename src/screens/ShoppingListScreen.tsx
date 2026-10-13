import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { MotionIconButton } from '../components/MotionIconButton';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useAppToast } from '../context/AppToastContext';
import { RootStackParamList } from '../navigation/types';
import { ShoppingItem } from '../types';
import { getFrequentShoppingSuggestions } from '../utils/shoppingList';

type Props = NativeStackScreenProps<RootStackParamList, 'ShoppingList'>;

export function ShoppingListScreen({ navigation }: Props) {
  const toast = useAppToast();
  const { foods, shoppingItems, addShoppingItem, toggleShoppingItem, deleteShoppingItem } = useAppData();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [showFrequent, setShowFrequent] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
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
    toggleShoppingItem(item.id);
    setDeleteItemId(null);
    setNotice(`「${item.name}」を${item.checked ? '買うものに戻しました' : '購入済みにしました'}。`);
  };

  const renderItem = ({ item }: { item: ShoppingItem }) => {
    const registered = registeredFoods.get(item.id);
    return <View style={[styles.listCard, styles.itemGroup]}>
          <View style={styles.itemRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={registered ? `${item.name}は食材に登録済み` : `${item.name}を${item.checked ? '未購入に戻す' : '購入済みにする'}`}
              accessibilityHint={item.memo}
              accessibilityState={{ checked: item.checked, disabled: Boolean(registered) }} aria-checked={item.checked}
              disabled={Boolean(registered)}
              onPress={() => handleToggleItem(item)}
              style={styles.checkArea}
            >
              <Ionicons color={item.checked ? colors.primary : colors.textMuted} name={item.checked ? 'checkbox' : 'square-outline'} size={25} />
              <View style={styles.itemNameArea}>
                <Text style={[styles.itemName, item.checked && styles.checked]}>{item.name}</Text>
                {item.memo ? <Text style={styles.itemMemo}>{item.memo
                  .replace(/^(「.*」)(\d+人分|人数未設定) \/ /, '$1\n$2 / ')
                  .replace(/^(「.*」用) \/ /, '$1\n')}</Text> : null}
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を買い物リストから削除`} onPress={() => setDeleteItemId(item.id)} style={styles.iconButton}>
              <Ionicons color={colors.textMuted} name="trash-outline" size={20} />
            </Pressable>
          </View>
          {item.checked ? (
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
        </View>;
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} subtitle={`未購入${pendingItems.length}件・購入済み${checkedItems.length}件`} title="買い物リスト" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.purchaseTabs}>
          <Pressable accessibilityRole="button" accessibilityLabel={`買うもの${pendingItems.length}件`} accessibilityState={{ selected: !showChecked }} aria-pressed={!showChecked} onPress={() => setShowChecked(false)} style={[styles.purchaseTab, !showChecked && styles.selectedTab]}>
            <Text style={styles.registerText}>買うもの {pendingItems.length}件</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`購入済み${checkedItems.length}件`} accessibilityState={{ selected: showChecked }} aria-pressed={showChecked} onPress={() => setShowChecked(true)} style={[styles.purchaseTab, showChecked && styles.selectedTab]}>
            <Text style={styles.registerText}>購入済み {checkedItems.length}件</Text>
          </Pressable>
        </View>
        <SectionList key={showChecked ? 'checked' : 'pending'} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          sections={[{ key: showChecked ? 'checked' : 'pending', data: showChecked ? checkedItems : pendingItems }]}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  purchaseTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  purchaseTab: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 48, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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
