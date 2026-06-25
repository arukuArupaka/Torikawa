import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
      return;
    }
    Alert.alert('追加済みです', `「${trimmedName}」は未完了の買い物リストにあります。`);
  };

  const handleAddFrequentItem = (itemName: string) => {
    const added = addShoppingItem(itemName, 'よく買うものから追加');
    if (!added) {
      Alert.alert('追加済みです', `「${itemName}」は未完了の買い物リストにあります。`);
    }
  };

  const handleToggleItem = (item: ShoppingItem) => {
    if (item.checked) {
      toggleShoppingItem(item.id);
      return;
    }

    Alert.alert(
      '購入済みにする',
      `「${item.name}」を購入済みにして、食材登録へ進みますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '食材を登録',
          onPress: () => {
            toggleShoppingItem(item.id);
            navigation.navigate('AddFood', { initialName: item.name });
          },
        },
      ],
    );
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} subtitle={`${shoppingItems.length}件`} title="買い物リスト" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.addRow}>
            <TextInput
              onChangeText={setName}
              onSubmitEditing={handleAdd}
              placeholder="食材を追加"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={styles.input}
              value={name}
            />
            <Pressable disabled={!name.trim()} onPress={handleAdd} style={[styles.addButton, !name.trim() && styles.disabled]}>
              <Ionicons color={colors.surface} name="add" size={25} />
            </Pressable>
          </View>

          <View style={styles.purchaseHint}>
            <Ionicons color={colors.primary} name="checkmark-circle-outline" size={19} />
            <Text style={styles.purchaseHintText}>未購入の食材をチェックすると、食材登録画面へ進みます</Text>
          </View>

          {frequentItems.length > 0 ? (
            <View style={styles.frequentCard}>
              <View style={styles.frequentHeader}>
                <Ionicons color={colors.primary} name="repeat-outline" size={18} />
                <Text style={styles.frequentTitle}>よく買うもの</Text>
              </View>
              <View style={styles.frequentList}>
                {frequentItems.map((item) => (
                  <Pressable
                    key={item.name}
                    onPress={() => handleAddFrequentItem(item.name)}
                    style={({ pressed }) => [styles.frequentButton, pressed && styles.pressed]}
                  >
                    <Ionicons color={colors.primary} name="add-circle-outline" size={17} />
                    <Text numberOfLines={1} style={styles.frequentButtonText}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.listCard}>
            {shoppingItems.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons color={colors.primary} name="basket-outline" size={42} />
                <Text style={styles.emptyText}>買うものを追加しましょう。</Text>
              </View>
            ) : (
              shoppingItems.map((item, index) => (
                <View key={item.id} style={[styles.itemRow, index === shoppingItems.length - 1 && styles.lastRow]}>
                  <Pressable hitSlop={8} onPress={() => handleToggleItem(item)}>
                    <Ionicons
                      color={item.checked ? colors.primary : colors.textMuted}
                      name={item.checked ? 'checkbox' : 'square-outline'}
                      size={25}
                    />
                  </Pressable>
                  <Pressable onPress={() => handleToggleItem(item)} style={styles.itemNameArea}>
                    <Text style={[styles.itemName, item.checked && styles.checked]}>{item.name}</Text>
                    {item.memo ? (
                      <View style={styles.memoRow}>
                        <Ionicons
                          color={item.checked ? colors.textMuted : colors.warning}
                          name="information-circle-outline"
                          size={14}
                        />
                        <Text style={[styles.itemMemo, item.checked && styles.checkedMemo]}>{item.memo}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => deleteShoppingItem(item.id)}>
                    <Ionicons color={colors.textMuted} name="trash-outline" size={20} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
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
  purchaseHintText: { color: colors.primaryDark, flex: 1, fontSize: 11 },
  frequentCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  frequentHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  frequentTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  frequentList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  frequentButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 5, maxWidth: '100%', minHeight: 36, paddingHorizontal: 10 },
  frequentButtonText: { color: colors.primaryDark, flexShrink: 1, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  itemRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 61 },
  lastRow: { borderBottomWidth: 0 },
  itemNameArea: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  memoRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 4 },
  itemMemo: { color: colors.warning, fontSize: 11, fontWeight: '600' },
  checkedMemo: { color: colors.textMuted },
  checked: { color: colors.textMuted, textDecorationLine: 'line-through' },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { color: colors.textMuted, marginTop: spacing.md },
});
