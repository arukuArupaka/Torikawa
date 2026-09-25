import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { ShoppingItem } from '../types';
import { getFrequentShoppingSuggestions } from '../utils/shoppingList';

type Props = NativeStackScreenProps<RootStackParamList, 'ShoppingList'>;

export function ShoppingListScreen({ navigation }: Props) {
  const { foods, shoppingItems, addShoppingItem, toggleShoppingItem, deleteShoppingItem } = useAppData();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [showFrequent, setShowFrequent] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const pendingItems = shoppingItems.filter((item) => !item.checked);
  const checkedItems = shoppingItems.filter((item) => item.checked);
  const frequentItems = useMemo(
    () => getFrequentShoppingSuggestions(foods, shoppingItems),
    [foods, shoppingItems],
  );

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const added = addShoppingItem(trimmedName);
    if (added) {
      setName('');
      setNotice(`「${trimmedName}」を追加しました。`);
      return;
    }
    setNotice(`「${trimmedName}」はすでに買うものにあります。`);
  };

  const handleAddFrequentItem = (itemName: string) => {
    const added = addShoppingItem(itemName, 'よく買うものから追加');
    setNotice(added ? `「${itemName}」を追加しました。` : `「${itemName}」はすでに買うものにあります。`);
  };

  const handleToggleItem = (item: ShoppingItem) => {
    toggleShoppingItem(item.id);
    setDeleteItemId(null);
    setNotice(`「${item.name}」を${item.checked ? '買うものに戻しました' : '購入済みにしました'}。`);
  };

  const renderItems = (items: ShoppingItem[]) => (
    <View style={styles.listCard}>
      {items.map((item, index) => (
        <View key={item.id} style={[styles.itemGroup, index === items.length - 1 && styles.lastRow]}>
          <View style={styles.itemRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`${item.name}を${item.checked ? '未購入に戻す' : '購入済みにする'}`}
              accessibilityHint={item.memo}
              accessibilityState={{ checked: item.checked }}
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
              accessibilityLabel={`${item.name}を食材として登録`}
              onPress={() => navigation.navigate('AddFood', { initialName: item.name, initialMemo: item.memo ?? '' })}
              style={styles.registerButton}
            >
              <Ionicons color={colors.primaryDark} name="add-circle-outline" size={18} />
              <Text style={styles.registerText}>食材を登録</Text>
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
        </View>
      ))}
    </View>
  );

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} subtitle={`未購入${pendingItems.length}件・購入済み${checkedItems.length}件`} title="買い物リスト" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Pressable accessibilityRole="button" accessibilityLabel="買い物リストに追加" accessibilityState={{ disabled: !name.trim() }} disabled={!name.trim()} onPress={handleAdd} style={[styles.addButton, !name.trim() && styles.disabled]}>
              <Ionicons color={colors.surface} name="add" size={25} />
            </Pressable>
          </View>

          <View style={styles.purchaseHint}>
            <Ionicons color={colors.primary} name="checkmark-circle-outline" size={19} />
            <Text style={styles.purchaseHintText}>チェックで購入済みに。食材の登録は購入済みの一覧から行えます。</Text>
          </View>

          {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>買うもの {pendingItems.length}件</Text>
            {pendingItems.length > 0 ? renderItems(pendingItems) : (
              <View style={styles.empty}>
                <Ionicons color={colors.primary} name={checkedItems.length > 0 ? 'checkmark-circle-outline' : 'basket-outline'} size={38} />
                <Text style={styles.emptyText}>{checkedItems.length > 0 ? '買うものはすべて購入済みです。' : '買うものを追加しましょう。'}</Text>
              </View>
            )}
          </View>

          {checkedItems.length > 0 ? (
            <View style={styles.section}>
              <Pressable accessibilityRole="button" accessibilityLabel={`購入済み${checkedItems.length}件`} accessibilityState={{ expanded: showChecked }} onPress={() => setShowChecked((value) => !value)} style={styles.sectionToggle}>
                <Text style={styles.sectionTitle}>購入済み {checkedItems.length}件</Text>
                <Ionicons color={colors.textMuted} name={showChecked ? 'chevron-up' : 'chevron-down'} size={20} />
              </Pressable>
              {showChecked ? renderItems(checkedItems) : null}
            </View>
          ) : null}

          {frequentItems.length > 0 ? (
            <View style={styles.frequentCard}>
              <Pressable accessibilityRole="button" accessibilityLabel="よく買うもの" accessibilityState={{ expanded: showFrequent }} onPress={() => setShowFrequent((value) => !value)} style={styles.sectionToggle}>
                <Text style={styles.frequentTitle}>よく買うもの</Text>
                <Ionicons color={colors.textMuted} name={showFrequent ? 'chevron-up' : 'chevron-down'} size={20} />
              </Pressable>
              {showFrequent ? <View style={styles.frequentList}>
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
              </View> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, flex: 1, fontSize: 16, height: 50, paddingHorizontal: 14 },
  addButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, height: 50, justifyContent: 'center', width: 50 },
  disabled: { opacity: 0.4 },
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
