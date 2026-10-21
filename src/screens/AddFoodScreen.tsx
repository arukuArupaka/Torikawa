import { normalizeSharedBarcode, validateSharedProduct, SharedProduct, SHARED_RULES_VERSION } from '../../shared/productContract';
import { SharedProductRules } from '../components/SharedProductRules';
import { SharedProductReport } from '../components/SharedProductReport';
import { ProductAttribution } from '../components/ProductAttribution';
import { isSharedProductsConfigured, shareProduct } from '../services/sharedProductService';
import { getRecentFoods } from '../utils/recentFoods';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppToast } from '../context/AppToastContext';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DatePickerField } from '../components/DatePickerField';
import { CategorySelector } from '../components/CategorySelector';
import { FoodImagePicker } from '../components/FoodImagePicker';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { QuantityUnitSelector } from '../components/QuantityUnitSelector';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StorageSelector } from '../components/StorageSelector';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { useCurrentDay } from '../hooks/useCurrentDay';
import { RootStackParamList } from '../navigation/types';
import { returnToMainTab } from '../navigation/returnToMainTab';
import { persistFoodImage } from '../services/imageStorage';
import { getStorageEpoch, assertStorageEpoch } from '../services/storage';
import { correctLearnedProduct, saveLearnedProduct } from '../services/learnedProductService';
import { FoodCategory, FoodItem, FoodQuantityUnit, NewFoodItem, StorageLocation } from '../types';
import type { ProductLookupSource } from '../services/productLookupService';
import { addDays, parseDate, toDateString } from '../utils/date';
import { foodCategoryLabels, foodCategoryOptions, inferFoodCategory } from '../utils/foodCategory';
import { getFoodFallbackImage } from '../utils/foodImages';
import { getDefaultExpiryDate, getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { foodQuantityUnitLabels, isValidQuantity, parseQuantityInput } from '../utils/foodQuantity';
import { getFoodDisplayName, normalizeProductToIngredient } from '../utils/ingredientNormalizer';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFood'>;

const productSourceLabels: Record<ProductLookupSource, string> = {
  learned: '以前の登録内容', shared: 'みんなの商品情報（利用者が登録）', local: '端末内サンプル',
  'yahoo-shopping': 'Yahoo!ショッピング', 'open-food-facts': 'Open Food Facts', none: '未取得',
};

export function AddFoodScreen(props: Props) {
  const { foods, isReady } = useAppData();
  const [templateId, setTemplateId] = useState(props.route.params?.reuseFoodId);
  const [ignoreSharedProduct, setIgnoreSharedProduct] = useState(false);
  if (!isReady) return null;
  const templateFood = props.route.params?.foodId ? undefined : foods.find((food) => food.id === templateId);
  const route = ignoreSharedProduct ? { ...props.route, params: {
    ...props.route.params, initialName: undefined, initialProductName: undefined, initialIngredientName: undefined,
    initialImage: undefined, initialProductSource: undefined, initialCategory: undefined, initialTags: undefined,
    initialStorage: undefined, initialLookupSource: undefined, allowProductSharing: false,
    initialLookupNotice: '共有情報を使わずに入力しています。食材名を入力してください。',
  } } : props.route;
  return <AddFoodForm key={`${props.route.params?.foodId ?? 'new'}:${templateId ?? ''}:${ignoreSharedProduct}`}
    {...props} route={route} templateFood={templateFood} onReuse={setTemplateId} onIgnoreShared={() => setIgnoreSharedProduct(true)} />;
}

function AddFoodForm({ navigation, route, templateFood, onReuse, onIgnoreShared }: Props & {
  templateFood?: FoodItem; onReuse: (id: string) => void; onIgnoreShared: () => void;
}) {
  const alert = useAppAlert();
  const toast = useAppToast();
  const { foods, addFood, updateFood } = useAppData();
  const existingFood = foods.find((food) => food.id === route.params?.foodId);
  const isEditing = Boolean(existingFood);
  const initialProductName = existingFood?.productName ?? templateFood?.productName ?? route.params?.initialProductName ?? null;
  const initialIngredientInfo = normalizeProductToIngredient(
    existingFood?.ingredientName ?? templateFood?.ingredientName ?? route.params?.initialIngredientName ?? initialProductName ?? route.params?.initialName ?? '',
  );
  const inferredInitialCategory = inferFoodCategory(
    route.params?.initialName ?? initialProductName ?? '',
    route.params?.initialCategory,
  );
  const initialName = existingFood ? getFoodDisplayName(existingFood) : templateFood ? getFoodDisplayName(templateFood) : initialProductName ?? route.params?.initialName ?? '';
  const barcode = existingFood?.barcode ?? templateFood?.barcode ?? route.params?.initialBarcode;
  const initialProductSource = existingFood?.productSource ?? templateFood?.productSource ?? route.params?.initialProductSource;
  const initialCategory = existingFood?.category ?? templateFood?.category
    ?? foodCategoryOptions.find((option) => option.label === route.params?.initialCategory)?.value
    ?? (initialIngredientInfo.needsReview ? inferredInitialCategory : initialIngredientInfo.category);
  const initialPurchaseDate = existingFood?.purchaseDate ?? toDateString(new Date());
  const initialRegistrationDefaults = getFoodRegistrationDefaults({
    category: initialCategory,
    ingredientName: existingFood?.ingredientName ?? templateFood?.ingredientName ?? route.params?.initialIngredientName ?? initialIngredientInfo.ingredientName,
    name: initialName,
    productName: initialProductName,
    storage: existingFood?.storage ?? templateFood?.storage ?? route.params?.initialStorage,
  });

  const [name, setName] = useState(initialName);
  const [showFullName, setShowFullName] = useState(false);
  const [ingredientEdited, setIngredientEdited] = useState(Boolean(existingFood?.ingredientName ?? templateFood?.ingredientName ?? route.params?.initialIngredientName));
  const [ingredientName, setIngredientName] = useState(
    existingFood?.ingredientName ?? templateFood?.ingredientName ?? route.params?.initialIngredientName ?? initialIngredientInfo.ingredientName,
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
    existingFood?.storage ?? templateFood?.storage ?? route.params?.initialStorage ?? initialRegistrationDefaults.storage,
  );
  const [storageEdited, setStorageEdited] = useState(Boolean(existingFood?.storage ?? templateFood?.storage ?? route.params?.initialStorage));
  const [quantity, setQuantity] = useState(templateFood ? '' : String(existingFood?.quantity ?? initialRegistrationDefaults.quantity));
  const [quantityEdited, setQuantityEdited] = useState(Boolean(existingFood?.quantity) || Boolean(templateFood));
  const [quantityUnit, setQuantityUnit] = useState<FoodQuantityUnit>(
    existingFood?.quantityUnit ?? templateFood?.quantityUnit ?? initialRegistrationDefaults.quantityUnit,
  );
  const [quantityUnitEdited, setQuantityUnitEdited] = useState(Boolean(existingFood?.quantityUnit ?? templateFood?.quantityUnit));
  const [expiryDate, setExpiryDate] = useState(
    existingFood?.expiryDate
      ?? route.params?.initialExpiryDate
      ?? getDefaultExpiryDate(initialPurchaseDate, initialRegistrationDefaults.expiryDays),
  );
  const [expiryDateEdited, setExpiryDateEdited] = useState(Boolean(existingFood?.expiryDate ?? route.params?.initialExpiryDate));
  const [purchaseDate, setPurchaseDate] = useState(initialPurchaseDate);
  const [memo, setMemo] = useState(existingFood?.memo ?? route.params?.initialMemo ?? '');
  const [showPrevious, setShowPrevious] = useState(false);
  const [previousQuery, setPreviousQuery] = useState(route.params?.initialName ?? '');
  const [formEdited, setFormEdited] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [showIngredientEditor, setShowIngredientEditor] = useState(isEditing);
  const today = useCurrentDay();
  const scrollRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const quantityInputRef = useRef<TextInput>(null);
  const ingredientInputRef = useRef<TextInput>(null);
  const fieldPositions = useRef({ name: 0, quantity: 0, ingredient: 0 });
  const [invalidField, setInvalidField] = useState<{ key: keyof typeof fieldPositions.current } | null>(null);
  const recentFoods = getRecentFoods(foods, previousQuery);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingLock = useRef(false);
  const formEpoch = useRef(getStorageEpoch());
  const correctionPending = useRef(false);
  const [rememberCorrection, setRememberCorrection] = useState(true);
  const [shareSelected, setShareSelected] = useState(false);
  const [savedSharedProduct, setSavedSharedProduct] = useState<SharedProduct | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const sharingLock = useRef(false);
  const [shareError, setShareError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const canOfferSharing = !isEditing && route.params?.allowProductSharing && Boolean(normalizeSharedBarcode(route.params?.initialBarcode));
  const sharingConfigured = isSharedProductsConfigured();
  const productChanged = Boolean(existingFood && (name.trim() !== getFoodDisplayName(existingFood)
    || ingredientName.trim() !== existingFood.ingredientName || category !== existingFood.category));
  const correctionAvailable = Boolean(isEditing && barcode && (productChanged || correctionPending.current));
  const submitSharedProduct = async (product: SharedProduct) => {
    try { assertStorageEpoch(formEpoch.current); } catch { return; }
    if (sharingLock.current) return;
    sharingLock.current = true;
    setSharePending(true);
    setShareError('');
    try {
      const result = await shareProduct(product, SHARED_RULES_VERSION);
      setShareNotice(result === 'already_exists' ? 'このバーコードは共有先に登録済みです。既存の商品情報を保持しました。'
        : result === 'already_shared' ? 'この商品情報は公開済みです。他のユーザーも検索できます。'
        : '商品情報を送信しました。管理者の確認後に公開します。食材はこの端末に登録済みです。');
    } catch (error) {
      setShareError(`食材は登録できましたが、商品情報を共有できませんでした。${error instanceof Error ? error.message : '通信状況を確認して再試行できます。'}`);
    } finally { sharingLock.current = false; setSharePending(false); }
  };

  const nameError = submitted && !name.trim() ? '食材名を入力してください。' : undefined;
  const ingredientNameError = submitted && !ingredientName.trim() ? 'レシピ用分類を入力してください。' : undefined;
  const parsedQuantity = parseQuantityInput(quantity);
  const isQuantityValid = isValidQuantity(quantity);
  const quantityError = submitted && !isQuantityValid
    ? '0より大きい数値を入力してください。小数は2桁まで使えます。'
    : undefined;
  const classificationNeedsReview = Boolean(name.trim() && normalizeProductToIngredient(name).needsReview
    && ingredientName.trim() === name.trim());
  const ingredientEditorVisible = showIngredientEditor || classificationNeedsReview || Boolean(ingredientNameError);
  const quickExpiryDates = [{ label: '今日', days: 0 }, { label: '明日', days: 1 },
    { label: '3日後', days: 3 }, { label: '7日後', days: 7 }];

  useEffect(() => {
    if (!invalidField) return;
    const key = invalidField.key;
    scrollRef.current?.scrollTo({ y: fieldPositions.current[key], animated: true });
    const input = key === 'name' ? nameInputRef : key === 'quantity' ? quantityInputRef : ingredientInputRef;
    input.current?.focus();
  }, [invalidField]);

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
    setFormEdited(true);
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
    setFormEdited(true);
    setShowIngredientEditor(true);
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
    setFormEdited(true);
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
    setFormEdited(true);
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
    setFormEdited(true);
    setQuantityUnit(value);
    setQuantityUnitEdited(true);
  };

  const handleQuantityChange = (value: string) => {
    setFormEdited(true);
    setQuantity(value);
    setQuantityEdited(true);
  };

  const handleExpiryDateChange = (value: string) => {
    setFormEdited(true);
    setExpiryDate(value);
    setExpiryDateEdited(true);
  };

  const handlePurchaseDateChange = (value: string) => {
    setFormEdited(true);
    setPurchaseDate(value);
    applyRegistrationDefaults({ nextPurchaseDate: value });
  };

  const handleImageChange = (value: string) => {
    setFormEdited(true);
    setImage(value);
    setImageEdited(true);
  };

  const handleSave = async () => {
    try { assertStorageEpoch(formEpoch.current); } catch { return; }
    setSubmitted(true);
    if (savingLock.current || savedSharedProduct) return;
    if (!name.trim() || !ingredientName.trim() || !isQuantityValid) {
      const key = !name.trim() ? 'name' : !ingredientName.trim() ? 'ingredient' : 'quantity';
      if (key === 'ingredient') setShowIngredientEditor(true);
      setInvalidField({ key });
      return;
    }
    if (canOfferSharing && sharingConfigured && shareSelected && !validateSharedProduct({ barcode: route.params?.initialBarcode, name, ingredientName, category })) {
      alert('共有する商品情報を確認してください', '商品名は120文字以内、食材分類は60文字以内で、改行せず入力してください。共有を外して食材だけ登録することもできます。');
      return;
    }
    savingLock.current = true;
    setIsSaving(true);

    let savedImage = image;
    try {
      if (image !== existingFood?.image) savedImage = persistFoodImage(image);
    } catch (error) {
      console.warn('写真を保存できませんでした。', error);
      alert('写真を保存できませんでした', '別の写真を選ぶか、もう一度お試しください。');
      setIsSaving(false);
      savingLock.current = false;
      return;
    }

    const input: NewFoodItem = {
      name: name.trim(),
      productName: initialProductName || barcode ? name.trim() : null,
      ...(barcode ? { barcode } : {}),
      ...(initialProductSource ? { productSource: {
        ...initialProductSource,
        modified: initialProductSource.modified || name.trim() !== initialName || ingredientName.trim() !== initialIngredientInfo.ingredientName || category !== initialCategory,
        image: initialProductSource.image?.url === savedImage ? initialProductSource.image : undefined,
      } } : {}),
      ingredientName: ingredientName.trim(),
      image: savedImage,
      category,
      tags: Array.from(new Set([
        ingredientName.trim(),
        ...(templateFood?.tags ?? []),
        ...(route.params?.initialTags ?? []),
        ...normalizeProductToIngredient(ingredientName).tags,
      ].filter(Boolean))),
      storage,
      quantity: parsedQuantity,
      quantityUnit,
      expiryDate,
      purchaseDate,
      memo: memo.trim(),
    };

    if (existingFood) {
      correctionPending.current = rememberCorrection && correctionAvailable;
      updateFood(existingFood.id, input, () => toast('食材の変更を保存しました'));
      if (correctionPending.current && barcode) {
        try {
          await correctLearnedProduct({ barcode, name: input.name, ingredientName: input.ingredientName, category: input.category });
          correctionPending.current = false;
        } catch (error) {
          setIsSaving(false);
          savingLock.current = false;
          alert('次回の商品候補を更新できませんでした', '食材の変更は反映しました。もう一度保存すると端末の商品候補を再更新します。次回への反映を外して保存することもできます。');
          return;
        }
      }
      navigation.goBack();
      return;
    }

    try {
      addFood(input, route.params?.shoppingItemId, () => toast('食材を登録しました'));
    } catch (error) {
      alert('食材を登録できませんでした', error instanceof Error ? error.message : '内容を確認して再試行してください。');
      setIsSaving(false);
      savingLock.current = false;
      return;
    }
    if (barcode) {
      try {
        await saveLearnedProduct({
          barcode,
          name: input.name,
          image: input.image,
          category: foodCategoryLabels[input.category],
          ingredientName: input.ingredientName,
          tags: input.tags,
          storage: input.storage,
          productSource: input.productSource,
        });
      } catch (error) {
        console.warn('バーコード商品を端末へ保存できませんでした。', error);
      }
    }
    try { assertStorageEpoch(formEpoch.current); } catch { return; }
    if (canOfferSharing && sharingConfigured && shareSelected) {
      const shared: SharedProduct = { barcode: normalizeSharedBarcode(route.params?.initialBarcode)!, name: name.trim(), ingredientName: ingredientName.trim(), category };
      setSavedSharedProduct(shared);
      await submitSharedProduct(shared);
      setIsSaving(false);
      return;
    }
    returnToMainTab(navigation);
  };

  if (savedSharedProduct) return <Screen bottomSafe>
    <ScreenHeader title="食材を登録しました" onBack={() => returnToMainTab(navigation)} />
    <View style={styles.shareResult}>
      <Text style={styles.reuseName}>{savedSharedProduct.name}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.reuseHint}>{sharePending ? '商品情報を共有しています...' : shareError || shareNotice}</Text>
      {shareError ? <PrimaryButton label="商品情報の共有を再試行" disabled={sharePending} onPress={() => void submitSharedProduct(savedSharedProduct)} variant="outline" /> : null}
      <PrimaryButton label="ホームへ" onPress={() => returnToMainTab(navigation)} />
    </View>
  </Screen>;

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title={isEditing ? '食材を編集' : templateFood ? 'もう一度登録' : '食材を追加'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {route.params?.initialBarcode && !isEditing ? (
            <View style={styles.barcodeNotice}>
              <View style={styles.barcodeNoticeCopy}>
                <Text style={styles.barcodeNoticeText}>{route.params.initialLookupNotice
                  || (route.params.initialLookupSource === 'none'
                    ? '商品情報が見つかりませんでした。食材名を入力して登録できます。'
                    : '商品名・期限・数量などを確認して保存してください。')}</Text>
                <Text style={styles.barcodeMeta}>{route.params.initialBarcode}
                  {route.params.initialLookupSource && route.params.initialLookupSource !== 'none'
                    ? ` · ${productSourceLabels[route.params.initialLookupSource]}` : ''}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="バーコードを読み取り直す"
                onPress={navigation.goBack} style={styles.rescanButton}>
                <Ionicons color={colors.primaryDark} name="scan-outline" size={20} />
                <Text style={styles.changeLink}>読み直す</Text>
              </Pressable>
            </View>
          ) : null}
          {!isEditing && !templateFood && !route.params?.initialBarcode && !formEdited && foods.length > 0 ? (
            <View style={styles.reusePanel}>
              <AnimatedDisclosure expanded={showPrevious} contentStyle={styles.previousContent} header={<View style={styles.previousHeading}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPrevious }} aria-expanded={showPrevious} onPress={() => setShowPrevious((value) => !value)} style={styles.reuseToggle}>
                <Text style={styles.reuseTitle}>前の登録から選ぶ</Text>
                <Ionicons name={showPrevious ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primaryDark} />
              </Pressable>
              <Text style={styles.reuseHint}>保存場所や単位を引き継いで入力を省略できます。</Text>
              </View>}>
                <TextInput accessibilityLabel="前の登録を検索" placeholder="食材名・商品名で検索" value={previousQuery} onChangeText={setPreviousQuery} style={styles.reuseSearch} />
                {recentFoods.length === 0 ? <Text style={styles.reuseHint}>一致する登録はありません。下のフォームから登録できます。</Text> : recentFoods.map((food) => (
                  <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={`${getFoodDisplayName(food)}の前回の設定を使う`} onPress={() => onReuse(food.id)} style={styles.reuseChoice}>
                    <View style={styles.reuseCopy}>
                      <Text style={styles.reuseName}>{getFoodDisplayName(food)}</Text>
                      <Text style={styles.reuseHint}>{foodCategoryLabels[food.category]}・{storageLabels[food.storage]}・{foodQuantityUnitLabels[food.quantityUnit]}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.primaryDark} />
                  </Pressable>
                ))}
                <Text style={styles.reuseHint}>最近の登録を最大8件表示しています。</Text>
              </AnimatedDisclosure>
              {!showPrevious ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.recentChips}>
                {recentFoods.slice(0, 3).map(food => <Pressable key={food.id} accessibilityRole="button"
                  accessibilityLabel={`${getFoodDisplayName(food)}の前回の設定を使う`} onPress={() => onReuse(food.id)} style={styles.recentChip}>
                  <Text numberOfLines={1} style={styles.recentChipText}>{getFoodDisplayName(food)}</Text>
                </Pressable>)}
              </ScrollView> : null}
            </View>
          ) : null}
          {templateFood ? <View style={styles.reusePanel}>
            <Text style={styles.reuseName}>{initialProductName || name}</Text>
            <Text style={styles.reuseHint}>{foodCategoryLabels[category]}・{storageLabels[storage]}・{foodQuantityUnitLabels[quantityUnit]}</Text>
            <Text style={styles.reuseHint}>前回の設定を引き継ぎました。今回の購入量と期限を確認してください。</Text>
          </View> : null}
          <View onLayout={event => { fieldPositions.current.name = event.nativeEvent.layout.y; }}><FormField
            autoFocus={!isEditing && !templateFood && !initialName && (Boolean(barcode) || foods.length === 0)}
            inputRef={nameInputRef}
            error={nameError}
            label="食材名・商品名"
            onChangeText={handleNameChange}
            onSubmitEditing={() => quantityInputRef.current?.focus()}
            returnKeyType="next"
            submitBehavior="submit"
            placeholder="例：牛乳"
            value={name}
          />
          {name.trim().length > 20 ? <AnimatedDisclosure expanded={showFullName} contentStyle={styles.fullNameContent}
            header={<Pressable accessibilityRole="button"
              accessibilityLabel={showFullName ? '食材名・商品名の全文を閉じる' : '食材名・商品名の全文を見る'}
              accessibilityState={{ expanded: showFullName }} aria-expanded={showFullName}
              onPress={() => setShowFullName(value => !value)} style={styles.fullNameToggle}>
              <Text style={styles.fullNameToggleText}>{showFullName ? '全文を閉じる' : '全文を見る'}</Text>
              <Ionicons color={colors.primaryDark} name={showFullName ? 'chevron-up' : 'chevron-down'} size={17} />
            </Pressable>}>
            <Text selectable testID="food-name-full-text" style={styles.fullNameText}>{name}</Text>
          </AnimatedDisclosure> : null}
          </View>
          <View style={styles.dateGroup}>
            <DatePickerField label="期限日" onChange={handleExpiryDateChange} value={expiryDate} />
            <View style={styles.quickDateRow}>{quickExpiryDates.map(option => {
              const date = toDateString(addDays(parseDate(today), option.days));
              const selected = expiryDateEdited && expiryDate === date;
              return <Pressable key={option.days} accessibilityRole="button" accessibilityLabel={`期限を${option.label}にする`}
                accessibilityState={{ selected }} aria-pressed={selected}
                onPress={() => handleExpiryDateChange(date)} style={[styles.quickDate, selected && styles.quickDateSelected]}>
                <Text style={[styles.quickDateText, selected && styles.quickDateSelectedText]}>{option.label}</Text>
              </Pressable>;
            })}</View>
          {!isEditing && !expiryDateEdited ? (
            <Text style={styles.expiryHint}>目安の日付です。パッケージの期限を確認してください。</Text>
          ) : null}
          </View>
          <View onLayout={event => { fieldPositions.current.quantity = event.nativeEvent.layout.y; }}>
          <FormField
            error={quantityError}
            label={templateFood ? '今回の購入量' : '残量'}
          >
            <View style={styles.quantityRow}>
              <TextInput
                ref={quantityInputRef}
                accessibilityLabel={templateFood ? '今回の購入量' : '残量'}
                accessibilityHint="数値を入力し、右のボタンから単位を変更できます。"
                keyboardType="decimal-pad"
                maxLength={8}
                onChangeText={handleQuantityChange}
                placeholder={templateFood ? '購入量' : '1'}
                placeholderTextColor={colors.textMuted}
                style={[styles.quantityInput, quantityError && styles.quantityInputError]}
                value={quantity}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={`数量の単位を変更（${foodQuantityUnitLabels[quantityUnit]}）`}
                accessibilityState={{ expanded: showUnits }} aria-expanded={showUnits}
                onPress={() => setShowUnits(value => !value)} style={styles.unitButton}>
                <Text style={styles.quantityUnit}>{foodQuantityUnitLabels[quantityUnit]}</Text>
                <Ionicons color={colors.primaryDark} name={showUnits ? 'chevron-up' : 'chevron-down'} size={18} />
              </Pressable>
            </View>
            {showUnits ? <View style={styles.unitChoices}><QuantityUnitSelector onChange={value => {
              handleQuantityUnitChange(value); setShowUnits(false);
            }} value={quantityUnit} /></View> : null}
          </FormField>
          </View>
          <FormField label="保存場所">
            <StorageSelector onChange={handleStorageChange} value={storage} />
          </FormField>
          <View onLayout={event => { fieldPositions.current.ingredient = event.nativeEvent.layout.y; }}>
          {ingredientEditorVisible ? <FormField
            inputRef={ingredientInputRef}
            error={ingredientNameError}
            label="レシピ用分類"
            hint="レシピの材料と照合する名前です。例：商品名 → 牛乳"
            onChangeText={handleIngredientNameChange}
            placeholder="例：牛乳"
            value={ingredientName}
          /> : <Pressable accessibilityRole="button" accessibilityLabel="レシピ用分類を変更"
            onPress={() => setShowIngredientEditor(true)} style={styles.classificationSummary}>
            <View style={styles.reuseCopy}><Text style={styles.reuseHint}>レシピ用分類</Text>
              <Text style={styles.classificationName}>{ingredientName.trim() || '名前から自動入力'}</Text></View>
            <Text style={styles.changeLink}>変更</Text>
          </Pressable>}
          {classificationNeedsReview ? <Text style={styles.reuseHint}>分類を特定できませんでした。加工品を原材料と同じ分類にせず、レシピ用分類を確認してください。</Text> : null}
          </View>
          {correctionAvailable ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rememberCorrection }} aria-checked={rememberCorrection} onPress={() => setRememberCorrection((value) => !value)} style={styles.reusePanel}>
            <Text style={styles.reuseTitle}>{rememberCorrection ? '☑' : '☐'} 次回のスキャンにも商品名・分類を反映</Text>
            <Text style={styles.reuseHint}>この端末の商品候補だけを更新します。今回の期限・残量・保存場所・メモは反映しません。</Text>
          </Pressable> : null}
          <AnimatedDisclosure expanded={showDetails} contentStyle={styles.detailsContent} header={<Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} aria-expanded={showDetails} onPress={() => setShowDetails((value) => !value)} style={styles.reuseToggle}>
            <Text style={styles.reuseTitle}>{showDetails ? 'その他の項目を閉じる' : '写真・カテゴリ・購入日・メモを編集'}</Text>
            <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primaryDark} />
          </Pressable>}>
            <FoodImagePicker image={image} onChange={handleImageChange} />
          <FormField label="カテゴリ">
            <CategorySelector onChange={handleCategoryChange} value={category} />
          </FormField>
          <DatePickerField label="購入日" onChange={handlePurchaseDateChange} value={purchaseDate} />
          <FormField
            label="メモ（任意）"
            multiline
            onChangeText={(value) => { setFormEdited(true); setMemo(value); }}
            placeholder="使い道や補足情報など"
            value={memo}
          />
          </AnimatedDisclosure>
          {route.params?.initialLookupSource === 'shared' && barcode ? <SharedProductReport
            barcode={barcode} onIgnore={onIgnoreShared} /> : null}
          {initialProductSource ? <ProductAttribution source={initialProductSource} image={image} /> : null}
          {canOfferSharing ? <View style={styles.reusePanel}>
            <Text style={styles.reuseTitle}>商品情報の共有（任意）</Text>
            <Text style={styles.reuseHint}>共有するのは次の4項目です。個人の在庫・数量・期限・購入日・保存場所・メモ・写真は送信しません。</Text>
            <Text style={styles.reuseHint}>バーコード：{route.params?.initialBarcode}{'\n'}商品名：{name.trim() || '未入力'}{'\n'}食材分類：{ingredientName.trim() || '未入力'}{'\n'}カテゴリ：{foodCategoryLabels[category]}</Text>
            {sharingConfigured ? <><SharedProductRules /><Pressable accessibilityRole="checkbox" accessibilityLabel="投稿ルールに同意して、この商品情報を共有する" accessibilityState={{ checked: shareSelected }} aria-checked={shareSelected} onPress={() => setShareSelected((value) => !value)} style={styles.shareChoice}>
              <Ionicons name={shareSelected ? 'checkbox' : 'square-outline'} color={colors.primaryDark} size={25} />
              <Text style={styles.shareChoiceText}>投稿ルールに同意して、この商品情報を共有する</Text>
            </Pressable></> : <Text style={styles.reuseHint}>共有機能は準備中です。今回はこの端末に商品情報を保存します。</Text>}
          </View> : null}
        </ScrollView>
          <View style={styles.saveBar}>
            {nameError || ingredientNameError || quantityError ? <Text accessibilityRole="alert" style={styles.saveError}>
              入力内容を確認してください。
            </Text> : null}
            <PrimaryButton
              icon="checkmark"
              disabled={isSaving}
              label={isSaving ? '保存中...' : isEditing ? '変更を保存' : '保存する'}
              onPress={() => void handleSave()}
            />
          </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const storageLabels: Record<StorageLocation, string> = { refrigerated: '冷蔵', frozen: '冷凍', room: '常温' };

