import { Ionicons } from '@expo/vector-icons';
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

export function BarcodeScanner({
  active,
  onScanned,
}: {
  active: boolean;
  onScanned: (result: BarcodeScanningResult) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scanLocked = useRef(false);

  useEffect(() => {
    if (active) scanLocked.current = false;
  }, [active]);

  const handleScan = (result: BarcodeScanningResult) => {
    if (scanLocked.current || !active) return;
    scanLocked.current = true;
    onScanned(result);
  };

  if (!permission) {
    return (
      <View style={styles.permissionArea}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.permissionText}>カメラを準備しています...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionArea}>
        <Ionicons color={colors.primary} name="camera-outline" size={42} />
        <Text style={styles.permissionTitle}>カメラの許可が必要です</Text>
        <Text style={styles.permissionText}>商品のバーコードを読み取るためにカメラを使用します。</Text>
        <Pressable
          onPress={() => permission.canAskAgain ? void requestPermission() : void Linking.openSettings()}
          style={styles.permissionButton}
        >
          <Text style={styles.permissionButtonText}>
            {permission.canAskAgain ? 'カメラを許可' : '端末の設定を開く'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.scanner}>
      <CameraView
        active={active}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        enableTorch={torchEnabled}
        facing="back"
        onBarcodeScanned={active ? handleScan : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.shade} />
      <View pointerEvents="none" style={styles.focusFrame}>
        <View style={styles.scanLine} />
      </View>
      <View pointerEvents="none" style={styles.scanHint}>
        <Text style={styles.scanHintText}>
          {active ? 'バーコードを枠内に合わせてください' : '読み取りました'}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={torchEnabled ? 'ライトを消す' : 'ライトを点ける'}
        onPress={() => setTorchEnabled((current) => !current)}
        style={styles.torchButton}
      >
        <Ionicons color={colors.surface} name={torchEnabled ? 'flash' : 'flash-outline'} size={23} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scanner: { backgroundColor: '#111', height: 300, overflow: 'hidden' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  focusFrame: { alignSelf: 'center', borderColor: '#60E383', borderRadius: radius.sm, borderWidth: 3, height: 126, justifyContent: 'center', position: 'absolute', top: 88, width: '76%' },
  scanLine: { backgroundColor: '#67F18B', height: 2, width: '100%' },
  scanHint: { alignItems: 'center', bottom: 22, left: 0, position: 'absolute', right: 0 },
  scanHintText: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, color: colors.surface, fontSize: 12, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 7 },
  torchButton: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 22, height: 44, justifyContent: 'center', position: 'absolute', right: spacing.md, top: spacing.md, width: 44 },
  permissionArea: { alignItems: 'center', backgroundColor: colors.primarySoft, height: 300, justifyContent: 'center', paddingHorizontal: spacing.xl },
  permissionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.sm },
  permissionText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, textAlign: 'center' },
  permissionButton: { backgroundColor: colors.primary, borderRadius: radius.sm, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  permissionButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});
