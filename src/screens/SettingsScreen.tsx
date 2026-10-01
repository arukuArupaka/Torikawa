import { useAppAlert } from '../context/AppAlertContext';
import { Ionicons } from '@expo/vector-icons';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { EraseDataControl } from '../components/EraseDataControl';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { useAppData } from '../context/AppDataContext';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import {
  BackupPayload,
  pickBackup,
  prepareBackup, sharePreparedBackup,
} from '../services/backupService';
import {
  ensureNotificationPermission,
  getNotificationStatusSummary,
  NotificationStatusSummary,
  scheduleTestNotification,
} from '../services/notificationService';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function SettingsScreen({ navigation }: Props) {
  const alert = useAppAlert();
  const {
    foods,
    notificationSettings,
    recipes,
    restoreAppData,
    shoppingItems,
    updateNotificationSettings,
    resyncNotifications, notificationSyncError, isNotificationSyncing,
  } = useAppData();
  const [enabled, setEnabled] = useState(notificationSettings.enabled);
  const [daysBeforeList, setDaysBeforeList] = useState(notificationSettings.daysBeforeList);
  const [dayInput, setDayInput] = useState('');
  const [time, setTime] = useState(notificationSettings.time);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatusSummary | null>(null);
  const [statusError, setStatusError] = useState('');
  const [savingNotifications, setSavingNotifications] = useState(false);
  const notificationLock = useRef(false);
  const web = Platform.OS === 'web';
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const firstActiveFood = foods.find((food) => food.status === 'active');

  const refreshNotificationStatus = useCallback(async () => {
    try {
      setNotificationStatus(await getNotificationStatusSummary());
      setStatusError('');
    } catch (error) {
      console.warn('通知状態を確認できませんでした。', error);
      setStatusError('通知の状態を取得できませんでした。再試行してください。');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshNotificationStatus();
  }, [refreshNotificationStatus]));
  useEffect(() => {
    if (!isNotificationSyncing) void refreshNotificationStatus();
  }, [isNotificationSyncing, refreshNotificationStatus]);

  useEffect(() => {
    setEnabled(notificationSettings.enabled);
    setDaysBeforeList(notificationSettings.daysBeforeList);
    setTime(notificationSettings.time);
  }, [notificationSettings]);

  const addNotificationDay = () => {
    const day = Number(dayInput);
    if (!/^\d+$/.test(dayInput) || !Number.isInteger(day) || day < 0 || day > 365) {
      alert('日数を確認してください', '0〜365の整数を入力してください。');
      return;
    }
    if (daysBeforeList.includes(day)) {
      alert('追加済みです', `${day}日前はすでに追加されています。`);
      return;
    }
    setDaysBeforeList((current) => [...current, day].sort((a, b) => a - b));
    setDayInput('');
  };

  const removeNotificationDay = (day: number) => {
    setDaysBeforeList((current) => current.filter((value) => value !== day));
  };

  const save = async () => {
    if (web || notificationLock.current) return;
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!validTime) {
      alert('時刻を確認してください', '00:00〜23:59の形式で入力してください。');
      return;
    }
    if (enabled && daysBeforeList.length === 0) {
      alert('通知日を追加してください', '通知をONにする場合は、1つ以上の日数が必要です。');
      return;
    }

    notificationLock.current = true;
    setSavingNotifications(true);
    try {
    if (enabled) {
      try {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          alert(
            '通知が許可されていません',
            '端末の設定から「たべどき！！」の通知を許可して、もう一度保存してください。',
          );
          return;
        }
      } catch (error) {
        console.warn('通知の許可を確認できませんでした。', error);
        alert('通知を設定できませんでした', '時間をおいて、もう一度お試しください。');
        return;
      }
    }

    await updateNotificationSettings({ enabled, daysBeforeList, time });
    await refreshNotificationStatus();
    alert(
      '保存しました',
      enabled
        ? '食材の期限通知を更新しました。'
        : '期限通知をOFFにし、予約済みの期限通知を解除しました。',
    );
    } catch (error) {
      alert('通知設定の反映が完了していません', error instanceof Error ? error.message : '設定と通知の状態を確認し、再試行してください。');
    } finally { notificationLock.current = false; setSavingNotifications(false); }
  };

  const sendTestNotification = async () => {
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        alert('通知が許可されていません', '端末の設定から通知を許可してください。');
        return;
      }
      await scheduleTestNotification(firstActiveFood);
      await refreshNotificationStatus();
      alert(
        'テスト通知を予約しました',
        firstActiveFood
          ? '約3秒後に表示されます。通知をタップすると食材詳細を開きます。'
          : '約3秒後に通知が表示されます。',
      );
    } catch (error) {
      console.warn('テスト通知を予約できませんでした。', error);
      alert('テスト通知に失敗しました', '時間をおいて、もう一度お試しください。');
    }
  };

  const exportBackup = async () => {
    if (isBackingUp || isRestoring) return;
    setIsBackingUp(true);
    try {
      const prepared = await prepareBackup({ foods, recipes, shoppingItems, notificationSettings });
      let sharing = false;
      alert('バックアップの保存内容',
        `容量：約${(prepared.bytes / 1024 / 1024).toFixed(2)}MB\n写真：${prepared.embeddedCount}枚（重複を除く）\n外部画像：${prepared.externalCount}件はURL参照です。表示には通信が必要です。\n\nこの内容をJSONファイルに保存します。`, [
          { text: 'キャンセル', style: 'cancel' },
          { text: '保存する', onPress: () => {
            if (sharing) return;
            sharing = true; setIsBackingUp(true);
            void sharePreparedBackup(prepared).then(() => alert(web ? 'ダウンロードを開始しました' : '共有画面を閉じました', 'JSONファイルが保存されたことを確認してください。'))
              .catch((error) => { sharing = false; alert('バックアップに失敗しました', error instanceof Error ? error.message : 'もう一度お試しください。'); })
              .finally(() => setIsBackingUp(false));
          } },
        ]);
    } catch (error) {
      console.warn('バックアップを書き出せませんでした。', error);
      alert('バックアップに失敗しました', error instanceof Error ? error.message : 'もう一度お試しください。');
    } finally {
      setIsBackingUp(false);
    }
  };

  const executeRestore = async (payload: BackupPayload) => {
    setIsRestoring(true);
    try {
      await restoreAppData(payload);
      await refreshNotificationStatus();
      alert('復元しました', '食材、履歴、買い物リスト、通知設定、レシピ、バーコード商品を復元しました。');
    } catch (error) {
      console.warn('バックアップを復元できませんでした。', error);
      alert('復元に失敗しました', error instanceof Error ? error.message : 'ファイルを確認してください。');
    } finally {
      setIsRestoring(false);
    }
  };

  const selectBackupToRestore = async () => {
    if (isBackingUp || isRestoring) return;
    setIsRestoring(true);
    try {
      const payload = await pickBackup();
      if (!payload) return;
      const exportedAt = new Date(payload.exportedAt).toLocaleString('ja-JP');
      alert(
        'バックアップから復元',
        `現在のデータをバックアップ内容へ置き換えます。\n\n作成日時：${exportedAt}\n食材：${payload.data.foods.length}件\n買い物：${payload.data.shoppingItems.length}件\nレシピ：${payload.data.recipes.length}件\nバーコード商品：${Object.keys(payload.data.learnedProducts).length}件\n\nこの操作を続けますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '復元する',
            style: 'destructive',
            onPress: () => void executeRestore(payload),
          },
        ],
      );
    } catch (error) {
      console.warn('バックアップファイルを読み込めませんでした。', error);
      alert('ファイルを読み込めませんでした', error instanceof Error ? error.message : 'JSONファイルを確認してください。');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="設定" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>通知設定</Text>
        {web ? <Text style={styles.settingDescription}>Web版では期限通知を利用できません。通知の設定・テストはスマートフォンで行ってください。</Text> : null}
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.iconBox}>
              <Ionicons color={colors.primary} name="notifications-outline" size={22} />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>期限が近いときに通知</Text>
              <Text style={styles.settingDescription}>食材ごとに端末へローカル通知を予約</Text>
            </View>
            <Switch
              disabled={web || savingNotifications}
              onValueChange={setEnabled}
              thumbColor={colors.surface}
              trackColor={{ false: '#C8CDC9', true: colors.primary }}
              value={enabled}
            />
          </View>

          <View style={styles.divider} />
          <View style={styles.daysSection}>
            <Text style={styles.settingTitle}>通知する日数</Text>
            <Text style={styles.settingDescription}>複数追加できます。0日前は期限当日です。</Text>
            <View style={styles.dayChips}>
              {daysBeforeList.length > 0 ? (
                daysBeforeList.map((day) => (
                  <Pressable
                    accessibilityLabel={`${day}日前の通知を削除`}
                    disabled={web || savingNotifications}
                    key={day}
                    onPress={() => removeNotificationDay(day)}
                    style={styles.dayChip}
                  >
                    <Text style={styles.dayChipText}>{day === 0 ? '期限当日' : `${day}日前`}</Text>
                    <Ionicons color={colors.primaryDark} name="close" size={16} />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.noDaysText}>通知日がありません。</Text>
              )}
            </View>
            <View style={styles.addDayRow}>
              <TextInput
                editable={!web && !savingNotifications}
                accessibilityLabel="通知を何日前に出すか"
                keyboardType="number-pad"
                maxLength={3}
                onChangeText={setDayInput}
                onSubmitEditing={addNotificationDay}
                placeholder="例：7"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                style={styles.dayInput}
                value={dayInput}
              />
              <Text style={styles.daySuffix}>日前</Text>
              <Pressable
                disabled={web || savingNotifications || !dayInput}
                onPress={addNotificationDay}
                style={[styles.addDayButton, !dayInput && styles.disabledButton]}
              >
                <Ionicons color={colors.surface} name="add" size={18} />
                <Text style={styles.addDayButtonText}>追加</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>通知時間</Text>
              <Text style={styles.settingDescription}>24時間表記で入力</Text>
            </View>
            <TextInput
              editable={!web && !savingNotifications}
              accessibilityLabel="通知時刻"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setTime}
              placeholder="18:00"
              style={styles.timeInput}
              value={time}
            />
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.iconBox}>
            <Ionicons
              color={notificationStatus?.permission === 'denied' ? colors.danger : colors.primary}
              name={notificationStatus?.permission === 'granted' ? 'checkmark-circle-outline' : 'information-circle-outline'}
              size={22}
            />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>通知の状態</Text>
            <Text style={styles.settingDescription}>
              {web ? 'Web版は通知非対応' : statusError || (notificationStatus
                ? `${notificationStatus.permission === 'granted' ? '許可済み' : notificationStatus.permission === 'denied' ? '許可されていません' : '未確認'}・期限通知 ${notificationStatus.scheduledCount}件予約中`
                : '確認中...')}
            </Text>
            {!web && isNotificationSyncing ? <Text accessibilityLiveRegion="polite" style={styles.settingDescription}>端末の通知予約を同期中...</Text> : null}
            {!web && notificationSyncError ? <Text accessibilityRole="alert" style={styles.settingDescription}>{notificationSyncError}</Text> : null}
          </View>
          <Pressable accessibilityLabel="通知状態を更新" hitSlop={8} onPress={() => void refreshNotificationStatus()}>
            <Ionicons color={colors.textMuted} name="refresh" size={21} />
          </Pressable>
        </View>

        <PrimaryButton disabled={web || savingNotifications} icon="save-outline" label={savingNotifications ? '保存・同期中...' : '通知設定を保存'} onPress={() => void save()} />
        {!web ? <PrimaryButton disabled={isNotificationSyncing || savingNotifications} label="通知を再同期" variant="outline" onPress={() => {
          void resyncNotifications().then(refreshNotificationStatus).catch((error) => alert('通知を再同期できませんでした', error instanceof Error ? error.message : 'もう一度お試しください。'));
        }} /> : null}
        <PrimaryButton
          disabled={web || savingNotifications}
          icon="notifications-outline"
          label="3秒後にテスト通知"
          onPress={() => void sendTestNotification()}
          variant="outline"
        />

        <Text style={styles.sectionLabel}>その他</Text>
        <Pressable onPress={() => navigation.navigate('Statistics')} style={styles.menuRow}>
          <View style={styles.iconBox}>
            <Ionicons color={colors.primary} name="stats-chart-outline" size={22} />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>食材ロス統計</Text>
            <Text style={styles.settingDescription}>使い切った食材と捨てた食材を集計</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={21} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ShoppingList')} style={styles.menuRow}>
          <View style={styles.iconBox}>
            <Ionicons color={colors.primary} name="basket-outline" size={22} />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>買い物リスト</Text>
            <Text style={styles.settingDescription}>{shoppingItems.length}件の食材</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={21} />
        </Pressable>

        <Text style={styles.sectionLabel}>データ管理</Text>
        <Pressable
          disabled={isBackingUp || isRestoring}
          onPress={() => void exportBackup()}
          style={[styles.menuRow, (isBackingUp || isRestoring) && styles.busyRow]}
        >
          <View style={styles.iconBox}>
            <Ionicons color={colors.primary} name="cloud-upload-outline" size={22} />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>{isBackingUp ? '作成中...' : 'バックアップを書き出す'}</Text>
            <Text style={styles.settingDescription}>保存前に容量を確認。写真1枚5MB・合計10MBまで。外部画像はURL参照です。</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={21} />
        </Pressable>
        <Pressable
          disabled={isBackingUp || isRestoring}
          onPress={() => void selectBackupToRestore()}
          style={[styles.menuRow, (isBackingUp || isRestoring) && styles.busyRow]}
        >
          <View style={[styles.iconBox, styles.restoreIconBox]}>
            <Ionicons color={colors.warning} name="cloud-download-outline" size={22} />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>{isRestoring ? '確認中...' : 'バックアップから復元'}</Text>
            <Text style={styles.settingDescription}>現在のデータを選択したファイルで置き換え</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={21} />
        </Pressable>
        <View style={styles.backupNote}>
          <Ionicons color={colors.warning} name="information-circle-outline" size={18} />
          <Text style={styles.backupNoteText}>
            復元すると現在のデータは置き換わります。先にバックアップを書き出してください。復元前の保存データは端末内にも退避します。
          </Text>
        </View>

        <EraseDataControl disabled={isBackingUp || isRestoring || savingNotifications || isNotificationSyncing} />
        <Text style={styles.sectionLabel}>このアプリについて</Text>
        <PrimaryButton icon="shield-checkmark-outline" label="データの取り扱い・お問い合わせ" variant="outline"
          onPress={() => navigation.navigate('AppInformation', { section: 'privacy' })} />
        <PrimaryButton icon="information-circle-outline" label="外部サービス・ライセンス" variant="outline"
          onPress={() => navigation.navigate('AppInformation', { section: 'services' })} />
        <View style={styles.about}>
          <Text style={styles.appName}>たべどき！！</Text>
          <Text style={styles.version}>バックアップ・復元 v1.20.0</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  sectionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  statusCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', padding: spacing.md },
  settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 76, paddingVertical: 12 },
  iconBox: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: 42, justifyContent: 'center', marginRight: 12, width: 42 },
  settingText: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  settingDescription: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  divider: { backgroundColor: colors.border, height: 1, marginLeft: 54 },
  daysSection: { paddingBottom: spacing.md, paddingTop: spacing.md },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 12, minHeight: 32 },
  dayChip: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 11, paddingVertical: 7 },
  dayChipText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  noDaysText: { color: colors.textMuted, fontSize: 13, paddingVertical: 7 },
  addDayRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: 12 },
  dayInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 16, height: 44, paddingHorizontal: 12, textAlign: 'center', width: 82 },
  daySuffix: { color: colors.text, fontSize: 14, fontWeight: '600' },
  addDayButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: 'row', gap: 4, height: 44, justifyContent: 'center', marginLeft: 'auto', paddingHorizontal: 14 },
  addDayButtonText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.4 },
  busyRow: { opacity: 0.5 },
  timeInput: { backgroundColor: colors.background, borderRadius: radius.sm, color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 9, textAlign: 'center', width: 78 },
  menuRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', padding: spacing.md },
  restoreIconBox: { backgroundColor: colors.warningSoft },
  backupNote: { alignItems: 'flex-start', backgroundColor: colors.warningSoft, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, padding: 11 },
  backupNoteText: { color: colors.textMuted, flex: 1, fontSize: 10, lineHeight: 15 },
  about: { alignItems: 'center', paddingVertical: spacing.xl },
  appName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  version: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
});
