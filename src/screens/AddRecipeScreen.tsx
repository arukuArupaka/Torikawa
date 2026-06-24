import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FoodImagePicker } from '../components/FoodImagePicker';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { RecipeCategorySelector } from '../components/RecipeCategorySelector';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { persistFoodImage } from '../services/imageStorage';
import { NewRecipe, RecipeCategory } from '../types';
import { inferRecipeCategory } from '../utils/recipeCategory';

type Props = NativeStackScreenProps<RootStackParamList, 'AddRecipe'>;

type IngredientInput = {
  id: string;
  name: string;
  amount: string;
};

type StepInput = {
  id: string;
  text: string;
};

const fallbackImage = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800';

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AddRecipeScreen({ navigation, route }: Props) {
  const { addRecipe, recipes, updateRecipe } = useAppData();
  const existingRecipe = recipes.find((recipe) => recipe.id === route.params?.recipeId);
  const isEditing = Boolean(existingRecipe);
  const [name, setName] = useState(existingRecipe?.name ?? '');
  const [image, setImage] = useState(existingRecipe?.image ?? fallbackImage);
  const [category, setCategory] = useState<RecipeCategory>(
    existingRecipe?.category ?? inferRecipeCategory(existingRecipe?.name ?? ''),
  );
  const [minutes, setMinutes] = useState(String(existingRecipe?.minutes ?? 15));
  const [ingredients, setIngredients] = useState<IngredientInput[]>(
    existingRecipe
      ? existingRecipe.ingredients.map((ingredient) => ({
          id: createLocalId('ingredient'),
          name: ingredient,
          amount: existingRecipe.ingredientAmounts[ingredient] ?? '',
        }))
      : [{ id: createLocalId('ingredient'), name: '', amount: '' }],
  );
  const [steps, setSteps] = useState<StepInput[]>(
    existingRecipe
      ? existingRecipe.steps.map((step) => ({ id: createLocalId('step'), text: step }))
      : [{ id: createLocalId('step'), text: '' }],
  );
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const parsedMinutes = Number(minutes);
  const minutesValid = /^\d+$/.test(minutes)
    && Number.isInteger(parsedMinutes)
    && parsedMinutes >= 1
    && parsedMinutes <= 999;

  const updateIngredient = (id: string, field: 'name' | 'amount', value: string) => {
    setIngredients((current) => current.map((ingredient) =>
      ingredient.id === id ? { ...ingredient, [field]: value } : ingredient,
    ));
  };

  const moveStep = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    setSubmitted(true);
    const validIngredients = ingredients.filter((ingredient) => ingredient.name.trim());
    const validSteps = steps.filter((step) => step.text.trim());
    if (!name.trim() || !minutesValid || validIngredients.length === 0 || validSteps.length === 0) {
      Alert.alert(
        '入力内容を確認してください',
        '料理名、1〜999分の調理時間、材料1件以上、手順1件以上が必要です。',
      );
      return;
    }
    const normalizedIngredientNames = validIngredients.map((ingredient) =>
      ingredient.name.trim().toLocaleLowerCase('ja-JP'),
    );
    if (new Set(normalizedIngredientNames).size !== normalizedIngredientNames.length) {
      Alert.alert('材料名が重複しています', '同じ材料は1件にまとめて入力してください。');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);

    let savedImage = image;
    try {
      if (image !== existingRecipe?.image) savedImage = persistFoodImage(image);
    } catch (error) {
      console.warn('レシピ画像を保存できませんでした。', error);
      Alert.alert('画像を保存できませんでした', '別の画像を選ぶか、もう一度お試しください。');
      setIsSaving(false);
      return;
    }

    const ingredientNames = validIngredients.map((ingredient) => ingredient.name.trim());
    const input: NewRecipe = {
      name: name.trim(),
      image: savedImage,
      category,
      ingredients: ingredientNames,
      ingredientAmounts: Object.fromEntries(
        validIngredients.map((ingredient) => [
          ingredient.name.trim(),
          ingredient.amount.trim() || '適量',
        ]),
      ),
      steps: validSteps.map((step) => step.text.trim()),
      minutes: parsedMinutes,
    };

    if (existingRecipe) {
      updateRecipe(existingRecipe.id, input);
      navigation.goBack();
      return;
    }

    const recipe = addRecipe(input);
    navigation.replace('RecipeDetail', { recipeId: recipe.id });
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title={isEditing ? 'レシピを編集' : 'レシピを追加'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FoodImagePicker image={image} onChange={setImage} />
          <FormField
            autoFocus={!isEditing}
            error={submitted && !name.trim() ? '料理名を入力してください。' : undefined}
            label="料理名"
            onChangeText={setName}
            placeholder="例：野菜たっぷりスープ"
            value={name}
          />
          <FormField
            error={submitted && !minutesValid ? '1〜999の整数を入力してください。' : undefined}
            label="調理時間（分）"
          >
            <TextInput
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={setMinutes}
              placeholder="15"
              placeholderTextColor={colors.textMuted}
              style={[styles.minutesInput, submitted && !minutesValid && styles.inputError]}
              value={minutes}
            />
          </FormField>

          <FormField label="レシピカテゴリ">
            <RecipeCategorySelector onChange={setCategory} value={category} />
          </FormField>

          <FormField label="材料と分量">
            <View style={styles.dynamicList}>
              {ingredients.map((ingredient, index) => (
                <View key={ingredient.id} style={styles.ingredientRow}>
                  <TextInput
                    onChangeText={(value) => updateIngredient(ingredient.id, 'name', value)}
                    placeholder={`材料${index + 1}`}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.dynamicInput, styles.ingredientNameInput]}
                    value={ingredient.name}
                  />
                  <TextInput
                    onChangeText={(value) => updateIngredient(ingredient.id, 'amount', value)}
                    placeholder="分量"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.dynamicInput, styles.amountInput]}
                    value={ingredient.amount}
                  />
                  <Pressable
                    disabled={ingredients.length === 1}
                    hitSlop={8}
                    onPress={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}
                    style={ingredients.length === 1 && styles.disabledIcon}
                  >
                    <Ionicons color={colors.danger} name="remove-circle-outline" size={23} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => setIngredients((current) => [
                  ...current,
                  { id: createLocalId('ingredient'), name: '', amount: '' },
                ])}
                style={styles.addRowButton}
              >
                <Ionicons color={colors.primary} name="add" size={18} />
                <Text style={styles.addRowButtonText}>材料を追加</Text>
              </Pressable>
            </View>
          </FormField>

          <FormField label="作り方">
            <View style={styles.dynamicList}>
              {steps.map((step, index) => (
                <View key={step.id} style={styles.stepEditor}>
                  <View style={styles.stepEditorHeader}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stepActions}>
                      <Pressable disabled={index === 0} hitSlop={7} onPress={() => moveStep(index, -1)}>
                        <Ionicons color={index === 0 ? colors.border : colors.textMuted} name="arrow-up" size={19} />
                      </Pressable>
                      <Pressable disabled={index === steps.length - 1} hitSlop={7} onPress={() => moveStep(index, 1)}>
                        <Ionicons color={index === steps.length - 1 ? colors.border : colors.textMuted} name="arrow-down" size={19} />
                      </Pressable>
                      <Pressable
                        disabled={steps.length === 1}
                        hitSlop={7}
                        onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
                      >
                        <Ionicons color={steps.length === 1 ? colors.border : colors.danger} name="trash-outline" size={19} />
                      </Pressable>
                    </View>
                  </View>
                  <TextInput
                    multiline
                    onChangeText={(value) => setSteps((current) => current.map((item) =>
                      item.id === step.id ? { ...item, text: value } : item,
                    ))}
                    placeholder="調理手順を入力"
                    placeholderTextColor={colors.textMuted}
                    style={styles.stepInput}
                    textAlignVertical="top"
                    value={step.text}
                  />
                </View>
              ))}
              <Pressable
                onPress={() => setSteps((current) => [
                  ...current,
                  { id: createLocalId('step'), text: '' },
                ])}
                style={styles.addRowButton}
              >
                <Ionicons color={colors.primary} name="add" size={18} />
                <Text style={styles.addRowButtonText}>手順を追加</Text>
              </Pressable>
            </View>
          </FormField>

          <PrimaryButton
            disabled={isSaving}
            icon="save-outline"
            label={isSaving ? '保存中...' : isEditing ? '変更を保存' : 'レシピを保存'}
            onPress={handleSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl },
  minutesInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, height: 48, paddingHorizontal: 14, width: 120 },
  inputError: { borderColor: colors.danger },
  dynamicList: { gap: spacing.sm },
  ingredientRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  dynamicInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 14, height: 46, paddingHorizontal: 11 },
  ingredientNameInput: { flex: 1 },
  amountInput: { width: 94 },
  disabledIcon: { opacity: 0.3 },
  addRowButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingHorizontal: 4, paddingVertical: 7 },
  addRowButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  stepEditor: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: 11 },
  stepEditorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stepNumber: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
  stepNumberText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  stepActions: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  stepInput: { color: colors.text, fontSize: 14, lineHeight: 20, minHeight: 68, paddingTop: 10 },
});
