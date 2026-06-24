import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { generateLocalRecipeIdeas, LocalRecipeIdea } from '../services/localRecipeSuggestionService';
import { FoodItem, Recipe, RecipeCategory } from '../types';
import { daysUntil } from '../utils/date';
import { getFoodIngredientName } from '../utils/ingredientNormalizer';
import { findMatchingFood, normalizeIngredientName } from '../utils/recipeMatching';
import { recipeCategoryLabels, recipeCategoryOptions } from '../utils/recipeCategory';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Recipes'>,
  NativeStackScreenProps<RootStackParamList>
>;

type IngredientMatch = {
  ingredient: string;
  food: FoodItem;
  remainingDays: number;
};

type RecipeSuggestion = Recipe & {
  matches: IngredientMatch[];
  missingIngredients: string[];
  matchRate: number;
  urgentMatches: IngredientMatch[];
  score: number;
};

type RecipeFilter = 'all' | 'favorites' | 'canMake' | 'urgent' | 'quick' | 'missing';

const filterOptions: { key: RecipeFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'すべて', icon: 'grid-outline' },
  { key: 'favorites', label: 'お気に入り', icon: 'heart-outline' },
  { key: 'canMake', label: '今作れる', icon: 'checkmark-circle-outline' },
  { key: 'urgent', label: '期限近い', icon: 'hourglass-outline' },
  { key: 'quick', label: '10分以内', icon: 'flash-outline' },
  { key: 'missing', label: '買い足し', icon: 'basket-outline' },
];

function pickCookpadSearchFoods(foods: FoodItem[]) {
  const seen = new Set<string>();
  return foods
    .filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0)
    .sort((a, b) =>
      daysUntil(a.expiryDate) - daysUntil(b.expiryDate)
      || getFoodIngredientName(a).localeCompare(getFoodIngredientName(b), 'ja'),
    )
    .filter((food) => {
      const normalized = normalizeIngredientName(getFoodIngredientName(food));
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 3);
}

