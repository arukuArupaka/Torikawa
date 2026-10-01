import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';

export function WebTestNotice() {
  if (process.env.EXPO_PUBLIC_WEB_TEST !== 'true') return null;
  return <View style={styles.notice}>
    <Text style={styles.text}>テスト版 · 在庫はこのブラウザーに保存されます。期限通知は使えません。</Text>
    <a href={`${process.env.EXPO_PUBLIC_WEB_BASE_PATH || ''}/test-guide.html`} style={{ color: colors.primary, fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>
      テスト版の使い方
    </a>
  </View>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  text: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
