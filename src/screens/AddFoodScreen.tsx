import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DatePickerField } from '../components/DatePickerField';
import { CategorySelector } from '../components/CategorySelector';
import { FoodImagePicker } from '../components/FoodImagePicker';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { QuantityUnitSelector } from '../components/QuantityUnitSelector';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StorageSelector } from '../components/StorageSelector';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { RootStackParamList } from '../navigation/types';
import { persistFoodImage } from '../services/imageStorage';
import { saveLearnedProduct } from '../services/learnedProductService';
import { FoodCategory, FoodQuantityUnit, NewFoodItem, StorageLocation } from '../types';
import { toDateString } from '../utils/date';
import { foodCategoryLabels, inferFoodCategory } from '../utils/foodCategory';
import { getFoodFallbackImage } from '../utils/foodImages';
import { getDefaultExpiryDate, getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { foodQuantityUnitLabels, isValidQuantity, parseQuantityInput } from '../utils/foodQuantity';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFood'>;

export function AddFoodScreen({ navigation, route }: Props) {
  const { foods, addFood, updateFood } = useAppData();
  const existingFood = foods.find((food) => food.id === route.params?.foodId);
  const isEditing = Boolean(existingFood);
  const initialProductName = existingFood?.productName ?? route.params?.initialProductName ?? null;
  const initialIngredientInfo = normalizeProductToIngredient(
    existingFood?.ingredientName ?? route.params?.initialIngredientName ?? initialProductName ?? route.params?.initialName ?? '',
  );
  const inferredInitialCategory = inferFoodCategory(
    route.params?.initialName ?? initialProductName ?? '',
    route.params?.initialCategory,
  );
  const initialName = existingFood?.name ?? route.params?.initialName ?? '';
  const initialCategory = existingFood?.category
    ?? (initialIngredientInfo.category === 'other' ? inferredInitialCategory : initialIngredientInfo.category);
  const initialPurchaseDate = existingFood?.purchaseDate ?? toDateString(new Date());
  const initialRegistrationDefaults = getFoodRegistrationDefaults({
    category: initialCategory,
    ingredientName: existingFood?.ingredientName ?? route.params?.initialIngredientName ?? initialIngredientInfo.ingredientName,
    name: initialName,
    productName: initialProductName,
    storage: existingFood?.storage ?? route.params?.initialStorage,
  });

  const [name, setName] = useState(initialName);
  const [ingredientEdited, setIngredientEdited] = useState(Boolean(existingFood?.ingredientName ?? route.params?.initialIngredientName));
  const [ingredientName, setIngredientName] = useState(
    existingFood?.ingredientName ?? route.params?.initialIngredientName ?? initialIngredientInfo.ingredientName,
  );
  const [category, setCategory] = useState<FoodCategory>(initialCategory);
  const hasInitialImage = Boolean(existingFood?.image ?? route.params?.initialImage);
  const initialFoodImage = existingFood?.image ?? route.params?.initialImage ?? getFoodFallbackImage({
    category: initialCategory,
    ingredientName: initialIngredientInfo.ingredientName,
    name: initialName,
    productName: initialProductName,
  });
  const [image, setImage] = useState(initialFoodImage);
  const [imageEdited, setImageEdited] = useState(hasInitialImage);
  const [storage, setStorage] = useState<StorageLocation>(
    existingFood?.storage ?? route.params?.initialStorage ?? initialRegistrationDefaults.storage,
  );
  const [storageEdited, setStorageEdited] = useState(Boolean(existingFood?.storage ?? route.params?.initialStorage));
  const [quantity, setQuantity] = useState(String(existingFood?.quantity ?? initialRegistrationDefaults.quantity));
  const [quantityEdited, setQuantityEdited] = useState(Boolean(existingFood?.quantity));
  const [quantityUnit, setQuantityUnit] = useState<FoodQuantityUnit>(
    existingFood?.quantityUnit ?? initialRegistrationDefaults.quantityUnit,
  );
  const [quantityUnitEdited, setQuantityUnitEdited] = useState(Boolean(existingFood?.quantityUnit));
  const [expiryDate, setExpiryDate] = useState(
    existingFood?.expiryDate
      ?? route.params?.initialExpiryDate
      ?? getDefaultExpiryDate(initialPurchaseDate, initialRegistrationDefaults.expiryDays),
  );
  const [expiryDateEdited, setExpiryDateEdited] = useState(Boolean(existingFood?.expiryDate ?? route.params?.initialExpiryDate));
  const [purchaseDate, setPurchaseDate] = useState(initialPurchaseDate);
  const [memo, setMemo] = useState(existingFood?.memo ?? route.params?.initialMemo ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const nameError = submitted && !name.trim() ? '食材名を入力してください。' : undefined;
  const ingredientNameError = submitted && !ingredientName.trim() ? 'レシピ用分類を入力してください。' : undefined;
  const parsedQuantity = parseQuantityInput(quantity);
  const isQuantityValid = isValidQuantity(quantity);
  const quantityError = submitted && !isQuantityValid
    ? '0より大きい数値を入力してください。小数は2桁まで使えます。'
    : undefined;

  const applyRegistrationDefaults = ({
    nextCategory = category,
    nextIngredientName = ingredientName,
    nextName = name,
    nextPurchaseDate = purchaseDate,
    nextStorage = storage,
  }: {
    nextCategory?: FoodCategory;
    nextIngredientName?: string;
    nextName?: string;
    nextPurchaseDate?: string;
    nextStorage?: StorageLocation;
  }) => {
    const defaults = getFoodRegistrationDefaults({
      category: nextCategory,
      ingredientName: nextIngredientName,
      name: nextName,
      productName: initialProductName,
      storage: storageEdited ? nextStorage : undefined,
    });
    const defaultStorage = storageEdited ? nextStorage : defaults.storage;

    if (!storageEdited) setStorage(defaultStorage);
    if (!quantityEdited) setQuantity(String(defaults.quantity));
    if (!quantityUnitEdited) setQuantityUnit(defaults.quantityUnit);
    if (!expiryDateEdited) setExpiryDate(getDefaultExpiryDate(nextPurchaseDate, defaults.expiryDays));
  };

  const handleNameChange = (value: string) => {
    setName(value);
    let nextIngredientName = ingredientName;
    let nextCategory = category;

    if (!initialProductName && !ingredientEdited) {
      const normalized = normalizeProductToIngredient(value);
      nextIngredientName = normalized.ingredientName;
      nextCategory = normalized.category;
      setIngredientName(nextIngredientName);
      setCategory(nextCategory);
    }

    if (!imageEdited) {
      setImage(getFoodFallbackImage({
        category: nextCategory,
        ingredientName: nextIngredientName,
        name: value,
        productName: initialProductName,
      }));
    }
    applyRegistrationDefaults({
      nextCategory,
      nextIngredientName,
      nextName: value,
    });
  };

  const handleIngredientNameChange = (value: string) => {
    setIngredientName(value);
    setIngredientEdited(true);
    const normalized = normalizeProductToIngredient(value);
    const nextCategory = normalized.category === 'other' ? category : normalized.category;
    setCategory(nextCategory);
    if (!imageEdited) {
      setImage(getFoodFallbackImage({
        category: nextCategory,
        ingredientName: value,
        name,
        productName: initialProductName,
      }));
    }
    applyRegistrationDefaults({
      nextCategory,
      nextIngredientName: value,
    });
  };

  const handleCategoryChange = (value: FoodCategory) => {
    setCategory(value);
    if (!imageEdited) {
      setImage(getFoodFallbackImage({
        category: value,
        ingredientName,
        name,
        productName: initialProductName,
      }));
    }
    applyRegistrationDefaults({ nextCategory: value });
  };

  const handleStorageChange = (value: StorageLocation) => {
    setStorage(value);
    setStorageEdited(true);
    if (!expiryDateEdited) {
      const defaults = getFoodRegistrationDefaults({
        category,
        ingredientName,
        name,
        productName: initialProductName,
        storage: value,
      });
      setExpiryDate(getDefaultExpiryDate(purchaseDate, defaults.expiryDays));
    }
  };

  const handleQuantityUnitChange = (value: FoodQuantityUnit) => {
    setQuantityUnit(value);
    setQuantityUnitEdited(true);
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(value);
    setQuantityEdited(true);
  };

  const handleExpiryDateChange = (value: string) => {
    setExpiryDate(value);
    setExpiryDateEdited(true);
  };

  const handlePurchaseDateChange = (value: string) => {
    setPurchaseDate(value);
    applyRegistrationDefaults({ nextPurchaseDate: value });
  };

  const handleImageChange = (value: string) => {
    setImage(value);
    setImageEdited(true);
  };

  const handleSave = async () => {
    setSubmitted(true);
    if (!name.trim() || !ingredientName.trim() || !isQuantityValid || isSaving) return;
    setIsSaving(true);

    let savedImage = image;
    try {
      if (image !== existingFood?.image) savedImage = persistFoodImage(image);
    } catch (error) {
      console.warn('写真を保存できませんでした。', error);
      Alert.alert('写真を保存できませんでした', '別の写真を選ぶか、もう一度お試しください。');
      setIsSaving(false);
      return;
    }

    const input: NewFoodItem = {
      name: name.trim(),
      productName: initialProductName?.trim() || null,
      ingredientName: ingredientName.trim(),
      image: savedImage,
      category,
      tags: Array.from(new Set([
        ingredientName.trim(),
        ...(route.params?.initialTags ?? []),
        ...normalizeProductToIngredient(initialProductName || name).tags,
      ].filter(Boolean))),
      storage,
      quantity: parsedQuantity,
      quantityUnit,
      expiryDate,
      purchaseDate,
      memo: memo.trim(),
    };

    if (existingFood) {
      updateFood(existingFood.id, input);
      navigation.goBack();
      return;
    }

    addFood(input);
    if (route.params?.initialBarcode) {
      try {
        await saveLearnedProduct({
          barcode: route.params.initialBarcode,
          name: input.name,
          image: input.image,
          category: foodCategoryLabels[input.category],
          ingredientName: input.ingredientName,
          tags: input.tags,
          storage: input.storage,
        });
      } catch (error) {
        console.warn('バーコード商品を端末へ保存できませんでした。', error);
      }
    }
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title={isEditing ? '食材を編集' : '食材を追加'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {route.params?.initialBarcode && !isEditing ? (
            <View style={styles.barcodeNotice}>
              <Ionicons color={colors.primary} name="information-circle-outline" size={22} />
              <Text style={styles.barcodeNoticeText}>
                期限日・購入日・保存場所・残量・単位はバーコードから取得できません。内容を確認して保存してください。
              </Text>
            </View>
          ) : null}
          <FoodImagePicker image={image} onChange={handleImageChange} />
          {initialProductName ? (
            <View style={styles.productInfoCard}>
              <Text style={styles.productInfoLabel}>商品名</Text>
              <Text style={styles.productInfoName}>{initialProductName}</Text>
              <Text style={styles.productInfoMeta}>レシピ判定では下の「レシピ用分類」を優先します。</Text>
            </View>
          ) : null}
          <FormField
            autoFocus={!isEditing}
            error={nameError}
            label="表示名"
            onChangeText={handleNameChange}
            placeholder="例：牛乳"
            value={name}
          />
          <FormField
            error={ingredientNameError}
            label="レシピ用分類"
            hint="例：明治おいしい牛乳 → 牛乳。レシピ判定ではこの名前とタグを使います。"
            onChangeText={handleIngredientNameChange}
            placeholder="例：牛乳"
            value={ingredientName}
          />
          <FormField label="カテゴリ">
            <CategorySelector onChange={handleCategoryChange} value={category} />
          </FormField>
          <FormField label="保存場所">
            <StorageSelector onChange={handleStorageChange} value={storage} />
          </FormField>
          <FormField
            error={quantityError}
            label="残量"
            hint={`例：牛乳なら「1000」+「ml」、卵なら「10」+「個」`}
          >
            <View style={styles.quantityRow}>
              <TextInput
                keyboardType="decimal-pad"
                maxLength={8}
                onChangeText={handleQuantityChange}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                style={[styles.quantityInput, quantityError && styles.quantityInputError]}
                value={quantity}
              />
              <Text style={styles.quantityUnit}>{foodQuantityUnitLabels[quantityUnit]}</Text>
            </View>
          </FormField>
          <FormField label="単位">
            <QuantityUnitSelector onChange={handleQuantityUnitChange} value={quantityUnit} />
          </FormField>
          <DatePickerField label="期限日" onChange={handleExpiryDateChange} value={expiryDate} />
          <DatePickerField label="購入日" onChange={handlePurchaseDateChange} value={purchaseDate} />
          <FormField
            label="メモ（任意）"
            multiline
            onChangeText={setMemo}
            placeholder="使い道や補足情報など"
            value={memo}
          />
          <View style={styles.buttonArea}>
            <PrimaryButton
              icon="checkmark"
              disabled={isSaving}
              label={isSaving ? '保存中...' : isEditing ? '変更を保存' : '保存する'}
              onPress={() => void handleSave()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 22, padding: spacing.md, paddingBottom: spacing.xl },
  barcodeNotice: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: 13 },
  barcodeNoticeText: { color: colors.primaryDark, flex: 1, fontSize: 13, lineHeight: 19 },
  productInfoCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  productInfoLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  productInfoName: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 5 },
  productInfoMeta: { color: colors.primaryDark, fontSize: 11, lineHeight: 16, marginTop: 6 },
  quantityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, height: 48, paddingHorizontal: 14, textAlign: 'center', width: 100 },
  quantityInputError: { borderColor: colors.danger },
  quantityUnit: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonArea: { marginTop: spacing.sm },
});