const styles = StyleSheet.create({
  shareResult: { padding: spacing.lg, gap: spacing.lg },
  shareChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  shareChoiceText: { flex: 1, color: colors.primaryDark, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  reusePanel: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  previousHeading: { gap: spacing.sm },
  previousContent: { gap: spacing.sm, paddingTop: spacing.sm },
  recentChips: { gap: spacing.sm },
  recentChip: { minHeight: 44, maxWidth: 180, justifyContent: 'center', paddingHorizontal: 12,
    borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  recentChipText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  reuseToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44 },
  reuseTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  reuseName: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  reuseHint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  reuseCopy: { flex: 1, gap: 4 },
  reuseChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 12, minHeight: 56 },
  reuseSearch: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: 12, fontSize: 16, color: colors.text, minHeight: 48 },
  flex: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.lg },
  fullNameToggle: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    minHeight: 44, paddingHorizontal: spacing.sm },
  fullNameToggleText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  fullNameContent: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  fullNameText: { color: colors.text, fontSize: 15, lineHeight: 24 },
  dateGroup: { gap: spacing.sm },
  quickDateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickDate: { flex: 1, minWidth: 60, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8 },
  quickDateSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  quickDateText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  quickDateSelectedText: { color: colors.primaryDark },
  detailsContent: { gap: 22, paddingTop: 22 },
  barcodeNotice: { alignItems: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: 13 },
  barcodeNoticeCopy: { flex: 1, gap: 4 },
  barcodeNoticeText: { color: colors.primaryDark, fontSize: 13, lineHeight: 19 },
  barcodeMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  rescanButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4 },
  productInfoCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  productInfoLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  productInfoName: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 5 },
  productInfoMeta: { color: colors.primaryDark, fontSize: 11, lineHeight: 16, marginTop: 6 },
  quantityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14, flex: 1 },
  quantityInputError: { borderColor: colors.danger },
  quantityUnit: { color: colors.text, fontSize: 15, fontWeight: '600' },
  unitButton: { minWidth: 96, minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.sm,
    borderColor: colors.border, borderWidth: 1 },
  unitChoices: { paddingTop: spacing.sm },
  classificationSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  classificationName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  changeLink: { color: colors.primaryDark, fontSize: 13, fontWeight: '700', paddingVertical: 12, paddingLeft: 12 },
  expiryHint: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  saveBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm },
  saveError: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
