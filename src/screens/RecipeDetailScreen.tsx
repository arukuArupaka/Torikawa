import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { FoodItem } from '../types';
import { daysUntil, getRemainingLabel } from '../utils/date';
import {
  foodQuantityUnitLabels,
  formatFoodQuantity,
  isValidQuantity,
  parseQuantityInput,
  parseRecipeAmountForUnit,
  subtractQuantity,
} from '../utils/foodQuantity';
import { findMatchingFood } from '../utils/recipeMatching';
import { recipeCategoryLabels } from '../utils/recipeCategory';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;
type ConsumptionAction = 'none' | 'partial' | 'used';

type MatchedFood = {
  food: FoodItem;
  ingredients: string[];
};

export function RecipeDetailScreen({ navigation, route }: Props) {
  const { deleteRecipe, foods, markFoodUsed, recipes, toggleRecipeFavorite, updateFood } = useAppData();
  const recipe = recipes.find((item) => item.id === route.params.recipeId);
  const usableFoods = foods.filter(
    (food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0,
  );
  const ingredientRows = recipe?.ingredients.map((ingredient) => ({
    ingredient,
    food: findMatchingFood(ingredient, usableFoods),
  })) ?? [];
  const matchedFoodMap = new Map<string, MatchedFood>();
  ingredientRows.forEach(({ food, ingredient }) => {
    if (!food) return;
    const current = matchedFoodMap.get(food.id);
    matchedFoodMap.set(food.id, {
      food,
      ingredients: [...(current?.ingredients ?? []), ingredient],
    });
  });
  const matchedFoods = [...matchedFoodMap.values()];
  const [actions, setActions] = useState<Record<string, ConsumptionAction>>({});
  const [usedAmounts, setUsedAmounts] = useState<Record<string, string>>({});

  const getSuggestedUseAmount = (food: FoodItem, ingredients: string[]) => {
    const parsedAmount = ingredients
      .map((ingredient) => parseRecipeAmountForUnit(recipe?.ingredientAmounts[ingredient] ?? '', food.quantityUnit))
      .find((amount): amount is number => typeof amount === 'number');
    if (parsedAmount) return parsedAmount;
    if (food.quantityUnit === 'g' || food.quantityUnit === 'ml') return null;
    return Math.min(1, food.quantity);
  };

  const selectPartialAction = (food: FoodItem, ingredients: string[]) => {
    const suggestedAmount = getSuggestedUseAmount(food, ingredients);
    setActions((current) => ({ ...current, [food.id]: 'partial' }));
    setUsedAmounts((current) => ({
      ...current,
      [food.id]: suggestedAmount ? String(suggestedAmount) : current[food.id] ?? '',
    }));
  };

  const setSimpleAction = (food: FoodItem, action: ConsumptionAction) => {
    setActions((current) => ({ ...current, [food.id]: action }));
    setUsedAmounts((current) => {
      const next = { ...current };
      delete next[food.id];
      return next;
    });
  };

  const selectSuggestedActions = () => {
    const nextActions: Record<string, ConsumptionAction> = {};
    const nextAmounts: Record<string, string> = {};
    matchedFoods.forEach(({ food, ingredients }) => {
      const suggestedAmount = getSuggestedUseAmount(food, ingredients);
      if (!suggestedAmount) {
        nextActions[food.id] = 'partial';
        nextAmounts[food.id] = '';
        return;
      }
      if (suggestedAmount >= food.quantity) {
        nextActions[food.id] = 'used';
        return;
      }
      nextActions[food.id] = 'partial';
      nextAmounts[food.id] = String(suggestedAmount);
    });
    setActions(nextActions);
    setUsedAmounts(nextAmounts);
  };

  const selectUsedActions = () => {
    setActions(Object.fromEntries(matchedFoods.map(({ food }) => [food.id, 'used'])));
    setUsedAmounts({});
  };

  const clearActions = () => {
    setActions({});
    setUsedAmounts({});
  };

  if (!recipe) {
    return (
      <Screen>
        <ScreenHeader onBack={navigation.goBack} title="レシピ詳細" />
        <View style={styles.missingRecipe}>
          <Text style={styles.missingRecipeText}>このレシピは見つかりませんでした。</Text>
        </View>
      </Screen>
    );
  }

  const selectedFoods = matchedFoods.filter(({ food }) => {
    const action = actions[food.id] ?? 'none';
    return action !== 'none';
  });

  const completeCooking = () => {
    if (selectedFoods.length === 0) {
      Alert.alert('使用した食材を選択してください');
      return;
    }

    const updates = selectedFoods.map(({ food }) => {
      const action = actions[food.id];
      if (action === 'used') return { food, action: 'used' as const };

      const amountText = usedAmounts[food.id] ?? '';
      if (!isValidQuantity(amountText)) {
        return { food, action: 'invalid' as const };
      }
      const amount = parseQuantityInput(amountText);
      if (amount >= food.quantity) return { food, action: 'used' as const };
      return { food, action: 'partial' as const, amount };
    });
    const invalidFood = updates.find((update) => update.action === 'invalid');
    if (invalidFood) {
      Alert.alert('使用量を確認してください', `「${invalidFood.food.name}」の使用量を入力してください。`);
      return;
    }

    const usedNames = updates
      .filter((update) => update.action === 'used')
      .map(({ food }) => food.name);
    const partialSummaries = updates
      .filter((update): update is { food: FoodItem; action: 'partial'; amount: number } => update.action === 'partial')
      .map(({ food, amount }) => `${food.name}：${formatFoodQuantity(amount, food.quantityUnit)}使用`);
    const summary = [
      usedNames.length > 0 ? `使い切る：${usedNames.join('、')}` : '',
      partialSummaries.length > 0 ? `残量を減らす：\n${partialSummaries.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    Alert.alert('調理内容を記録', `${summary}\n\nこの内容で食材を更新しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '記録する',
        onPress: () => {
          updates.forEach((update) => {
            if (update.action === 'used') {
              const { food } = update;
              markFoodUsed(food.id);
              return;
            }
            if (update.action === 'partial') {
              const { food, amount } = update;
              const { id, createdAt, status, usedAt, disposedAt, ...input } = food;
              updateFood(id, { ...input, quantity: subtractQuantity(food.quantity, amount) });
            }
          });
          navigation.navigate('MainTabs', { screen: 'Home' });
        },
      },
    ]);
  };

  const confirmDeleteRecipe = () => {
    Alert.alert('レシピを削除', `「${recipe.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteRecipe(recipe.id);
          navigation.navigate('MainTabs', { screen: 'Recipes' });
        },
      },
    ]);
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader
        action={{
          icon: recipe.isFavorite ? 'heart' : 'heart-outline',
          label: recipe.isFavorite ? 'お気に入りから外す' : 'お気に入りに追加',
          onPress: () => toggleRecipeFavorite(recipe.id),
        }}
        onBack={navigation.goBack}
        title="レシピ詳細"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: recipe.image }} style={styles.heroImage} />
        <View>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.timeRow}>
              <Ionicons color={colors.textMuted} name="time-outline" size={17} />
              <Text style={styles.timeText}>約{recipe.minutes}分</Text>
            </View>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{recipeCategoryLabels[recipe.category]}</Text>
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>材料</Text>
          <View style={styles.card}>
            {ingredientRows.map(({ ingredient, food }, index) => (
              <View
                key={ingredient}
                style={[styles.ingredientRow, index === ingredientRows.length - 1 && styles.lastRow]}
              >
                <View style={styles.ingredientText}>
                  <Text style={styles.ingredientName}>{ingredient}</Text>
                  <Text style={styles.ingredientAmount}>{recipe.ingredientAmounts[ingredient]}</Text>
                </View>
                {food ? (
                  <View style={styles.registeredBadge}>
                    <Ionicons color={colors.primary} name="checkmark-circle" size={15} />
                    <Text style={styles.registeredText}>
                      {formatFoodQuantity(food.quantity, food.quantityUnit)}・{getRemainingLabel(food.expiryDate)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.unregisteredText}>使用可能な登録なし</Text>
                )}
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>作り方</Text>
          <View style={styles.card}>
            {recipe.steps.map((step, index) => (
              <View key={`${index}-${step}`} style={[styles.stepRow, index === recipe.steps.length - 1 && styles.lastRow]}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>使用した食材を記録</Text>
          <Text style={styles.sectionDescription}>
            調理後の在庫に合わせて、食材ごとに更新方法を選んでください。
          </Text>
          {matchedFoods.length === 0 ? (
            <View style={styles.noMatchedFoods}>
              <Ionicons color={colors.textMuted} name="information-circle-outline" size={21} />
              <Text style={styles.noMatchedFoodsText}>更新できる登録食材はありません。</Text>
            </View>
          ) : (
            <>
              <View style={styles.quickActionRow}>
                <Pressable onPress={selectSuggestedActions} style={styles.quickActionButton}>
                  <Text style={styles.quickActionText}>使った分を自動選択</Text>
                </Pressable>
                <Pressable onPress={selectUsedActions} style={styles.quickActionButton}>
                  <Text style={styles.quickActionText}>全部使い切る</Text>
                </Pressable>
                <Pressable onPress={clearActions} style={[styles.quickActionButton, styles.clearActionButton]}>
                  <Text style={[styles.quickActionText, styles.clearActionText]}>クリア</Text>
                </Pressable>
              </View>
              <View style={styles.consumptionList}>
                {matchedFoods.map(({ food, ingredients }) => {
                  const selectedAction = actions[food.id] ?? 'none';
                  return (
                    <View key={food.id} style={styles.consumptionCard}>
                      <View style={styles.consumptionHeader}>
                        <View>
                          <Text style={styles.consumptionName}>{food.name}</Text>
                          <Text style={styles.consumptionMeta}>
                            {ingredients.join('・')}として使用／現在{formatFoodQuantity(food.quantity, food.quantityUnit)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.actionOptions}>
                        <ActionOption
                          label="変更なし"
                          onPress={() => setSimpleAction(food, 'none')}
                          selected={selectedAction === 'none'}
                          tone="neutral"
                        />
                        <ActionOption
                          label="使用量を入力"
                          onPress={() => selectPartialAction(food, ingredients)}
                          selected={selectedAction === 'partial'}
                          tone="warning"
                        />
                        <ActionOption
                          label="使い切る"
                          onPress={() => setSimpleAction(food, 'used')}
                          selected={selectedAction === 'used'}
                          tone="primary"
                        />
                      </View>
                      {selectedAction === 'partial' ? (
                        <View style={styles.usageInputRow}>
                          <TextInput
                            keyboardType="decimal-pad"
                            maxLength={8}
                            onChangeText={(value) => setUsedAmounts((current) => ({ ...current, [food.id]: value }))}
                            placeholder="使用量"
                            placeholderTextColor={colors.textMuted}
                            style={styles.usageInput}
                            value={usedAmounts[food.id] ?? ''}
                          />
                          <Text style={styles.usageUnit}>{foodQuantityUnitLabels[food.quantityUnit]}</Text>
                          <Text style={styles.quantityNote}>残量以上なら使い切ったとして記録します。</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <PrimaryButton
          disabled={selectedFoods.length === 0}
          icon="restaurant-outline"
          label="このレシピを作った"
          onPress={completeCooking}
        />
        <PrimaryButton
          icon="create-outline"
          label="このレシピを編集"
          onPress={() => navigation.navigate('AddRecipe', { recipeId: recipe.id })}
          variant="outline"
        />
        <PrimaryButton label="このレシピを削除" onPress={confirmDeleteRecipe} variant="danger" />
      </ScrollView>
    </Screen>
  );
}

function ActionOption({
  disabled = false,
  label,
  onPress,
  selected,
  tone,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  tone: 'neutral' | 'warning' | 'primary';
}) {
  const tint = tone === 'primary' ? colors.primary : tone === 'warning' ? colors.warning : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionOption,
        selected && { backgroundColor: `${tint}18`, borderColor: tint },
        disabled && styles.disabledOption,
      ]}
    >
      <Text style={[styles.actionOptionText, selected && { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl },
  heroImage: { backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 205, width: '100%' },
  recipeName: { color: colors.text, fontSize: 23, fontWeight: '800' },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  timeRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: spacing.sm },
  timeText: { color: colors.textMuted, fontSize: 13 },
  categoryBadge: { backgroundColor: colors.primarySoft, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  categoryText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  sectionDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  ingredientRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 62 },
  ingredientText: { flex: 1 },
  ingredientName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  ingredientAmount: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  registeredBadge: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  registeredText: { color: colors.primaryDark, fontSize: 10, fontWeight: '700' },
  unregisteredText: { color: colors.danger, fontSize: 10, fontWeight: '600' },
  lastRow: { borderBottomWidth: 0 },
  stepRow: { alignItems: 'flex-start', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 15 },
  stepNumber: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  stepNumberText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  stepText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 21, paddingTop: 3 },
  noMatchedFoods: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noMatchedFoodsText: { color: colors.textMuted, fontSize: 13 },
  quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  quickActionButton: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
  quickActionText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  clearActionButton: { backgroundColor: colors.surface, borderColor: colors.border },
  clearActionText: { color: colors.textMuted },
  consumptionList: { gap: spacing.sm },
  consumptionCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 13 },
  consumptionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  consumptionName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  consumptionMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  actionOptions: { flexDirection: 'row', gap: 6, marginTop: 11 },
  actionOption: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 4 },
  actionOptionText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  disabledOption: { opacity: 0.35 },
  usageInputRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 10 },
  usageInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 14, height: 42, paddingHorizontal: 12, textAlign: 'center', width: 96 },
  usageUnit: { color: colors.text, fontSize: 13, fontWeight: '800' },
  quantityNote: { color: colors.textMuted, fontSize: 9, marginTop: 6 },
  missingRecipe: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  missingRecipeText: { color: colors.textMuted },
});
