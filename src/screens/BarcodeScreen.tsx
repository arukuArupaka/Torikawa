import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BarcodeScanningResult } from 'expo-camera';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import {
  BarcodeProduct,
  sampleMilkProduct,
} from '../data/productCatalog';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import {
  lookupProductByBarcode,
  ProductLookupSource,
} from '../services/productLookupService';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Barcode'>,
  NativeStackScreenProps<RootStackParamList>
>;

type ScanResult = {
  barcode: string;
  type: string;
  product: BarcodeProduct | null;
  source: ProductLookupSource;
};

const productSourceLabels: Record<ProductLookupSource, string> = {
  learned: '以前の登録内容',
  local: '端末内サンプル',
  'yahoo-shopping': 'Yahoo!ショッピング',
  'open-food-facts': 'Open Food Facts',
  none: '未取得',
};

export function BarcodeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  const handleScan = async (result: BarcodeScanningResult) => {
    const barcode = result.data.trim();
    if (!barcode) return;
    setIsLookingUp(true);
    setLookupFailed(false);
    try {
      const lookup = await lookupProductByBarcode(barcode);
      setScanResult({ barcode, type: result.type, ...lookup });
    } catch (error) {
      console.warn('商品情報を検索できませんでした。', error);
      setLookupFailed(true);
      setScanResult({ barcode, type: result.type, product: null, source: 'none' });
    } finally {
      setIsLookingUp(false);
    }
  };

  const showSampleProduct = () => {
    setScanResult({
      barcode: sampleMilkProduct.barcode,
      type: 'ean13',
      product: sampleMilkProduct,
      source: 'local',
    });
  };

  const openManualRegistration = () => {
    if (!scanResult) return;
    navigation.navigate('AddFood', {
      initialName: scanResult.product?.name,
      initialImage: scanResult.product?.image,
      initialMemo: `バーコード: ${scanResult.barcode}`,
      initialBarcode: scanResult.barcode,
      initialCategory: scanResult.product?.category,
      initialStorage: scanResult.product?.storage,
    });
  };

  return (
    <Screen>
      <ScreenHeader subtitle="JAN・EAN対応" title="バーコードを読み取る" />
      <ScrollView contentContainerStyle={styles.content}>
        {isFocused ? (
          <BarcodeScanner active={!scanResult && !isLookingUp} onScanned={(result) => void handleScan(result)} />
        ) : (
          <View style={styles.inactiveCamera} />
        )}

        {isLookingUp ? (
          <View style={styles.lookupCard}>
            <ActivityIndicator color={colors.primary} size="small" />
            <View style={styles.lookupTextArea}>
              <Text style={styles.lookupTitle}>商品情報を検索しています</Text>
              <Text style={styles.lookupText}>Yahoo!ショッピングとOpen Food Factsへ問い合わせ中...</Text>
            </View>
          </View>
        ) : scanResult ? (
          <>
            <View>
              <Text style={styles.resultLabel}>読み取り結果</Text>
              {scanResult.product ? (
                <View style={styles.productCard}>
                  <Image source={{ uri: scanResult.product.image }} style={styles.productImage} />
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{scanResult.product.name}</Text>
                    <Text style={styles.productCategory}>{scanResult.product.category}</Text>
                    <Text style={styles.barcodeText}>{scanResult.barcode}</Text>
                    <Text style={styles.sourceText}>
                      商品情報: {productSourceLabels[scanResult.source]}
                    </Text>
                  </View>
                  <Ionicons color={colors.primary} name="checkmark-circle" size={25} />
                </View>
              ) : (
                <View style={styles.productCard}>
                  <View style={styles.unknownIcon}>
                    <Ionicons color={colors.textMuted} name="barcode-outline" size={30} />
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>
                      {lookupFailed ? '商品情報を検索できませんでした' : '商品情報が見つかりません'}
                    </Text>
                    <Text style={styles.productCategory}>
                      {lookupFailed ? '通信状況を確認するか、手入力してください' : 'Open Food Factsに未登録のため、手入力できます'}
                    </Text>
                    <Text style={styles.barcodeText}>{scanResult.barcode}</Text>
                  </View>
                </View>
              )}
            </View>

            <PrimaryButton
              icon="create-outline"
              label={scanResult.product ? '入力内容を確認して登録' : '手入力で登録'}
              onPress={openManualRegistration}
              style={styles.actionButton}
            />
            <Pressable
              onPress={() => {
                setLookupFailed(false);
                setScanResult(null);
              }}
              style={styles.rescanButton}
            >
              <Ionicons color={colors.primary} name="scan-outline" size={19} />
              <Text style={styles.rescanText}>もう一度読み取る</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.waitingArea}>
            <Text style={styles.waitingTitle}>商品バーコードをカメラに映してください</Text>
            <Text style={styles.waitingText}>読み取り後、商品情報を確認して登録できます。</Text>
            <Pressable onPress={showSampleProduct} style={styles.sampleButton}>
              <Text style={styles.sampleButtonText}>サンプル商品で動作を試す</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.note}>
          <Ionicons color={colors.textMuted} name="information-circle-outline" size={20} />
          <Text style={styles.noteText}>
            商品検索には端末内カタログ、Yahoo!ショッピング、Open Food Factsを使用します。データベースにない商品も、バーコード番号を引き継いで手入力できます。
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  inactiveCamera: { backgroundColor: '#111', height: 300 },
  resultLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm, marginHorizontal: spacing.md },
  productCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', marginHorizontal: spacing.md, padding: 13 },
  productImage: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 64, width: 64 },
  unknownIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.sm, height: 64, justifyContent: 'center', width: 64 },
  productInfo: { flex: 1, marginLeft: 13 },
  productName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  productCategory: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  barcodeText: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, marginTop: 5 },
  sourceText: { color: colors.primaryDark, fontSize: 10, marginTop: 4 },
  actionButton: { marginHorizontal: spacing.md },
  lookupCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', marginHorizontal: spacing.md, padding: spacing.md },
  lookupTextArea: { flex: 1, marginLeft: 12 },
  lookupTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  lookupText: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  rescanButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 6, padding: spacing.sm },
  rescanText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  waitingArea: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  waitingTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  waitingText: { color: colors.textMuted, fontSize: 12, marginTop: 5, textAlign: 'center' },
  sampleButton: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  sampleButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  noteText: { color: colors.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
});
