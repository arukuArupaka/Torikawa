import { Component, type ErrorInfo, type ReactNode, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../constants/theme';
import { useAppAlert } from '../context/AppAlertContext';
import { shareRecoveryData } from '../services/backupService';
import { PrimaryButton } from './PrimaryButton';

type ErrorState = { hasError: boolean; error: unknown };

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorState> {
  state: ErrorState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('画面の表示中にエラーが発生しました。', error, info);
  }

  private retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

// AppDataProviderが外れる場合も、保存済みの原本を既存の処理で書き出せるようにする。
function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const alert = useAppAlert();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await shareRecoveryData();
      alert('原本の退避', 'ファイルの保存を確認してください。このファイルは調査・救出用で、通常のバックアップ復元には使えません。');
    } catch (exportError) {
      alert('原本を退避できませんでした', exportError instanceof Error ? exportError.message : '保存先を確認して、もう一度お試しください。');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>画面を表示できませんでした</Text>
        <Text accessibilityRole="alert" style={styles.text}>保存済みのデータは消えていません。もう一度表示するか、保存データを書き出してください。</Text>
        <PrimaryButton label="もう一度表示する" disabled={busy} onPress={onRetry} />
        <PrimaryButton label={busy ? '書き出し中...' : '保存データを書き出す'} disabled={busy} onPress={() => void exportData()} variant="outline" />
        <Text style={styles.note}>書き出すファイルは調査・救出用です。写真本体は含まず、通常のバックアップ復元には使えません。在庫やメモなどの個人データを含むため、安全な場所に保管してください。</Text>
        {typeof __DEV__ !== 'undefined' && __DEV__ ? <Text selectable style={styles.details}>{error instanceof Error ? error.stack || error.message : String(error)}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 480, alignSelf: 'center', padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', lineHeight: 32 },
  text: { color: colors.text, fontSize: 15, lineHeight: 24 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 21 },
  details: { color: colors.danger, fontSize: 13, lineHeight: 21 },
});
