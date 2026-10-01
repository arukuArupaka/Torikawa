import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProductReportReason, reportReasons } from '../../shared/productContract';
import { reportSharedProduct } from '../services/sharedProductService';
import { colors, radius, spacing } from '../constants/theme';
import { PrimaryButton } from './PrimaryButton';

const labels: Record<ProductReportReason, string> = {
  incorrect: '商品名や分類が違う',
  personal_information: '個人情報が含まれている',
  inappropriate: '広告・嫌がらせなど不適切な内容',
  rights: '他者の権利を侵害している疑い',
};

export function SharedProductReport({ barcode, onIgnore }: { barcode: string; onIgnore: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<ProductReportReason | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async () => {
    if (!reason || lock.current || sent) return;
    lock.current = true; setPending(true); setError('');
    try { await reportSharedProduct(barcode, reason); setSent(true); }
    catch { setError('通報を送信できませんでした。通信状況を確認して再試行できます。'); }
    finally { lock.current = false; setPending(false); }
  };
  return <View style={styles.panel}>
    <Text style={styles.body}>共有の商品情報に問題がありますか？</Text>
    <PrimaryButton label="共有情報を使わずに手入力" variant="outline" onPress={onIgnore} />
    {sent ? <Text accessibilityLiveRegion="polite" style={styles.body}>通報を受け付けました。管理者が内容を確認します。通報だけでは、商品は自動で非公開になりません。</Text>
      : expanded ? <>
        <Text accessibilityRole="header" style={styles.title}>通報の理由を選んでください</Text>
        <Text style={styles.body}>送信するのはバーコードと選んだ理由です。在庫・写真・連絡先は送りません。</Text>
        {reportReasons.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={labels[value]}
          accessibilityState={{ checked: reason === value, disabled: pending }} aria-checked={reason === value} disabled={pending}
          onPress={() => setReason(value)} style={[styles.choice, reason === value && styles.selected]}>
          <Text style={styles.choiceText}>{reason === value ? '●' : '○'} {labels[value]}</Text>
        </Pressable>)}
        {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
        <PrimaryButton label={pending ? '送信中...' : 'この理由で通報する'} disabled={!reason || pending} onPress={() => void submit()} />
        <PrimaryButton label="通報をやめる" variant="outline" disabled={pending} onPress={() => { setExpanded(false); setError(''); }} />
      </> : <PrimaryButton label="この商品情報を通報する" variant="outline" onPress={() => setExpanded(true)} />}
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: spacing.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.text, fontSize: 13, lineHeight: 21 },
  choice: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, justifyContent: 'center' },
  selected: { borderColor: colors.primaryDark, backgroundColor: colors.primarySoft },
  choiceText: { color: colors.text, fontSize: 14, lineHeight: 22 },
});
