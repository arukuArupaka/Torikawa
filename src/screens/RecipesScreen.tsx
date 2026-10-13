import { FoodImage } from '../components/FoodImage';
import { getRecipeStock, getStockLabel, RecipeStockRow } from '../utils/recipeStock';
import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { generateLocalRecipeIdeas, LocalRecipeIdea } from '../services/localRecipeSuggestionService';
import { FoodItem, Recipe, RecipeCategory } from '../types';
import { daysUntil } from '../utils/date';
import { getFoodIngredientName } from '../utils/ingredientNormalizer';
import { normalizeIngredientName } from '../utils/recipeMatching';
import { getRecipeIngredientAvailability, getRecipeShoppingItems, isPreparationWater } from '../utils/recipeIngredients';
import { recipeCategoryLabels, recipeCategoryOptions } from '../utils/recipeCategory';
import { isValidServings } from '../utils/recipeServings';

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
  stock: RecipeStockRow[];
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
  { key: 'canMake', label: '分量あり', icon: 'checkmark-circle-outline' },
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

export function RecipesScreen({ navigation, route }: Props) {
  const alert = useAppAlert();
  const { addRecipe, addShoppingItem, foods, recipes, shoppingItems, toggleRecipeFavorite } = useAppData();
  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<RecipeFilter>(route?.params?.initialFilter ?? 'all');
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'all'>('all');
  const [showLocalIdeas, setShowLocalIdeas] = useState(false);
  const [hasRequestedIdeas, setHasRequestedIdeas] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExplore, setShowExplore] = useState(false);
  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({});
  const currentDay = useCurrentDay();
  const scrollRef = useRef<ScrollView>(null);
  const initialFilter = route?.params?.initialFilter;

  useEffect(() => {
    if (!initialFilter) return;
    setQuery('');
    setSelectedFilter(initialFilter);
    setSelectedCategory('all');
    setShowFilters(false);
    setShowExplore(false);
    setExpandedRecipes({});
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Consume the request so a later visit from Home can apply it again.
    navigation.setParams({ initialFilter: undefined });
  }, [initialFilter, navigation]);

  const usableFoods = useMemo(
    () => foods.filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0),
    [foods, currentDay],
  );
  const expiredCount = foods.filter(
    (food) => food.status === 'active' && daysUntil(food.expiryDate) < 0,
  ).length;
  // Keep requested results available while nested panels finish closing.
  const localIdeas = useMemo(() => hasRequestedIdeas ? generateLocalRecipeIdeas(foods) : [], [foods, currentDay, hasRequestedIdeas]);
  const cookpadSearchFoods = useMemo(() => pickCookpadSearchFoods(foods), [foods, currentDay]);
  const cookpadKeyword = cookpadSearchFoods.map((food) => getFoodIngredientName(food)).join(' ');

  const suggestions = useMemo<RecipeSuggestion[]>(() => recipes
    .map((recipe) => {
      const availability = getRecipeIngredientAvailability(recipe, usableFoods);
      const matches = availability.matches.map((match) => ({ ...match, remainingDays: daysUntil(match.food.expiryDate) }));
      const { missingIngredients, matchRate } = availability;
      const urgentMatches = matches.filter((match) => match.remainingDays <= 3);

      return {
        ...recipe,
        stock: getRecipeStock(recipe, usableFoods),
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
        || (selectedFilter === 'canMake' && recipe.stock.some((row) => row.status === 'sufficient') && recipe.stock.every((row) => row.status === 'sufficient' || row.status === 'preparation'))
        || (selectedFilter === 'urgent' && recipe.urgentMatches.length > 0)
        || (selectedFilter === 'quick' && recipe.minutes <= 10)
        || (selectedFilter === 'missing' && recipe.stock.some((row) => row.status === 'missing' || row.status === 'shortage'));
      return matchesQuery && matchesCategory && matchesFilter;
    });
  }, [query, selectedCategory, selectedFilter, suggestions]);

  const activeFilterLabels = [
    selectedFilter !== 'all' ? filterOptions.find((option) => option.key === selectedFilter)?.label : null,
    selectedCategory !== 'all' ? recipeCategoryLabels[selectedCategory] : null,
  ].filter(Boolean);
  const hasSearchConditions = query.trim().length > 0 || activeFilterLabels.length > 0;
  const clearSearchConditions = () => {
    setQuery('');
    setSelectedFilter('all');
    setSelectedCategory('all');
  };

  const confirmAddMissingIngredients = (recipe: RecipeSuggestion) => {
    const items = getRecipeShoppingItems(recipe, foods, shoppingItems);
    if (items.length === 0) {
      alert('追加済みです', '不足食材はすべて未完了の買い物リストにあります。');
      return;
    }
    const ingredientText = items.map((item) => {
      const row = recipe.stock.find((stock) => stock.ingredient === item.name)!;
      return `${item.name}（${row.status === 'shortage' ? getStockLabel(row) : recipe.ingredientAmounts[item.name] ?? '適量'}）`;
    }).join('、');
    alert('不足食材を追加', `${ingredientText}を買い物リストに追加しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '追加する', onPress: () => items.forEach((item) => addShoppingItem(item.name, item.memo)) },
    ]);
  };

  const saveLocalIdea = (idea: LocalRecipeIdea) => {
    const alreadySaved = recipes.some(
      (recipe) => normalizeIngredientName(recipe.name) === normalizeIngredientName(idea.name),
    );
    if (alreadySaved) {
      alert('保存済みです', `「${idea.name}」はすでにマイレシピにあります。`);
      return;
    }

    const recipe = addRecipe(idea);
    alert('レシピを保存しました', `「${recipe.name}」をマイレシピに追加しました。`, [
      { text: '閉じる' },
      { text: '詳細を見る', onPress: () => navigation.navigate('RecipeDetail', { recipeId: recipe.id }) },
    ]);
  };

  const openCookpadSearch = () => {
    if (!cookpadKeyword) {
      alert('検索できる食材がありません', '期限切れではない管理中の食材を登録すると、クックパッド検索が使えます。');
      return;
    }

    const url = `https://cookpad.com/search/${encodeURIComponent(cookpadKeyword)}`;
    alert(
      'クックパッドで検索',
      `クックパッドを開いて「${cookpadKeyword}」で検索します。\n\nレシピ本文や画像はアプリ内に取得しません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '開く',
          onPress: () => {
            Linking.openURL(url).catch((error) => {
              console.warn('クックパッド検索ページを開けませんでした。', error);
              alert('ページを開けませんでした', '通信状況を確認して、もう一度お試しください。');
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
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AnimatedDisclosure expanded={showFilters} contentStyle={styles.disclosureContent} header={<View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textMuted} name="search" size={19} />
            <TextInput
              accessibilityLabel="料理名・食材で検索"
              onChangeText={setQuery}
              placeholder="料理名・食材"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            {query ? (
              <Pressable accessibilityLabel="検索語をクリア" accessibilityRole="button" onPress={() => setQuery('')} style={styles.clearQuery}>
                <Ionicons color={colors.textMuted} name="close-circle" size={20} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="絞り込み"
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }} aria-expanded={showFilters}
            onPress={() => setShowFilters((current) => !current)}
            style={[styles.filterToggle, (showFilters || activeFilterLabels.length > 0) && styles.selectedFilterChip]}
          >
            <Ionicons color={colors.primaryDark} name="options-outline" size={20} />
            <Text style={styles.filterToggleText}>絞り込み</Text>
          </Pressable>
        </View>}>
          <View style={styles.filterPanel}>
            <Text style={styles.controlLabel}>条件</Text>
            <View style={styles.filterWrap}>
              {filterOptions.map((option) => {
                const selected = selectedFilter === option.key;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }} aria-pressed={selected}
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

            <Text style={styles.controlLabel}>カテゴリ</Text>
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
            <Pressable accessibilityRole="button" onPress={() => setShowFilters(false)} style={styles.applyFilters}>
              <Text style={styles.detailButtonText}>{displayedSuggestions.length}件のレシピを見る</Text>
            </Pressable>
          </View>
        </AnimatedDisclosure>

        {activeFilterLabels.length > 0 ? (
          <View style={styles.activeFilters}>
            <Text style={styles.activeFilterText}>{activeFilterLabels.join('・')}</Text>
            <Pressable accessibilityLabel="検索と絞り込みをリセット" accessibilityRole="button" onPress={clearSearchConditions} style={styles.resetButton}>
              <Text style={styles.textLink}>リセット</Text>
              <Ionicons color={colors.primaryDark} name="close" size={16} />
            </Pressable>
          </View>
        ) : null}

        <AnimatedDisclosure expanded={showExplore} contentStyle={styles.disclosureContent} header={<View style={styles.sectionHeading}>
          <View style={styles.resultHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{hasSearchConditions ? '検索結果' : '今日のおすすめ'}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.resultSummary}>{displayedSuggestions.length}件</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showExplore }} aria-expanded={showExplore}
            onPress={() => setShowExplore((current) => !current)}
            style={styles.exploreToggle}
          >
            <Text style={styles.textLink}>もっと探す</Text>
            <Ionicons color={colors.primaryDark} name={showExplore ? 'chevron-up' : 'chevron-down'} size={16} />
          </Pressable>
        </View>}>
          <View style={styles.explorePanel}>
            <View style={styles.intro}>
              <Ionicons color={colors.primary} name="sparkles-outline" size={22} />
              <View style={styles.introText}>
                <Text style={styles.introTitle}>今ある食材をおいしく使い切る</Text>
                <Text style={styles.introBody}>
                  材料の種類・期限・調理時間でおすすめします。分量が足りるかは詳細で確認してください。
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

            <View style={styles.localIdeaPanel}>
              <AnimatedDisclosure expanded={showLocalIdeas} header={<View style={styles.localIdeaHeader}>
                <View style={styles.localIdeaTitleArea}>
                  <Ionicons color={colors.primary} name="bulb-outline" size={20} />
                  <View style={styles.localIdeaCopy}>
                    <Text style={styles.localIdeaTitle}>食材からレシピ候補を作る</Text>
                    <Text style={styles.localIdeaBody}>登録中の食材を組み合わせて候補を提案します。</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="食材からレシピ候補を作る"
                  accessibilityState={{ expanded: showLocalIdeas }} aria-expanded={showLocalIdeas}
                  onPress={() => { setHasRequestedIdeas(true); setShowLocalIdeas((current) => !current); }}
                  style={styles.localIdeaToggle}
                >
                  <Text style={styles.localIdeaToggleText}>{showLocalIdeas ? '閉じる' : '表示'}</Text>
                </Pressable>
              </View>}>
                <View style={styles.localIdeaList}>
                  {localIdeas.length === 0 ? (
                    <Text style={styles.localIdeaEmpty}>使える食材が増えると、ここに候補が出ます。</Text>
                  ) : localIdeas.map((idea) => {
                    const alreadySaved = recipes.some(
                      (recipe) => normalizeIngredientName(recipe.name) === normalizeIngredientName(idea.name),
                    );
                    return (
                      <View key={idea.name} style={styles.localIdeaCard}>
                        <FoodImage source={{ uri: idea.image }} style={styles.localIdeaImage} />
                        <View style={styles.localIdeaInfo}>
                          <Text style={styles.localIdeaName}>{idea.name}</Text>
                          <Text style={styles.localIdeaReason}>{idea.reason}</Text>
                          <Text style={styles.localIdeaMeta}>
                            {recipeCategoryLabels[idea.category]}・約{idea.minutes}分・{idea.usedFoodNames.join('、')}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${idea.name}をマイレシピへ保存`}
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
              </AnimatedDisclosure>
            </View>
          </View>
        </AnimatedDisclosure>

        {displayedSuggestions.length === 0 ? (
          <View style={styles.emptyRecipes}>
            <Ionicons color={colors.primary} name="restaurant-outline" size={36} />
            <Text style={styles.emptyRecipesTitle}>条件に合うレシピがありません</Text>
            <Text style={styles.emptyRecipesText}>検索語や絞り込みを少しゆるめてみてください。</Text>
            {hasSearchConditions ? (
              <Pressable accessibilityRole="button" onPress={clearSearchConditions} style={styles.resetButton}>
                <Text style={styles.textLink}>条件をリセット</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {displayedSuggestions.map((recipe, index) => {
          const expanded = Boolean(expandedRecipes[recipe.id]);
          const addableCount = getRecipeShoppingItems(recipe, foods, shoppingItems).length;
          const needed = recipe.stock.filter((row) => row.status === 'missing' || row.status === 'shortage');
          const reviewCount = recipe.stock.filter((row) => row.status === 'review').length;
          const stockSummary = needed.length > 0 ? `買い足し ${needed.length}品${reviewCount > 0 ? `・要確認 ${reviewCount}品` : ''}`
            : reviewCount > 0 ? `分量は要確認 ${reviewCount}品` : '登録分量がそろっています';
          const missingLabel = needed.map((row) => `${row.ingredient}（${row.status === 'shortage' ? getStockLabel(row) : recipe.ingredientAmounts[row.ingredient] ?? '適量'}）`).join('、');
          return (
            <View key={recipe.id} style={styles.card}>
              <View style={styles.imageWrap}>
                <FoodImage source={{ uri: recipe.image }} style={styles.image} />
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>おすすめ {index + 1}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: recipe.isFavorite }} aria-pressed={recipe.isFavorite}
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

                <View style={styles.recipeMeta}>
                  <Ionicons color={colors.textMuted} name="time-outline" size={17} />
                  <Text style={styles.recipeMetaText}>約{recipe.minutes}分</Text>
                  <Text style={styles.recipeMetaText}>{isValidServings(recipe.servings) ? `${recipe.servings}人分` : '人数未設定'}</Text>
                  <Text style={styles.metaDivider}>・</Text>
                  <Text style={styles.recipeMetaText}>材料 {recipe.matches.length}/{recipe.matches.length + recipe.missingIngredients.length}種類</Text>
                </View>
                {recipe.matches.length > 0 ? (
                  <Text style={styles.availableSummary}>使える食材：{recipe.matches.map((match) => match.ingredient).join('、')}</Text>
                ) : null}

                {recipe.urgentMatches.length > 0 ? (
                  <View style={styles.urgentNotice}>
                    <Ionicons color={colors.warning} name="hourglass-outline" size={16} />
                    <Text style={styles.urgentNoticeText}>
                      {recipe.urgentMatches.map((match) => match.ingredient).join('、')}を早めに使えます
                    </Text>
                  </View>
                ) : null}

                <AnimatedDisclosure expanded={expanded} header={<Pressable
                  accessibilityLabel={`${recipe.name}の材料の確認`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }} aria-expanded={expanded}
                  onPress={() => setExpandedRecipes((current) => ({ ...current, [recipe.id]: !current[recipe.id] }))}
                  style={styles.materialToggle}
                >
                  <Text style={styles.materialToggleText}>
                    {stockSummary}
                  </Text>
                  <View style={styles.materialToggleAction}>
                    <Text style={styles.textLink}>{expanded ? '閉じる' : '確認'}</Text>
                    <Ionicons color={colors.primaryDark} name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
                  </View>
                </Pressable>}>
                  <View style={styles.materialDetails}>
                    <Text style={styles.amountNote}>登録分量で判定しています。人数変更・要確認の材料は詳細で確認できます。</Text>
                    <View style={styles.metrics}>
                      <Metric
                        color={colors.primary}
                        icon="restaurant-outline"
                        label="材料の一致率"
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
                              name={isPreparationWater(ingredient) ? 'water-outline' : match ? 'checkmark' : 'add'}
                              size={13}
                            />
                            <Text
                              style={[
                                styles.chipText,
                                match && styles.availableChipText,
                                urgent && styles.urgentChipText,
                              ]}
                            >
                              {isPreparationWater(ingredient) ? `${ingredient}（調理用）` : ingredient}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {needed.length === 0 ? (
                      <View style={styles.readyRow}>
                        <Ionicons color={colors.primary} name={reviewCount > 0 ? 'help-circle-outline' : 'checkmark-circle'} size={18} />
                        <Text style={styles.readyText}>{stockSummary}</Text>
                      </View>
                    ) : (
                      <View style={styles.missingArea}>
                        <Text style={styles.missingText}>不足：{missingLabel}</Text>
                        <Pressable
                          accessibilityRole="button"
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
                  </View>
                </AnimatedDisclosure>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${recipe.name}の材料と作り方を見る`}
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
      accessibilityState={{ selected }} aria-pressed={selected}
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
  disclosureContent: { paddingTop: spacing.md },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  clearQuery: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 36 },
  filterToggle: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 12 },
  filterToggleText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  filterPanel: { backgroundColor: colors.surface, borderRadius: radius.md, gap: 12, padding: spacing.md },
  controlLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  applyFilters: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: 'center', minHeight: 44, padding: 10 },
  activeFilters: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, paddingLeft: 12 },
  activeFilterText: { color: colors.primaryDark, flex: 1, fontSize: 14 },
  resetButton: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  textLink: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  resultHeading: { alignItems: 'center', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  exploreToggle: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 44 },
  explorePanel: { gap: spacing.md },
  recipeMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  recipeMetaText: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  metaDivider: { color: colors.textMuted, fontSize: 14 },
  availableSummary: { color: colors.primaryDark, fontSize: 14, lineHeight: 21, marginTop: 8 },
  materialToggle: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: 12, minHeight: 48, paddingVertical: 8 },
  materialToggleText: { color: colors.textMuted, flex: 1, fontSize: 14, lineHeight: 21 },
  materialToggleAction: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  materialDetails: { paddingBottom: 8 },
  amountNote: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  intro: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: 'row', padding: spacing.md },
  introText: { flex: 1, marginLeft: 12 },
  introTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  introBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  expiredNote: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 5 },
  cookpadCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  cookpadTextArea: { flex: 1 },
  cookpadTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  cookpadTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cookpadDescription: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  cookpadKeyword: { color: colors.primaryDark, fontSize: 14, fontWeight: '700', marginTop: 6 },
  cookpadButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  cookpadButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', minWidth: 0, paddingHorizontal: 12 },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, minHeight: 48, minWidth: 0, marginLeft: spacing.sm },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  selectedFilterChip: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  selectedFilterText: { color: colors.primaryDark },
  categoryRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md },
  categoryChip: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  selectedCategoryChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  selectedCategoryChipText: { color: colors.surface },
  localIdeaPanel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  localIdeaHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  localIdeaTitleArea: { alignItems: 'flex-start', flex: 1, flexDirection: 'row', gap: spacing.sm },
  localIdeaCopy: { flex: 1 },
  localIdeaTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  localIdeaBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  localIdeaToggle: { backgroundColor: colors.primarySoft, borderRadius: 22, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  localIdeaToggleText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  localIdeaList: { gap: spacing.sm, marginTop: spacing.md },
  localIdeaEmpty: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  localIdeaCard: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, flexDirection: 'row', padding: 10 },
  localIdeaImage: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 72, width: 72 },
  localIdeaInfo: { flex: 1, marginLeft: 12 },
  localIdeaName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  localIdeaReason: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 3 },
  localIdeaMeta: { color: colors.primaryDark, fontSize: 13, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  saveIdeaButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, marginTop: 8, minHeight: 44 },
  saveIdeaText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  resultSummary: { color: colors.textMuted, fontSize: 14 },
  emptyRecipes: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xl },
  emptyRecipesTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: spacing.sm },
  emptyRecipesText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  imageWrap: { position: 'relative' },
  image: { backgroundColor: colors.primarySoft, height: 180, width: '100%' },
  rankBadge: { backgroundColor: colors.primary, borderRadius: 20, left: 12, paddingHorizontal: 11, paddingVertical: 6, position: 'absolute', top: 12 },
  rankText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  favoriteButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', position: 'absolute', right: 12, top: 12, width: 44 },
  cardBody: { padding: spacing.md },
  nameRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.text, flex: 1, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  categoryBadge: { backgroundColor: colors.primarySoft, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5 },
  categoryBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginTop: 13 },
  metric: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.sm, flex: 1, paddingHorizontal: 4, paddingVertical: 9 },
  metricValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  metricLabel: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  urgentNotice: { alignItems: 'center', backgroundColor: colors.warningSoft, borderRadius: radius.sm, flexDirection: 'row', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  urgentNoticeText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '600' },
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
  missingText: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  shoppingButton: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: spacing.sm, minHeight: 44 },
  shoppingButtonText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  disabledButton: { backgroundColor: colors.background, borderColor: colors.border },
  disabledButtonText: { color: colors.textMuted },
  detailButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 12, minHeight: 44 },
  detailButtonText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
