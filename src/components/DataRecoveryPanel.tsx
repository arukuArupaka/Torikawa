import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppData } from '../context/AppDataContext';
import { pickBackup, shareRecoveryData } from '../services/backupService';
import { colors, spacing } from '../constants/theme';
import { PrimaryButton } from './PrimaryButton';

export function DataRecoveryPanel() {
  const { loadError, retryLoad, restoreAppData } = useAppData();
  const alert = useAppAlert();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const finish = () => { locked.current = false; setBusy(false); };
  const begin = () => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  };
  const exportOriginal = async () => {
    if (!begin()) return;
    try {
      await shareRecoveryData();
      alert('原本の退避', 'ファイルの保存を確認してください。このファイルは調査・救出用で、通常のバックアップ復元には使えません。');
    } catch (error) {
      alert('原本を退避できませんでした', error instanceof Error ? error.message : '保存先を確認して、もう一度お試しください。');
    } finally { finish(); }
  };
  const chooseBackup = async () => {
    if (!begin()) return;
    try {
      const payload = await pickBackup();
      if (!payload) { finish(); return; }
      alert('正常なバックアップから復元',
        `食材${payload.data.foods.length}件、レシピ${payload.data.recipes.length}件、買い物${payload.data.shoppingItems.length}件に置き換えます。現在の原本は端末内に退避します。`, [
          { text: 'キャンセル', style: 'cancel', onPress: finish },
          { text: '復元する', style: 'destructive', onPress: () => {
            void restoreAppData(payload).then(() => {
              alert('復元しました', 'バックアップのデータを読み込みました。');
            }).catch((error) => {
              alert('復元できませんでした', error instanceof Error ? error.message : '別のバックアップを確認してください。');
            }).finally(finish);
          } },
        ], { cancelable: false });
    } catch (error) {
      alert('ファイルを読み込めませんでした', error instanceof Error ? error.message : 'バックアップを確認してください。');
      finish();
    }
  };
  return <ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>保存データを保護しています</Text>
    <Text accessibilityRole="alert" style={styles.text}>{loadError}</Text>
    <Text style={styles.text}>まず再読み込みをお試しください。読み込めない場合も初期化せず、原本を退避したり、保存済みのバックアップから復元できます。</Text>
    <PrimaryButton label="もう一度読み込む" disabled={busy} onPress={retryLoad} />
    <PrimaryButton label="原本をファイルに退避" disabled={busy} onPress={() => void exportOriginal()} variant="outline" />
    <PrimaryButton label="バックアップから復元" disabled={busy} onPress={() => void chooseBackup()} variant="outline" />
    <Text style={styles.note}>原本ファイルには在庫やメモなどの個人データが含まれます。写真は端末内の参照情報のみで、画像本体は含まれません。調査用ファイルとして安全な場所に保管してください。</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 32 },
  text: { color: colors.text, fontSize: 15, lineHeight: 24 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 21 },
});
