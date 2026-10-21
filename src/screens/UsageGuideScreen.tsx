import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedDisclosure } from '../components/AnimatedDisclosure';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UsageGuide'>;
type GuideTopic = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  steps: string[];
  note: string;
};

export function UsageGuideScreen({ navigation }: Props) {
  const [openTopic, setOpenTopic] = useState<string | null>('registration');
  const web = Platform.OS === 'web';
  const topics: GuideTopic[] = [
    {
      id: 'registration', title: '食材を登録する', icon: 'add-circle-outline',
      steps: [
        'ホームの「＋」または「食材を登録」を押します。',
        '食材名・期限日・残量と単位・保存場所を確認し、「保存する」を押します。',
        '写真やメモは「写真・カテゴリ・購入日・メモを編集」から追加できます。長い商品名は「全文を見る」で確認できます。',
      ],
      note: '補完された期限は目安です。パッケージの表示を確認してください。同じ食材の買い足しには、食材詳細の「もう一度登録する」も使えます。',
    },
    {
      id: 'barcode', title: 'バーコードで登録する', icon: 'barcode-outline',
      steps: [
        '「バーコード」タブを開き、カメラの使用を許可して商品のバーコードを枠内に映します。番号を入力して検索することもできます。',
        '登録画面で商品名と取得元を確認します。見つからない場合は、食材名を手入力できます。',
        '今回の期限・数量・保存場所を確認し、「保存する」を押します。「読み直す」で読み取り画面へ戻れます。',
      ],
      note: '検索しただけでは在庫に追加されません。期限や数量はバーコードから取得しません。検索には通信が必要ですが、商品が見つからなくても手入力で登録できます。',
    },
    {
      id: 'find', title: '食材と期限を確認する', icon: 'calendar-outline',
      steps: [
        'ホームの検索欄に食材名を入れます。「期限順」「保存場所別」「カテゴリ別」で表示を切り替えられます。',
        '「今日まで」「明日〜3日以内」を押すと、対象の食材だけを表示します。「すべての食材に戻す」で絞り込みを解除します。',
        'カレンダーの日付を押すと、その日が期限の食材を確認できます。食材を押すと詳細が開きます。',
      ],
      note: '期限切れの食材はホームの「確認」から探せます。期限の表示は、食べられるかどうかを判定するものではありません。',
    },
    {
      id: 'stock', title: '残量・使い切り・廃棄を記録する', icon: 'checkmark-circle-outline',
      steps: [
        '一部だけ使ったときは、食材詳細の「残量 ○○・変更」を押し、残った量を保存します。',
        '全部使ったときは「使い切った」、捨てたときは「捨てた」で記録します。ホームでは左スワイプが使い切り、右スワイプが廃棄です。',
        '記録を間違えたときは、対象の食材詳細の「記録を取り消す」で管理中に戻せます。設定の「食材ロス統計」で履歴も確認できます。',
      ],
      note: '「食材の登録を削除する」は、使い切り・廃棄の記録とは異なります。記録を残したい場合は、使い切り・廃棄の操作を使ってください。',
    },
    {
      id: 'recipes', title: 'レシピを探す・作った分を記録する', icon: 'restaurant-outline',
      steps: [
        '「レシピ」タブで料理名や食材を検索し、「絞り込み」で条件を選びます。料理の「材料と作り方を見る」から詳細を開きます。',
        '「作る人数」を変え、材料の必要量と不足分を確認します。「買い物の準備」から不足する材料を追加できます。',
        '調理後は、食材ごとの使用量と使用後の残量を確認し、「このレシピを作った」で記録します。',
      ],
      note: '材料の種類がそろっていても、分量が足りるとは限りません。「要確認」は実際の量を確かめてください。内蔵画像はAI生成のイメージです。',
    },
    {
      id: 'shopping', title: '買い物リストを使う', icon: 'basket-outline',
      steps: [
        'ホームの買い物アイコン、または設定の「買い物リスト」を開き、買うものを追加します。',
        '購入したらチェックを付けます。「購入済み」へ移動して確認できます。',
        '購入済みの商品で「食材を登録」を押し、今回の購入量・期限を確認して保存すると在庫に追加できます。',
      ],
      note: '買い物のチェックだけでは在庫に追加されません。次に同じ商品を買うときは、新しい買い物項目を追加してください。',
    },
    {
      id: 'notifications', title: '期限通知を設定する', icon: 'notifications-outline',
      steps: web ? [
        'Web版では期限通知を利用できません。ホームやカレンダーで期限を確認してください。',
        '期限通知はスマートフォン版で設定します。端末側の通知の許可も必要です。',
      ] : [
        '設定で「期限通知」を開き、通知をONにします。通知したい日数を入力して「追加」を押します。0日前は期限当日です。',
        '時刻を確認し、「通知設定を保存」を押します。端末から通知の許可を求められたら確認してください。',
        '「3秒後にテスト通知」で動作を試せます。同期エラーが出た場合は「通知を再同期」で再試行します。',
      ],
      note: web ? 'ブラウザーの通知を許可しても、本アプリのWeb版では期限通知は届きません。'
        : '予約は直近60件までです。アプリに戻ったときに残りの予定を順次予約します。アプリを開かない間の自動補充は行いません。',
    },
    {
      id: 'backup', title: 'バックアップ・機種変更', icon: 'cloud-upload-outline',
      steps: [
        '設定の「データ管理」で「バックアップを書き出す」を押し、内容を確認してJSONファイルを保存します。',
        '移行先で「バックアップから復元」を押し、保存したファイルを選びます。表示された件数などを確認して復元します。',
        '復元後に食材・残量・写真・レシピを確認します。通知を使う場合は、移行先の端末で通知の許可と予約状態も確認してください。',
      ],
      note: '復元すると現在のデータが置き換わります。先に現在のバックアップを保存してください。別端末への自動同期はありません。Web版はサイトのURLが変わる前にも書き出してください。ファイルには在庫・メモ・写真などが含まれます。',
    },
  ];

  return (
    <Screen bottomSafe>
      <ScreenHeader title="使い方" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>たべどき！！の基本操作</Text>
          <Text style={styles.body}>まずは「食材を登録 → 使ったら記録 → バックアップ」の順に試してみましょう。知りたい項目を押すと手順が開きます。</Text>
        </View>
        {topics.map(topic => {
          const expanded = openTopic === topic.id;
          return <View key={topic.id} style={styles.card}>
            <AnimatedDisclosure expanded={expanded} contentStyle={styles.instructions} header={
              <Pressable accessibilityRole="button" accessibilityLabel={topic.title} accessibilityState={{ expanded }}
                onPress={() => setOpenTopic(current => current === topic.id ? null : topic.id)}
                style={({ pressed }) => [styles.topicHeader, pressed && styles.pressed]}>
                <View style={styles.iconBox}><Ionicons name={topic.icon} size={22} color={colors.primary} /></View>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </Pressable>
            }>
              {topic.steps.map((step, index) => <View key={index} style={styles.step}>
                <Text style={styles.stepNumber}>{index + 1}.</Text>
                <Text style={[styles.body, styles.stepText]}>{step}</Text>
              </View>)}
              <Text style={styles.note}>{topic.note}</Text>
            </AnimatedDisclosure>
          </View>;
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  intro: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  introTitle: { color: colors.primaryDark, fontSize: 17, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 25 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  topicHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  iconBox: { height: 40, width: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 23 },
  instructions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: spacing.md, gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNumber: { color: colors.primary, fontSize: 15, fontWeight: '700', lineHeight: 25, minWidth: 20 },
  stepText: { flex: 1 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 22 },
  pressed: { opacity: 0.65 },
});