export function RecipesScreen({ navigation }: Props) {
  const { addRecipe, addShoppingItem, foods, recipes, shoppingItems, toggleRecipeFavorite } = useAppData();
  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<RecipeFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'all'>('all');
  const [showLocalIdeas, setShowLocalIdeas] = useState(false);
  const usableFoods = useMemo(
    () => foods.filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0),
    [foods],
  );
  const expiredCount = foods.filter(
    (food) => food.status === 'active' && daysUntil(food.expiryDate) < 0,
  ).length;
  const localIdeas = useMemo(() => generateLocalRecipeIdeas(foods), [foods]);
  const cookpadSearchFoods = useMemo(() => pickCookpadSearchFoods(foods), [foods]);
  const cookpadKeyword = cookpadSearchFoods.map((food) => getFoodIngredientName(food)).join(' ');

  const suggestions = useMemo<RecipeSuggestion[]>(() => recipes
    .map((recipe) => {
      const matches = recipe.ingredients.flatMap((ingredient) => {
        const food = findMatchingFood(ingredient, usableFoods);
        return food
          ? [{ ingredient, food, remainingDays: daysUntil(food.expiryDate) }]
          : [];
      });
      const matchedIngredients = new Set(matches.map((match) => match.ingredient));
      const missingIngredients = recipe.ingredients.filter(
        (ingredient) => !matchedIngredients.has(ingredient),
      );
      const urgentMatches = matches.filter((match) => match.remainingDays <= 3);
      const matchRate = recipe.ingredients.length === 0
        ? 0
        : (matches.length / recipe.ingredients.length) * 100;

      return {
        ...recipe,
        matches,
        missingIngredients,
        matchRate,
        urgentMatches,
        score: matchRate + urgentMatches.length * 30 - missingIngredients.length * 8 - recipe.minutes * 0.2,
      };
    })
    .sort((a, b) => b.score - a.score || b.matchRate - a.matchRate || a.minutes - b.minutes),
  [recipes, usableFoods]);

  const displayedSuggestions = useMemo(() => {
    const normalizedQuery = normalizeIngredientName(query);
    return suggestions.filter((recipe) => {
      const matchesQuery = !normalizedQuery
        || normalizeIngredientName(recipe.name).includes(normalizedQuery)
        || recipe.ingredients.some((ingredient) => normalizeIngredientName(ingredient).includes(normalizedQuery));
      const matchesCategory = selectedCategory === 'all' || recipe.category === selectedCategory;
      const matchesFilter =
        selectedFilter === 'all'
        || (selectedFilter === 'favorites' && recipe.isFavorite)
        || (selectedFilter === 'canMake' && recipe.missingIngredients.length === 0)
        || (selectedFilter === 'urgent' && recipe.urgentMatches.length > 0)
        || (selectedFilter === 'quick' && recipe.minutes <= 10)
        || (selectedFilter === 'missing' && recipe.missingIngredients.length > 0);
      return matchesQuery && matchesCategory && matchesFilter;
    });
  }, [query, selectedCategory, selectedFilter, suggestions]);

  const isPendingShoppingItem = (name: string) => shoppingItems.some(
    (item) => !item.checked
      && normalizeIngredientName(item.name) === normalizeIngredientName(name),
  );

  const confirmAddMissingIngredients = (recipe: RecipeSuggestion) => {
    const addableIngredients = recipe.missingIngredients.filter(
      (ingredient) => !isPendingShoppingItem(ingredient),
    );

    if (addableIngredients.length === 0) {
      Alert.alert('追加済みです', '不足食材はすべて未完了の買い物リストにあります。');
      return;
    }

    const ingredientText = addableIngredients
      .map((ingredient) => `${ingredient}（${recipe.ingredientAmounts[ingredient] ?? '適量'}）`)
      .join('、');

    Alert.alert(
      '不足食材を追加',
      `${ingredientText}を買い物リストに追加しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '追加する',
          onPress: () => {
            addableIngredients.forEach((ingredient) => {
              const amount = recipe.ingredientAmounts[ingredient] ?? '適量';
              addShoppingItem(ingredient, `「${recipe.name}」用 / ${amount}`);
            });
          },
        },
      ],
    );
  };

  const saveLocalIdea = (idea: LocalRecipeIdea) => {
    const alreadySaved = recipes.some(
      (recipe) => normalizeIngredientName(recipe.name) === normalizeIngredientName(idea.name),
    );
    if (alreadySaved) {
      Alert.alert('保存済みです', `「${idea.name}」はすでにマイレシピにあります。`);
      return;
    }

    const recipe = addRecipe(idea);
    Alert.alert('レシピを保存しました', `「${recipe.name}」をマイレシピに追加しました。`, [
      { text: '閉じる' },
      { text: '詳細を見る', onPress: () => navigation.navigate('RecipeDetail', { recipeId: recipe.id }) },
    ]);
  };

  const openCookpadSearch = () => {
    if (!cookpadKeyword) {
      Alert.alert('検索できる食材がありません', '期限切れではない管理中の食材を登録すると、クックパッド検索が使えます。');
      return;
    }

    const url = `https://cookpad.com/search/${encodeURIComponent(cookpadKeyword)}`;
    Alert.alert(
      'クックパッドで検索',
      `クックパッドを開いて「${cookpadKeyword}」で検索します。\n\nレシピ本文や画像はアプリ内に取得しません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '開く',
          onPress: () => {
            Linking.openURL(url).catch((error) => {
              console.warn('クックパッド検索ページを開けませんでした。', error);
              Alert.alert('ページを開けませんでした', '通信状況を確認して、もう一度お試しください。');
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader
        action={{ icon: 'add-circle-outline', label: 'レシピを追加', onPress: () => navigation.navigate('AddRecipe') }}
        subtitle="期限が近い食材を優先"
        title="おすすめレシピ"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Ionicons color={colors.primary} name="sparkles-outline" size={22} />
          <View style={styles.introText}>
            <Text style={styles.introTitle}>今ある食材をおいしく使い切る</Text>
            <Text style={styles.introBody}>
              作れる度、期限の近さ、調理時間からおすすめ順に表示しています。
            </Text>
            {expiredCount > 0 ? (
              <Text style={styles.expiredNote}>期限切れの食材{expiredCount}件は候補から除外しています。</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cookpadCard}>
          <View style={styles.cookpadTextArea}>
            <View style={styles.cookpadTitleRow}>
              <Ionicons color={colors.primary} name="open-outline" size={19} />
              <Text style={styles.cookpadTitle}>クックパッドで探す</Text>
            </View>
            <Text style={styles.cookpadDescription}>
              期限が近い管理中の食材を使って、クックパッドの検索ページを開きます。
            </Text>
            <Text style={styles.cookpadKeyword}>
              検索語：{cookpadKeyword || '食材を登録すると自動で作成'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openCookpadSearch}
            style={({ pressed }) => [styles.cookpadButton, pressed && styles.pressed]}
          >
            <Text style={styles.cookpadButtonText}>開く</Text>
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons color={colors.textMuted} name="search" size={18} />
          <TextInput
            onChangeText={setQuery}
            placeholder="料理名・食材で検索"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            value={query}
          />
        </View>

        <View style={styles.filterWrap}>
          {filterOptions.map((option) => {
            const selected = selectedFilter === option.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.key}
                onPress={() => setSelectedFilter(option.key)}
                style={[styles.filterChip, selected && styles.selectedFilterChip]}
              >
                <Ionicons
                  color={selected ? colors.primaryDark : colors.textMuted}
                  name={option.icon}
                  size={14}
                />
                <Text style={[styles.filterText, selected && styles.selectedFilterText]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.categoryRow}>
            <CategoryFilterChip
              label="カテゴリすべて"
              onPress={() => setSelectedCategory('all')}
              selected={selectedCategory === 'all'}
            />
            {recipeCategoryOptions.map((category) => (
              <CategoryFilterChip
                key={category.value}
                label={category.label}
                onPress={() => setSelectedCategory(category.value)}
                selected={selectedCategory === category.value}
              />
            ))}
          </View>
        </ScrollView>

        <View style={styles.localIdeaPanel}>
          <View style={styles.localIdeaHeader}>
            <View style={styles.localIdeaTitleArea}>
              <Ionicons color={colors.primary} name="bulb-outline" size={20} />
              <View>
                <Text style={styles.localIdeaTitle}>食材からレシピ候補を作る</Text>
                <Text style={styles.localIdeaBody}>AIではなく、端末内の食材ルールで安全に提案します。</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowLocalIdeas((current) => !current)}
              style={styles.localIdeaToggle}
            >
              <Text style={styles.localIdeaToggleText}>{showLocalIdeas ? '閉じる' : '表示'}</Text>
            </Pressable>
          </View>
          {showLocalIdeas ? (
            <View style={styles.localIdeaList}>
              {localIdeas.length === 0 ? (
                <Text style={styles.localIdeaEmpty}>使える食材が増えると、ここに候補が出ます。</Text>
              ) : localIdeas.map((idea) => {
                const alreadySaved = recipes.some(
                  (recipe) => normalizeIngredientName(recipe.name) === normalizeIngredientName(idea.name),
                );
                return (
                  <View key={idea.name} style={styles.localIdeaCard}>
                    <Image source={{ uri: idea.image }} style={styles.localIdeaImage} />
                    <View style={styles.localIdeaInfo}>
                      <Text style={styles.localIdeaName}>{idea.name}</Text>
                      <Text style={styles.localIdeaReason}>{idea.reason}</Text>
                      <Text style={styles.localIdeaMeta}>
                        {recipeCategoryLabels[idea.category]}・約{idea.minutes}分・{idea.usedFoodNames.join('、')}
                      </Text>
                      <Pressable
                        disabled={alreadySaved}
                        onPress={() => saveLocalIdea(idea)}
                        style={[styles.saveIdeaButton, alreadySaved && styles.disabledButton]}
                      >
                        <Ionicons
                          color={alreadySaved ? colors.textMuted : colors.primary}
                          name={alreadySaved ? 'checkmark-circle-outline' : 'bookmark-outline'}
                          size={16}
                        />
                        <Text style={[styles.saveIdeaText, alreadySaved && styles.disabledButtonText]}>
                          {alreadySaved ? '保存済み' : 'マイレシピへ保存'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <Text style={styles.resultSummary}>
          {displayedSuggestions.length}件のレシピを表示中
        </Text>

        {displayedSuggestions.length === 0 ? (
          <View style={styles.emptyRecipes}>
            <Ionicons color={colors.primary} name="restaurant-outline" size={36} />
            <Text style={styles.emptyRecipesTitle}>条件に合うレシピがありません</Text>
            <Text style={styles.emptyRecipesText}>検索語や絞り込みを少しゆるめてみてください。</Text>
          </View>
        ) : null}

        {displayedSuggestions.map((recipe, index) => {
          const addableCount = recipe.missingIngredients.filter(
            (ingredient) => !isPendingShoppingItem(ingredient),
          ).length;
          const missingLabel = recipe.missingIngredients
            .map((ingredient) => `${ingredient}（${recipe.ingredientAmounts[ingredient] ?? '適量'}）`)
            .join('、');
          return (
            <View key={recipe.id} style={styles.card}>
              <View style={styles.imageWrap}>
                <Image source={{ uri: recipe.image }} style={styles.image} />
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>おすすめ {index + 1}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`${recipe.name}をお気に入り${recipe.isFavorite ? 'から外す' : 'に追加'}`}
                  hitSlop={8}
                  onPress={() => toggleRecipeFavorite(recipe.id)}
                  style={styles.favoriteButton}
                >
                  <Ionicons
                    color={recipe.isFavorite ? colors.danger : colors.textMuted}
                    name={recipe.isFavorite ? 'heart' : 'heart-outline'}
                    size={24}
                  />
                </Pressable>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{recipe.name}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{recipeCategoryLabels[recipe.category]}</Text>
                  </View>
                </View>

                <View style={styles.metrics}>
                  <Metric
                    color={colors.primary}
                    icon="restaurant-outline"
                    label="作れる度"
                    value={`${Math.round(recipe.matchRate)}%`}
                  />
                  <Metric
                    color={colors.warning}
                    icon="time-outline"
                    label="期限が近い"
                    value={`${recipe.urgentMatches.length}品`}
                  />
                  <Metric
                    color={colors.textMuted}
                    icon="timer-outline"
                    label="調理時間"
                    value={`約${recipe.minutes}分`}
                  />
                </View>

                {recipe.urgentMatches.length > 0 ? (
                  <View style={styles.urgentNotice}>
                    <Ionicons color={colors.warning} name="hourglass-outline" size={16} />
                    <Text style={styles.urgentNoticeText}>
                      {recipe.urgentMatches.map((match) => match.ingredient).join('、')}を早めに使えます
                    </Text>
                  </View>
                ) : null}

                <View style={styles.chips}>
                  {recipe.ingredients.map((ingredient) => {
                    const match = recipe.matches.find((item) => item.ingredient === ingredient);
                    const urgent = match && match.remainingDays <= 3;
                    return (
                      <View
                        key={ingredient}
                        style={[
                          styles.chip,
                          match && styles.availableChip,
                          urgent && styles.urgentChip,
                        ]}
                      >
                        <Ionicons
                          color={urgent ? colors.warning : match ? colors.primaryDark : colors.textMuted}
                          name={match ? 'checkmark' : 'add'}
                          size={13}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            match && styles.availableChipText,
                            urgent && styles.urgentChipText,
                          ]}
                        >
                          {ingredient}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {recipe.missingIngredients.length === 0 ? (
                  <View style={styles.readyRow}>
                    <Ionicons color={colors.primary} name="checkmark-circle" size={18} />
                    <Text style={styles.readyText}>今ある食材で作れます</Text>
                  </View>
                ) : (
                  <View style={styles.missingArea}>
                    <Text style={styles.missingText}>不足：{missingLabel}</Text>
                    <Pressable
                      disabled={addableCount === 0}
                      onPress={() => confirmAddMissingIngredients(recipe)}
                      style={({ pressed }) => [
                        styles.shoppingButton,
                        addableCount === 0 && styles.disabledButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        color={addableCount === 0 ? colors.textMuted : colors.primary}
                        name={addableCount === 0 ? 'checkmark-circle-outline' : 'basket-outline'}
                        size={17}
                      />
                      <Text style={[styles.shoppingButtonText, addableCount === 0 && styles.disabledButtonText]}>
                        {addableCount === 0 ? '不足食材は追加済み' : `不足食材${addableCount}品を追加`}
                      </Text>
                    </Pressable>
                  </View>
                )}
                <Pressable
                  onPress={() => navigation.navigate('RecipeDetail', { recipeId: recipe.id })}
                  style={({ pressed }) => [styles.detailButton, pressed && styles.pressed]}
                >
                  <Text style={styles.detailButtonText}>材料と作り方を見る</Text>
                  <Ionicons color={colors.surface} name="chevron-forward" size={18} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function CategoryFilterChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.categoryChip, selected && styles.selectedCategoryChip]}
    >
      <Text style={[styles.categoryChipText, selected && styles.selectedCategoryChipText]}>{label}</Text>
    </Pressable>
  );
}

function Metric({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons color={color} name={icon} size={17} />
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  intro: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: 'row', padding: spacing.md },
  introText: { flex: 1, marginLeft: 12 },
  introTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  introBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  expiredNote: { color: colors.danger, fontSize: 10, marginTop: 5 },
  cookpadCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  cookpadTextArea: { flex: 1 },
  cookpadTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  cookpadTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cookpadDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  cookpadKeyword: { color: colors.primaryDark, fontSize: 12, fontWeight: '800', marginTop: 6 },
  cookpadButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10 },
  cookpadButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 13 },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, height: 48, marginLeft: spacing.sm },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  selectedFilterChip: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  selectedFilterText: { color: colors.primaryDark },
  categoryRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md },
  categoryChip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  selectedCategoryChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  selectedCategoryChipText: { color: colors.surface },
  localIdeaPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  localIdeaHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  localIdeaTitleArea: { alignItems: 'flex-start', flex: 1, flexDirection: 'row', gap: spacing.sm },
  localIdeaTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  localIdeaBody: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  localIdeaToggle: { backgroundColor: colors.primarySoft, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  localIdeaToggleText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  localIdeaList: { gap: spacing.sm, marginTop: spacing.md },
  localIdeaEmpty: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  localIdeaCard: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, flexDirection: 'row', padding: 10 },
  localIdeaImage: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 72, width: 72 },
  localIdeaInfo: { flex: 1, marginLeft: 12 },
  localIdeaName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  localIdeaReason: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  localIdeaMeta: { color: colors.primaryDark, fontSize: 10, fontWeight: '700', marginTop: 4 },
  saveIdeaButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, marginTop: 8 },
  saveIdeaText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  resultSummary: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  emptyRecipes: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyRecipesTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: spacing.sm },
  emptyRecipesText: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  imageWrap: { position: 'relative' },
  image: { backgroundColor: colors.primarySoft, height: 165, width: '100%' },
  rankBadge: { backgroundColor: colors.primary, borderRadius: 20, left: 12, paddingHorizontal: 11, paddingVertical: 6, position: 'absolute', top: 12 },
  rankText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  favoriteButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, height: 38, justifyContent: 'center', position: 'absolute', right: 12, top: 12, width: 38 },
  cardBody: { padding: spacing.md },
  nameRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.text, flex: 1, fontSize: 18, fontWeight: '800' },
  categoryBadge: { backgroundColor: colors.primarySoft, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5 },
  categoryBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginTop: 13 },
  metric: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.sm, flex: 1, paddingHorizontal: 4, paddingVertical: 9 },
  metricValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  metricLabel: { color: colors.textMuted, fontSize: 9, marginTop: 2 },
  urgentNotice: { alignItems: 'center', backgroundColor: colors.warningSoft, borderRadius: radius.sm, flexDirection: 'row', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  urgentNoticeText: { color: colors.warning, flex: 1, fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, flexDirection: 'row', gap: 2, paddingHorizontal: 9, paddingVertical: 5 },
  availableChip: { backgroundColor: colors.primarySoft },
  urgentChip: { backgroundColor: colors.warningSoft },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  availableChipText: { color: colors.primaryDark },
  urgentChipText: { color: colors.warning },
  readyRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 14 },
  readyText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  missingArea: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  missingText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  shoppingButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: spacing.sm, minHeight: 42 },
  shoppingButtonText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  disabledButton: { backgroundColor: colors.background, borderColor: colors.border },
  disabledButtonText: { color: colors.textMuted },
  detailButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 12, minHeight: 44 },
  detailButtonText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
