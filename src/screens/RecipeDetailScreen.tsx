import { FoodImage } from '../components/FoodImage';
import { allocateRecipeStock, getRecipeStock, getStockLabel } from '../utils/recipeStock';
import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type AlertButton } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { RootStackParamList } from '../navigation/types';
import { returnToMainTab } from '../navigation/returnToMainTab';
import { FoodItem } from '../types';
import { createId } from '../utils/id';
import { daysUntil, getRemainingLabel } from '../utils/date';
import {
  foodQuantityUnitLabels,
  formatFoodQuantity,
  isValidQuantity,
  parseQuantityInput,
  subtractQuantity,
} from '../utils/foodQuantity';
import { getFoodDisplayName } from '../utils/ingredientNormalizer';
import { findMatchingFood } from '../utils/recipeMatching';
import { getRecipeShoppingItems, isPreparationWater } from '../utils/recipeIngredients';
import { recipeCategoryLabels } from '../utils/recipeCategory';
import { getServingsMultiplier, isValidServings, MAX_RECIPE_SERVINGS, scaleRecipeAmount } from '../utils/recipeServings';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;
type ConsumptionAction = 'none' | 'partial' | 'used';

type MatchedFood = {
  food: FoodItem;
  ingredients: string[];
};

export function RecipeDetailScreen({ navigation, route }: Props) {
  const alert = useAppAlert();
  const { addShoppingItem, deleteRecipe, foods, recordConsumption, recipes, shoppingItems, toggleRecipeFavorite } = useAppData();
  useCurrentDay();
  const recipe = recipes.find((item) => item.id === route.params.recipeId);
  const [selectedServings, setSelectedServings] = useState<number | null>(null);
  const [servingsNotice, setServingsNotice] = useState('');
  const [shoppingNotice, setShoppingNotice] = useState('');
  const baseServings = isValidServings(recipe?.servings) ? recipe.servings : null;
  const targetServings = baseServings === null ? null : selectedServings ?? baseServings;
  const servingsMultiplier = getServingsMultiplier(baseServings, targetServings);
  const usableFoods = foods.filter(
    (food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0,
  );
  const expiredFoods = foods.filter(
    (food) => food.status === 'active' && daysUntil(food.expiryDate) < 0,
  );
  const stockRows = recipe ? getRecipeStock(recipe, foods, targetServings) : [];
  const ingredientRows = recipe?.ingredients.map((ingredient, index) => {
    const food = isPreparationWater(ingredient) ? undefined : findMatchingFood(ingredient, usableFoods);
    return {
      ingredient,
      stock: stockRows[index],
      scaledAmount: scaleRecipeAmount(recipe.ingredientAmounts[ingredient] ?? '', baseServings, targetServings),
      food,
      expiredFood: !food && !isPreparationWater(ingredient) ? findMatchingFood(ingredient, expiredFoods) : undefined,
    };
  }) ?? [];
  const matchedFoodMap = new Map<string, MatchedFood>();
  stockRows.forEach(({ foods: lots, ingredient, status }) => {
    if (status === 'preparation') return;
    lots.forEach((food) => {
      const current = matchedFoodMap.get(food.id);
      matchedFoodMap.set(food.id, {
        food,
        ingredients: [...(current?.ingredients ?? []), ingredient],
      });
    });
  });
  const matchedFoods = [...matchedFoodMap.values()].sort((a, b) => a.food.expiryDate.localeCompare(b.food.expiryDate));
  const suggestedAmounts = allocateRecipeStock(stockRows);
  const operationId = useRef(createId('cooking'));
  const [actions, setActions] = useState<Record<string, ConsumptionAction>>({});
  const [usedAmounts, setUsedAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    operationId.current = createId('cooking');
    setSelectedServings(null);
    setServingsNotice('');
    setShoppingNotice('');
    setActions({});
    setUsedAmounts({});
  }, [recipe?.id, recipe?.servings, recipe?.ingredientAmounts]);

  const changeServings = (value: number) => {
    if (!isValidServings(value)) return;
    if (Object.values(actions).some((action) => action !== 'none')) {
      setServingsNotice('人数を変更しました。使用する食材を選び直してください。');
    }
    setSelectedServings(value);
    setShoppingNotice('');
    setActions({});
    setUsedAmounts({});
  };

  const getSuggestedUseAmount = (food: FoodItem) => suggestedAmounts[food.id] ?? null;

  const selectPartialAction = (food: FoodItem) => {
    setServingsNotice('');
    const suggestedAmount = getSuggestedUseAmount(food);
    setActions((current) => ({ ...current, [food.id]: 'partial' }));
    setUsedAmounts((current) => ({
      ...current,
      [food.id]: suggestedAmount ? String(suggestedAmount) : current[food.id] ?? '',
    }));
  };

  const setSimpleAction = (food: FoodItem, action: ConsumptionAction) => {
    setServingsNotice('');
    setActions((current) => ({ ...current, [food.id]: action }));
    setUsedAmounts((current) => {
      const next = { ...current };
      delete next[food.id];
      return next;
    });
  };

  const selectSuggestedActions = () => {
    setServingsNotice('');
    const nextActions: Record<string, ConsumptionAction> = {};
    const nextAmounts: Record<string, string> = {};
    matchedFoods.forEach(({ food }) => {
      const suggestedAmount = getSuggestedUseAmount(food);
      if (!suggestedAmount) {
        if (stockRows.some((row) => row.status === 'sufficient' && row.foods.some((lot) => lot.id === food.id))) {
          nextActions[food.id] = 'none';
          return;
        }
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
    setServingsNotice('');
    setActions(Object.fromEntries(matchedFoods.map(({ food }) => [food.id, 'used'])));
    setUsedAmounts({});
  };

  const clearActions = () => {
    setServingsNotice('');
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
  const shoppingCandidates = getRecipeShoppingItems(recipe, foods, shoppingItems, targetServings);
  const missingStockCount = stockRows.filter((row) => row.status === 'missing' || row.status === 'shortage').length;
  const addMissingToShopping = () => {
    const added = shoppingCandidates.filter((item) => addShoppingItem(item.name, item.memo)).length;
    setShoppingNotice(added > 0
      ? `${added}品を追加しました${targetServings ? `（${targetServings}人分）` : ''}。`
      : '対象の材料は追加済みです。分量は買い物リストで確認できます。');
  };

  const completeCooking = () => {
    if (selectedFoods.length === 0) {
      alert('使用した食材を選択してください');
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
      if (amount > food.quantity) return { food, action: 'excess' as const };
      if (amount === food.quantity) return { food, action: 'used' as const };
      return { food, action: 'partial' as const, amount };
    });
    const invalidFood = updates.find((update) => update.action === 'invalid');
    if (invalidFood) {
      alert('使用量を確認してください', `「${getFoodDisplayName(invalidFood.food)}」の使用量を入力してください。`);
      return;
    }
    const excessFood = updates.find((update) => update.action === 'excess');
    if (excessFood) {
      alert('残量より多く入力されています', `「${getFoodDisplayName(excessFood.food)}」の使用量は、登録残量の${formatFoodQuantity(excessFood.food.quantity, excessFood.food.quantityUnit)}以下で入力してください。`);
      return;
    }

    const usedNames = updates
      .filter((update) => update.action === 'used')
      .map(({ food }) => `${getFoodDisplayName(food)}（期限${food.expiryDate}・${formatFoodQuantity(food.quantity, food.quantityUnit)}）`);
    const partialSummaries = updates
      .filter((update): update is { food: FoodItem; action: 'partial'; amount: number } => update.action === 'partial')
      .map(({ food, amount }) => `${getFoodDisplayName(food)}（期限${food.expiryDate}）：${formatFoodQuantity(amount, food.quantityUnit)}使用 → 残り${formatFoodQuantity(subtractQuantity(food.quantity, amount), food.quantityUnit)}`);
    const summary = [
      usedNames.length > 0 ? `使い切る：${usedNames.join('、')}` : '',
      partialSummaries.length > 0 ? `残量を減らす：\n${partialSummaries.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const confirmedOperationId = operationId.current;
    const applyUpdates = (addUsedFoodsToShoppingList: boolean) => {
      // A confirmation can remain open across midnight or while the app is backgrounded.
      if (updates.some(({ food }) => daysUntil(food.expiryDate) < 0)) {
        clearActions();
        alert('期限を確認してください', '確認中に期限を過ぎた食材があります。食材の状態を確認し、選び直してください。');
        return;
      }
      try {
        const applied = recordConsumption({
          operationId: confirmedOperationId,
          recipeId: recipe.id,
          items: updates.map((update) => ({
            foodId: update.food.id,
            amount: update.action === 'partial' ? update.amount : update.food.quantity,
            unit: update.food.quantityUnit,
            expectedQuantity: update.food.quantity,
            expectedExpiryDate: update.food.expiryDate,
            expectedRevision: update.food.revision ?? 0,
          })),
        });
        if (!applied) return;
        if (addUsedFoodsToShoppingList) {
          updates.filter((update) => update.action === 'used').forEach(({ food }) => {
            addShoppingItem(getFoodDisplayName(food), `「${recipe.name}」で使い切り`);
          });
        }
      } catch (error) {
        clearActions();
        alert('在庫を確認してください', error instanceof Error ? error.message : '使用量を選び直してください。');
        return;
      }
      operationId.current = createId('cooking');
      clearActions();
      returnToMainTab(navigation);
    };
    const buttons: AlertButton[] = [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '記録する',
        onPress: () => applyUpdates(false),
      },
    ];
    if (usedNames.length > 0) {
      buttons.push({
        text: '買い物リストにも追加',
        onPress: () => applyUpdates(true),
      });
    }

    alert('調理内容を記録', `${summary}\n\nこの内容で食材を更新しますか？`, buttons);
  };

  const confirmDeleteRecipe = () => {
    alert('レシピを削除', `「${recipe.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          deleteRecipe(recipe.id);
          returnToMainTab(navigation, 'Recipes');
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
        <FoodImage source={{ uri: recipe.image }} style={styles.heroImage} />
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
          <Text accessibilityRole="header" style={styles.sectionTitle}>材料</Text>
          <View style={styles.servingsPanel}>
            {targetServings !== null ? (
              <>
                <View style={styles.servingsRow}>
                  <View>
                    <Text style={styles.servingsLabel}>作る人数</Text>
                    <Text style={styles.servingsBase}>登録分量：{baseServings}人分</Text>
                  </View>
                  <View style={styles.servingsControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="作る人数を減らす"
                      accessibilityState={{ disabled: targetServings <= 1 }}
                      disabled={targetServings <= 1}
                      onPress={() => changeServings(targetServings - 1)}
                      style={[styles.servingsButton, targetServings <= 1 && styles.disabledOption]}
                    >
                      <Ionicons color={colors.primaryDark} name="remove" size={22} />
                    </Pressable>
                    <Text accessibilityLiveRegion="polite" style={styles.servingsValue}>{targetServings}人分</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="作る人数を増やす"
                      accessibilityState={{ disabled: targetServings >= MAX_RECIPE_SERVINGS }}
                      disabled={targetServings >= MAX_RECIPE_SERVINGS}
                      onPress={() => changeServings(targetServings + 1)}
                      style={[styles.servingsButton, targetServings >= MAX_RECIPE_SERVINGS && styles.disabledOption]}
                    >
                      <Ionicons color={colors.primaryDark} name="add" size={22} />
                    </Pressable>
                  </View>
                </View>
                {servingsMultiplier !== 1 ? (
                  <>
                    <Text style={styles.servingsHint}>適量・少々などはそのままです。作り方内の分量・加熱時間は元のままです。</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="登録の人数に戻す" onPress={() => changeServings(baseServings!)} style={styles.servingsReset}>
                      <Text style={styles.servingsResetText}>登録の{baseServings}人分に戻す</Text>
                    </Pressable>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.servingsLabel}>人数未設定</Text>
                <Text style={styles.servingsHint}>登録された分量を表示しています。基準の人数を設定すると、分量を調整できます。</Text>
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate('AddRecipe', { recipeId: recipe.id })} style={styles.servingsReset}>
                  <Text style={styles.servingsResetText}>基準の人数を設定</Text>
                </Pressable>
              </>
            )}
            {servingsNotice ? <Text accessibilityLiveRegion="polite" style={styles.servingsHint}>{servingsNotice}</Text> : null}
          </View>
          <View style={styles.card}>
            <View style={styles.ingredientTableHeader}>
              <Text style={styles.ingredientColumnLabel}>食材</Text>
              <Text style={styles.ingredientColumnLabel}>必要量</Text>
            </View>
            {ingredientRows.map(({ ingredient, food, expiredFood, scaledAmount, stock }, index) => (
              <View
                key={ingredient}
                style={[styles.ingredientRow, index === ingredientRows.length - 1 && styles.lastRow]}
              >
                <View style={styles.ingredientMainRow}>
                  <Text style={styles.ingredientName}>{ingredient}</Text>
                  <IngredientAmount amount={scaledAmount.amount} needsReview={scaledAmount.needsReview} />
                </View>
                <View style={styles.ingredientStockRow}>
                  {isPreparationWater(ingredient) ? (
                    <>
                      <Ionicons color={colors.textMuted} name="water-outline" size={16} />
                      <Text style={styles.stockText}>調理用に用意</Text>
                    </>
                  ) : food ? (
                    <>
                      <Ionicons color={colors.primaryDark} name="cube-outline" size={16} />
                      <Text style={styles.stockText}>
                        {stock.available !== undefined ? '在庫合計 ' : '登録残量 '}<Text style={styles.stockQuantity}>{stock.available !== undefined ? formatFoodQuantity(stock.available, stock.unit!) : formatFoodQuantity(food.quantity, food.quantityUnit)}</Text>
                        {' ・'}{getRemainingLabel(food.expiryDate)}{stock.foods.length > 1 ? '〜' : ''}
                      </Text>
                    </>
                  ) : expiredFood ? (
                    <>
                      <Ionicons color={colors.danger} name="alert-circle-outline" size={16} />
                      <Text style={[styles.stockText, styles.expiredStockText]}>
                        {formatFoodQuantity(expiredFood.quantity, expiredFood.quantityUnit)}・{getRemainingLabel(expiredFood.expiryDate)}（使用対象外）
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.stockText}>在庫未登録</Text>
                  )}
                </View>
                {stock.status !== 'preparation' ? <Text accessibilityLiveRegion="polite" style={[styles.stockAssessment, stock.status === 'shortage' && styles.expiredStockText]}>{getStockLabel(stock)}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.shoppingPanel}>
          <Text accessibilityRole="header" style={styles.shoppingTitle}>買い物の準備</Text>
          <Text style={styles.shoppingHint}>
            不足分と、使える在庫がない材料を追加できます。期限切れは在庫に含めません。要確認の材料は、実際の量を確認してください。
          </Text>
          {missingStockCount > 0 ? (
            <PrimaryButton
              disabled={shoppingCandidates.length === 0}
              icon="basket-outline"
              label={shoppingCandidates.length > 0 ? `材料${shoppingCandidates.length}品を買い物に追加` : '対象の材料は追加済み'}
              onPress={addMissingToShopping}
              variant="outline"
            />
          ) : null}
          {shoppingNotice ? <Text accessibilityLiveRegion="polite" style={styles.shoppingNotice}>{shoppingNotice}</Text> : null}
          {missingStockCount > 0 && shoppingCandidates.length === 0 ? <Text style={styles.shoppingHint}>追加済みの分量は買い物リストで確認できます。</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ShoppingList')} style={styles.shoppingLink}>
            <Text style={styles.servingsResetText}>買い物リストを見る</Text>
            <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
          </Pressable>
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
            期限が近い在庫から使用量を割り当てます。使用後の残量を確認してください。単位を換算できない場合や分量不足の場合は、実際の使用量を入力してください。
          </Text>
          {matchedFoods.length === 0 ? (
            <View style={styles.noMatchedFoods}>
              <Ionicons color={colors.textMuted} name="information-circle-outline" size={21} />
              <Text style={styles.noMatchedFoodsText}>更新できる登録食材はありません。</Text>
            </View>
          ) : (
            <>
              <View style={styles.quickActionRow}>
                <Pressable accessibilityRole="button" onPress={selectSuggestedActions} style={styles.quickActionButton}>
                  <Text style={styles.quickActionText}>使った分を自動選択</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={selectUsedActions} style={styles.quickActionButton}>
                  <Text style={styles.quickActionText}>全部使い切る</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={clearActions} style={[styles.quickActionButton, styles.clearActionButton]}>
                  <Text style={[styles.quickActionText, styles.clearActionText]}>クリア</Text>
                </Pressable>
              </View>
              <View style={styles.consumptionList}>
                {matchedFoods.map(({ food, ingredients }, lotIndex) => {
                  const selectedAction = actions[food.id] ?? 'none';
                  return (
                    <View key={food.id} testID={`consumption-${food.id}`} style={styles.consumptionCard}>
                      <View style={styles.consumptionHeader}>
                        <View>
                          <Text style={styles.consumptionName}>{getFoodDisplayName(food)}</Text>
                          <Text style={styles.consumptionMeta}>
                            {ingredients.join('・')}として使用／現在{formatFoodQuantity(food.quantity, food.quantityUnit)}
                          </Text>
                          <Text style={styles.consumptionMeta}>
                            在庫{lotIndex + 1}・期限 {food.expiryDate}・{food.storage === 'refrigerated' ? '冷蔵' : food.storage === 'frozen' ? '冷凍' : '常温'}
                          </Text>
                          <Text accessibilityLiveRegion="polite" style={styles.stockAssessment}>
                            使用後：{selectedAction === 'used' ? formatFoodQuantity(0, food.quantityUnit)
                              : selectedAction === 'partial'
                                ? isValidQuantity(usedAmounts[food.id] ?? '') && parseQuantityInput(usedAmounts[food.id]) <= food.quantity
                                  ? formatFoodQuantity(subtractQuantity(food.quantity, parseQuantityInput(usedAmounts[food.id])), food.quantityUnit)
                                  : '使用量を確認してください'
                                : formatFoodQuantity(food.quantity, food.quantityUnit)}
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
                          onPress={() => selectPartialAction(food)}
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
                            accessibilityLabel={`${getFoodDisplayName(food)}の使用量${matchedFoods.filter((item) => getFoodDisplayName(item.food) === getFoodDisplayName(food)).length > 1 ? `（在庫${lotIndex + 1}・期限${food.expiryDate}）` : ''}`}
                            keyboardType="decimal-pad"
                            maxLength={8}
                            onChangeText={(value) => setUsedAmounts((current) => ({ ...current, [food.id]: value }))}
                            placeholder="使用量"
                            placeholderTextColor={colors.textMuted}
                            style={styles.usageInput}
                            value={usedAmounts[food.id] ?? ''}
                          />
                          <Text style={styles.usageUnit}>{foodQuantityUnitLabels[food.quantityUnit]}</Text>
                          <Text style={styles.quantityNote}>登録残量以下で入力してください。</Text>
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

function IngredientAmount({ amount, needsReview }: { amount: string; needsReview: boolean }) {
  const parts = amount.match(/^(.*?)\s*(（[^（）]*）|\([^()]*\))$/);
  const hasNote = Boolean(parts?.[1].trim());
  return (
    <View style={styles.ingredientAmountGroup}>
      <Text style={styles.ingredientAmount}>{hasNote ? parts![1] : amount}</Text>
      {hasNote ? <Text style={styles.ingredientAmountNote}>{parts![2]}</Text> : null}
      {needsReview ? <Text style={styles.ingredientAmountNote}>元の分量・要確認</Text> : null}
    </View>
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
  shoppingPanel: { gap: spacing.sm },
  shoppingTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  shoppingHint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  shoppingNotice: { color: colors.primaryDark, fontSize: 13, lineHeight: 20 },
  shoppingLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  servingsPanel: { backgroundColor: colors.primarySoft, borderRadius: radius.md, gap: spacing.sm, marginBottom: spacing.sm, padding: 12 },
  servingsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  servingsLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  servingsBase: { color: colors.primaryDark, fontSize: 12, marginTop: 4 },
  servingsControls: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  servingsButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, height: 44, width: 44 },
  servingsValue: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 56, textAlign: 'center' },
  servingsHint: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  servingsReset: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  servingsResetText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  ingredientTableHeader: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  ingredientColumnLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  ingredientRow: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 7, paddingVertical: 14 },
  ingredientMainRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  ingredientName: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 25, minWidth: 0 },
  ingredientAmountGroup: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '58%' },
  ingredientAmount: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 25, textAlign: 'right' },
  ingredientAmountNote: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 2, textAlign: 'right' },
  ingredientStockRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stockAssessment: { color: colors.primaryDark, fontSize: 13, lineHeight: 20 },
  stockText: { color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 20 },
  stockQuantity: { color: colors.primaryDark, fontWeight: '700' },
  expiredStockText: { color: colors.danger },
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
