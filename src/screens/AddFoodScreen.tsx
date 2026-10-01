import { normalizeSharedBarcode, validateSharedProduct, SharedProduct, SHARED_RULES_VERSION } from '../../shared/productContract';
import { SharedProductRules } from '../components/SharedProductRules';
import { isSharedProductsConfigured, shareProduct } from '../services/sharedProductService';
import { getRecentFoods } from '../utils/recentFoods';
import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { getStorageEpoch, assertStorageEpoch } from '../services/storage';
import { correctLearnedProduct, saveLearnedProduct } from '../services/learnedProductService';
import { FoodCategory, FoodItem, FoodQuantityUnit, NewFoodItem, StorageLocation } from '../types';
import { toDateString } from '../utils/date';
import { foodCategoryLabels, foodCategoryOptions, inferFoodCategory } from '../utils/foodCategory';
import { getFoodFallbackImage } from '../utils/foodImages';
import { getDefaultExpiryDate, getFoodRegistrationDefaults } from '../utils/foodRegistrationDefaults';
import { foodQuantityUnitLabels, isValidQuantity, parseQuantityInput } from '../utils/foodQuantity';
import { getFoodDisplayName, normalizeProductToIngredient } from '../utils/ingredientNormalizer';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFood'>;

export function AddFoodScreen(props: Props) {
  const { foods, isReady } = useAppData();
  const [templateId, setTemplateId] = useState(props.route.params?.reuseFoodId);
  if (!isReady) return null;
  const templateFood = props.route.params?.foodId ? undefined : foods.find((food) => food.id === templateId);
  return <AddFoodForm key={`${props.route.params?.foodId ?? 'new'}:${templateId ?? ''}`} {...props} templateFood={templateFood} onReuse={setTemplateId} />;
}

