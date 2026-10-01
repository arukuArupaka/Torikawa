import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppData } from '../context/AppDataContext';
import { colors, radius, spacing } from '../constants/theme';
import { PrimaryButton } from './PrimaryButton';

export function EraseDataControl({ disabled = false }: { disabled?: boolean }) {
  const { eraseAppData } = useAppData();
  const alert = useAppAlert();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const lock = useRef(false);
  const erase = async () => {
    if (disabled || confirmation.trim() !== '削除' || lock.current) return;
    lock.current = true;
    try {
      await eraseAppData();
      alert('保存データを削除しました', '在庫と買い物リストは空、通知はOFFに戻しました。外部に保存したバックアップや写真の元画像、共有DBの商品は削除していません。');
    } catch { /* A persistent recovery panel reports incomplete erasure and offers retry. */ }
    finally { lock.current = false; }
  };
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>この端末の保存データを削除</Text>
    {open ? <>
      <Text style={styles.body}>食材と履歴、買い物、自作レシピ・お気に入り、設定、商品候補、復元前の退避データ、アプリが保存した写真・一時バックアップを削除します。内蔵レシピは初期状態に戻り、通知予約と通知センターの表示も削除します。</Text>
      <Text style={styles.body}>写真ライブラリの元画像、外部に保存したバックアップ、共有商品DBの商品、OS・SDKが管理するキャッシュは対象外です。端末のカメラ・写真・通知の許可も変わりません。</Text>
      {Platform.OS === 'web' ? <Text style={styles.body}>Web版の対象は、このブラウザーの同じサイトに保存したデータだけです。同じサイトを他のタブでも開いている場合は、先に他のタブを閉じてください。</Text> : null}
      <Text style={styles.body}>一度開始すると取り消せません。必要なデータは先にバックアップしてください。確認のため「削除」と入力してください。</Text>
      <TextInput accessibilityLabel="確認のため「削除」と入力" value={confirmation} onChangeText={setConfirmation}
        placeholder="削除" editable={!disabled} style={styles.input} autoCorrect={false} />
      <PrimaryButton label="この端末の保存データを削除する" variant="danger" disabled={disabled || confirmation.trim() !== '削除'} onPress={() => void erase()} />
      <PrimaryButton label="削除をやめる" variant="outline" disabled={disabled} onPress={() => { setOpen(false); setConfirmation(''); }} />
    </> : <>
      <Text style={styles.body}>復元前の退避データや商品候補も含めて削除します。開始前に対象を確認できます。</Text>
      <PrimaryButton label="削除する内容を確認" variant="outline" disabled={disabled} onPress={() => setOpen(true)} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 23 },
  input: { minHeight: 48, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12 },
});
