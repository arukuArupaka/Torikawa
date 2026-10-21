import { ProductLookupRateLimitError } from '../services/openFoodFactsService';
import { isYahooProductLookupConfigured } from '../services/yahooProductLookupService';
import { isSharedProductsConfigured } from '../services/sharedProductService';
import { normalizeSharedBarcode } from '../../shared/productContract';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BarcodeScanningResult } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { sampleMilkProduct } from '../data/productCatalog';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import {
  lookupProductByBarcode,
  ProductLookupResult,
} from '../services/productLookupService';
import { assertStorageEpoch, getStorageEpoch } from '../services/storage';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Barcode'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function BarcodeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const scanBusy = useRef(false);
  const scanActive = useRef(false);
  const requestId = useRef(0);

  useFocusEffect(useCallback(() => {
    scanActive.current = true;
    scanBusy.current = false;
    setIsLookingUp(false);
    return () => {
      scanActive.current = false;
      requestId.current += 1;
      scanBusy.current = false;
    };
  }, []));

  const openRegistration = (barcode: string, type: string, lookup: ProductLookupResult, notice?: string) => {
    const { product, source } = lookup;
    Keyboard.dismiss();
    navigation.navigate('AddFood', {
      initialName: product?.name,
      initialProductName: product?.name,
      initialIngredientName: product?.ingredientName,
      initialImage: product?.image,
      initialMemo: `バーコード: ${barcode}`,
      initialBarcode: barcode,
      initialProductSource: product?.productSource,
      initialLookupSource: source,
      initialLookupNotice: notice,
      allowProductSharing: source === 'none' && ['ean13', 'ean8'].includes(type),
      initialCategory: product?.category,
      initialTags: product?.tags,
      initialStorage: ['learned', 'local'].includes(source) ? product?.storage : undefined,
    });
  };

  const handleScan = async (result: BarcodeScanningResult) => {
    const barcode = result.data.trim();
    if (!barcode || !scanActive.current || scanBusy.current) return;
    const epoch = getStorageEpoch();
    try { assertStorageEpoch(epoch); } catch { return; }
    const request = ++requestId.current;
    scanBusy.current = true;
    setIsLookingUp(true);
    let lookup: ProductLookupResult;
    let notice: string | undefined;
    try {
      lookup = await lookupProductByBarcode(barcode);
    } catch (error) {
      console.warn('商品情報を検索できませんでした。', error);
      lookup = { product: null, source: 'none' };
      notice = error instanceof ProductLookupRateLimitError ? error.message
        : '商品情報を検索できませんでした。食材名を入力して登録できます。';
    }
    // Ignore results from a screen that was left, unmounted or restored.
    if (!scanActive.current || request !== requestId.current) return;
    try { assertStorageEpoch(epoch); } catch {
      setIsLookingUp(false);
      scanBusy.current = false;
      return;
    }
    // Keep the scan locked until this screen loses focus, including repeated frames.
    openRegistration(barcode, result.type, lookup, notice);
  };

  const showSampleProduct = () => {
    if (!scanActive.current || scanBusy.current) return;
    scanBusy.current = true;
    setIsLookingUp(true);
    openRegistration(sampleMilkProduct.barcode, 'ean13', { product: sampleMilkProduct, source: 'local' });
  };

  return (
    <Screen>
      <ScreenHeader subtitle="JAN・EAN対応" title="バーコードを読み取る" />
      <ScrollView contentContainerStyle={styles.content}>
        {isFocused ? (
          <BarcodeScanner active={!isLookingUp} onScanned={(result) => void handleScan(result)} />
        ) : (
          <View style={styles.inactiveCamera} />
        )}

        {isLookingUp ? (
          <View accessibilityLiveRegion="polite" style={styles.lookupCard}>
            <ActivityIndicator color={colors.primary} size="small" />
            <View style={styles.lookupTextArea}>
              <Text style={styles.lookupTitle}>商品情報を検索しています</Text>
              <Text style={styles.lookupText}>端末・共有データベース・外部サービスを確認中...</Text>
            </View>
          </View>
        ) : (
          <View style={styles.waitingArea}>
            <Text style={styles.waitingTitle}>商品バーコードをカメラに映してください</Text>
            <Text style={styles.waitingText}>読み取り後、そのまま登録画面で期限・数量を確認できます。</Text>
            {process.env.EXPO_PUBLIC_DEMO_DATA === 'true' ? <Pressable onPress={showSampleProduct} style={styles.sampleButton}>
              <Text style={styles.sampleButtonText}>サンプル商品で動作を試す</Text>
            </Pressable> : null}
          </View>
        )}

        <View style={styles.manualArea}>
          <Text style={styles.waitingTitle}>番号を入力して検索</Text>
          <TextInput accessibilityLabel="バーコード番号" editable={!isLookingUp} value={manualBarcode} onChangeText={setManualBarcode} keyboardType="number-pad" maxLength={13} placeholder="8桁または13桁のJAN・EAN" style={styles.manualInput} />
          <PrimaryButton label={isLookingUp ? '商品を検索中...' : '番号で検索'} disabled={isLookingUp || !normalizeSharedBarcode(manualBarcode)} onPress={() => {
            const barcode = normalizeSharedBarcode(manualBarcode);
            if (barcode) void handleScan({ data: barcode, type: barcode.length === 8 ? 'ean8' : 'ean13' } as BarcodeScanningResult);
          }} />
        </View>
        <View style={styles.note}>
          <Ionicons color={colors.textMuted} name="information-circle-outline" size={20} />
          <Text style={styles.noteText}>
            商品検索には端末内の商品候補、{isSharedProductsConfigured() ? '共有商品データベース、' : ''}{isYahooProductLookupConfigured() ? 'Yahoo!ショッピング（商品名のみ）、' : ''}Open Food Factsを使用します。商品名を確認してご利用ください。見つからない商品も、バーコード番号を引き継いで手入力できます。Yahoo!ショッピングの商品画像は使用しません。
          </Text>
        </View>
        <PrimaryButton label="商品データの出典・ライセンス" variant="outline"
          onPress={() => navigation.navigate('AppInformation', { section: 'services' })} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  manualArea: { marginHorizontal: spacing.md, gap: spacing.sm },
  manualInput: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: 12, minHeight: 48, fontSize: 16, color: colors.text },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  inactiveCamera: { backgroundColor: '#111', height: 300 },
  lookupCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', marginHorizontal: spacing.md, padding: spacing.md },
  lookupTextArea: { flex: 1, marginLeft: 12 },
  lookupTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  lookupText: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  waitingArea: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  waitingTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  waitingText: { color: colors.textMuted, fontSize: 12, marginTop: 5, textAlign: 'center' },
  sampleButton: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sampleButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  noteText: { color: colors.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
});
