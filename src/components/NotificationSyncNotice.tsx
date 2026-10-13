import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

export function NotificationSyncNotice({ error }: { error: string | null }) {
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  useEffect(() => { if (!error) setDismissedError(null); }, [error]);
  if (!error || error === dismissedError) return null;

  return <SafeAreaView edges={['top']} style={styles.notice}>
    <View style={styles.row}>
      <Ionicons name="notifications-outline" size={20} color={colors.warning} />
      <Text accessibilityRole="alert" style={styles.text}>期限通知を反映できていません。{'\n'}設定の「通知の状態」で確認できます。</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="通知の案内を閉じる"
        accessibilityHint="詳しい状態と再同期は設定画面で確認できます"
        onPress={() => setDismissedError(error)}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={22} color={colors.warning} />
      </Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.warningSoft },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, paddingVertical: 4, gap: 8 },
  text: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