function AddFoodForm({ navigation, route, templateFood, onReuse }: Props & { templateFood?: FoodItem; onReuse: (id: string) => void }) {
  const alert = useAppAlert();
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
    if (!name.trim() || !ingredientName.trim() || !isQuantityValid || savingLock.current || savedSharedProduct) return;
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
      updateFood(existingFood.id, input);
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
      addFood(input, route.params?.shoppingItemId);
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
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  if (savedSharedProduct) return <Screen bottomSafe>
    <ScreenHeader title="食材を登録しました" onBack={() => navigation.navigate('MainTabs', { screen: 'Home' })} />
    <View style={styles.shareResult}>
      <Text style={styles.reuseName}>{savedSharedProduct.name}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.reuseHint}>{sharePending ? '商品情報を共有しています...' : shareError || shareNotice}</Text>
      {shareError ? <PrimaryButton label="商品情報の共有を再試行" disabled={sharePending} onPress={() => void submitSharedProduct(savedSharedProduct)} variant="outline" /> : null}
      <PrimaryButton label="ホームへ" onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} />
    </View>
  </Screen>;

  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title={isEditing ? '食材を編集' : templateFood ? 'もう一度登録' : '食材を追加'} />
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
          {!isEditing && !templateFood && !route.params?.initialBarcode && !formEdited && foods.length > 0 ? (
            <View style={styles.reusePanel}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPrevious }} aria-expanded={showPrevious} onPress={() => setShowPrevious((value) => !value)} style={styles.reuseToggle}>
                <Text style={styles.reuseTitle}>前の登録から選ぶ</Text>
                <Ionicons name={showPrevious ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primaryDark} />
              </Pressable>
              {showPrevious ? <>
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
              </> : <Text style={styles.reuseHint}>保存場所や単位を引き継いで入力を省略できます。</Text>}
            </View>
          ) : null}
          {templateFood ? <View style={styles.reusePanel}>
            <Text style={styles.reuseName}>{initialProductName || name}</Text>
            <Text style={styles.reuseHint}>{foodCategoryLabels[category]}・{storageLabels[storage]}・{foodQuantityUnitLabels[quantityUnit]}</Text>
            <Text style={styles.reuseHint}>前回の設定を引き継ぎました。今回の購入量と期限を確認してください。</Text>
          </View> : null}
          <FormField
            autoFocus={!isEditing && !templateFood && foods.length === 0}
            error={nameError}
            label="表示名"
            hint="商品名を修正すると、この名前で表示します。"
            onChangeText={handleNameChange}
            placeholder="例：牛乳"
            value={name}
          />
          <DatePickerField label="期限日" onChange={handleExpiryDateChange} value={expiryDate} />
          {!isEditing && !expiryDateEdited ? (
            <Text style={styles.expiryHint}>自動入力した期限は目安です。パッケージに記載の期限を確認して変更してください。</Text>
          ) : null}
          <FormField
            error={quantityError}
            label={templateFood ? '今回の購入量' : '残量'}
            hint={`例：牛乳なら「1000」+「ml」、卵なら「10」+「個」`}
          >
            <View style={styles.quantityRow}>
              <TextInput
                accessibilityLabel={templateFood ? '今回の購入量' : '残量'}
                keyboardType="decimal-pad"
                maxLength={8}
                onChangeText={handleQuantityChange}
                placeholder={templateFood ? '購入量' : '1'}
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
          <FormField label="保存場所">
            <StorageSelector onChange={handleStorageChange} value={storage} />
          </FormField>
          <FormField
            error={ingredientNameError}
            label="レシピ用分類"
            hint="例：明治おいしい牛乳 → 牛乳。レシピの材料と照合する名前です。"
            onChangeText={handleIngredientNameChange}
            placeholder="例：牛乳"
            value={ingredientName}
          />
          {normalizeProductToIngredient(name).needsReview && name.trim() && ingredientName.trim() === name.trim() ? <Text style={styles.reuseHint}>分類を特定できませんでした。レシピ用分類を確認してください。加工品を原材料と同じ分類にしないでください。</Text> : null}
          {correctionAvailable ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rememberCorrection }} aria-checked={rememberCorrection} onPress={() => setRememberCorrection((value) => !value)} style={styles.reusePanel}>
            <Text style={styles.reuseTitle}>{rememberCorrection ? '☑' : '☐'} 次回のスキャンにも商品名・分類を反映</Text>
            <Text style={styles.reuseHint}>この端末の商品候補だけを更新します。今回の期限・残量・保存場所・メモは反映しません。</Text>
          </Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} aria-expanded={showDetails} onPress={() => setShowDetails((value) => !value)} style={styles.reuseToggle}>
            <Text style={styles.reuseTitle}>{showDetails ? 'その他の項目を閉じる' : '写真・カテゴリ・購入日・メモを編集'}</Text>
            <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primaryDark} />
          </Pressable>
          {showDetails ? <>
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
          </> : null}
          {canOfferSharing ? <View style={styles.reusePanel}>
            <Text style={styles.reuseTitle}>商品情報の共有（任意）</Text>
            <Text style={styles.reuseHint}>共有するのは次の4項目です。個人の在庫・数量・期限・購入日・保存場所・メモ・写真は送信しません。</Text>
            <Text style={styles.reuseHint}>バーコード：{route.params?.initialBarcode}{'\n'}商品名：{name.trim() || '未入力'}{'\n'}食材分類：{ingredientName.trim() || '未入力'}{'\n'}カテゴリ：{foodCategoryLabels[category]}</Text>
            {sharingConfigured ? <><SharedProductRules /><Pressable accessibilityRole="checkbox" accessibilityLabel="投稿ルールに同意して、この商品情報を共有する" accessibilityState={{ checked: shareSelected }} aria-checked={shareSelected} onPress={() => setShareSelected((value) => !value)} style={styles.shareChoice}>
              <Ionicons name={shareSelected ? 'checkbox' : 'square-outline'} color={colors.primaryDark} size={25} />
              <Text style={styles.shareChoiceText}>投稿ルールに同意して、この商品情報を共有する</Text>
            </Pressable></> : <Text style={styles.reuseHint}>共有機能は準備中です。今回はこの端末に商品情報を保存します。</Text>}
          </View> : null}
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

const storageLabels: Record<StorageLocation, string> = { refrigerated: '冷蔵', frozen: '冷凍', room: '常温' };

const styles = StyleSheet.create({
  shareResult: { padding: spacing.lg, gap: spacing.lg },
  shareChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  shareChoiceText: { flex: 1, color: colors.primaryDark, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  reusePanel: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  reuseToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44 },
  reuseTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  reuseName: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  reuseHint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  reuseCopy: { flex: 1, gap: 4 },
  reuseChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 12, minHeight: 56 },
  reuseSearch: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: 12, fontSize: 16, color: colors.text, minHeight: 48 },
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
  expiryHint: { color: colors.primaryDark, fontSize: 13, lineHeight: 20, marginTop: -14 },
  buttonArea: { marginTop: spacing.sm },
});
