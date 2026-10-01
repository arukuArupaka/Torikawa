import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppData } from '../context/AppDataContext';
import { colors, spacing } from '../constants/theme';
import { PrimaryButton } from './PrimaryButton';

export function DataErasurePanel() {
  const { eraseAppData, isErasing, erasureError } = useAppData();
  const alert = useAppAlert();
  return <ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>{isErasing ? '保存データを削除しています' : '削除が完了していません'}</Text>
    {isErasing ? <>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text accessibilityLiveRegion="polite" style={styles.body}>完了するまでアプリを閉じずにお待ちください。</Text>
    </> : <>
      <Text accessibilityRole="alert" style={styles.body}>{erasureError ?? '前回開始した削除が途中で止まっています。'}</Text>
      <Text style={styles.body}>残っている保存データと通知の削除を続けます。完了するまで登録・復元はできません。削除したデータは元に戻せません。</Text>
      <PrimaryButton label="削除を再試行" onPress={() => {
        void eraseAppData().then(() => alert('保存データを削除しました', '残っていたデータの削除を完了しました。')).catch(() => undefined);
      }} />
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 22, lineHeight: 32, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 24 },
});
