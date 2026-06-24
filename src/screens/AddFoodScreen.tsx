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
import { addDays, toDateString } from '../utils/date';
import { inferFoodCategory } from '../utils/foodCategory';
import { foodQuantityUnitLabels, isValidQuantity, parseQuantityInput } from '../utils/foodQuantity';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFood'>;

const fallbackImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300';

export function AddFoodScreen({ navigation, route }: Props) {
  const { foods, addFood, updateFood } = useAppData();
  const existingFood = foods.find((food) => food.id === route.params?.foodId);
  const isEditing = Boolean(existingFood);

  const [name, setName] = useState(existingFood?.name ?? route.params?.initialName ?? '');
  const [category, setCategory] = useState<FoodCategory>(
    existingFood?.category
      ?? inferFoodCategory(route.params?.initialName ?? '', route.params?.initialCategory),
  );
  const [image, setImage] = useState(existingFood?.image ?? route.params?.initialImage ?? fallbackImage);
  const [storage, setStorage] = useState<StorageLocation>(
    existingFood?.storage ?? route.params?.initialStorage ?? 'refrigerated',
  );
  const [quantity, setQuantity] = useState(String(existingFood?.quantity ?? 1));
  const [quantityUnit, setQuantityUnit] = useState<FoodQuantityUnit>(existingFood?.quantityUnit ?? 'piece');
  const [expiryDate, setExpiryDate] = useState(
    existingFood?.expiryDate
      ?? route.params?.initialExpiryDate
      ?? toDateString(addDays(new Date(), 7)),
  );
  const [purchaseDate, setPurchaseDate] = useState(
    existingFood?.purchaseDate ?? toDateString(new Date()),
  );
  const [memo, setMemo] = useState(existingFood?.memo ?? route.params?.initialMemo ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const nameError = submitted && !name.trim() ? '食材名を入力してください。' : undefined;
  const parsedQuantity = parseQuantityInput(quantity);
  const isQuantityValid = isValidQuantity(quantity);
  const quantityError = submitted && !isQuantityValid
    ? '0より大きい数値を入力してください。小数は2桁まで使えます。'
    : undefined;

  const handleSave = async () => {
    setSubmitted(true);
    if (!name.trim() || !isQuantityValid || isSaving) return;
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
      image: savedImage,
      category,
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
          category: route.params.initialCategory || 'ユーザー登録',
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
          <FoodImagePicker image={image} onChange={setImage} />
          <FormField
            autoFocus={!isEditing}
            error={nameError}
            label="食材名"
            onChangeText={setName}
            placeholder="例：牛乳"
            value={name}
          />
          <FormField label="カテゴリ">
            <CategorySelector onChange={setCategory} value={category} />
          </FormField>
          <FormField label="保存場所">
            <StorageSelector onChange={setStorage} value={storage} />
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
                onChangeText={setQuantity}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                style={[styles.quantityInput, quantityError && styles.quantityInputError]}
                value={quantity}
              />
              <Text style={styles.quantityUnit}>{foodQuantityUnitLabels[quantityUnit]}</Text>
            </View>
          </FormField>
          <FormField label="単位">
            <QuantityUnitSelector onChange={setQuantityUnit} value={quantityUnit} />
          </FormField>
          <DatePickerField label="期限日" onChange={setExpiryDate} value={expiryDate} />
          <DatePickerField label="購入日" onChange={setPurchaseDate} value={purchaseDate} />
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
  quantityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, height: 48, paddingHorizontal: 14, textAlign: 'center', width: 100 },
  quantityInputError: { borderColor: colors.danger },
  quantityUnit: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonArea: { marginTop: spacing.sm },
});
