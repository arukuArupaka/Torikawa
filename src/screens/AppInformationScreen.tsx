import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { SharedProductRules } from '../components/SharedProductRules';
import expoTemplateAssetNotice from '../data/expoTemplateAssetNotice.json';
import { dataHandlingSections, getPublicationInformation } from '../constants/publication';
import { colors, radius, spacing } from '../constants/theme';
import { useAppAlert } from '../context/AppAlertContext';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AppInformation'>;

export function AppInformationScreen({ navigation, route }: Props) {
  const alert = useAppAlert();
  const publication = getPublicationInformation();
  const privacy = route.params.section === 'privacy';
  const open = async (url: string) => {
    try { await Linking.openURL(url); }
    catch { alert('リンクを開けませんでした', '通信環境や、ブラウザーの設定を確認してください。'); }
  };
  const link = (label: string, url: string) => (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => void open(url)} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
  return (
    <Screen bottomSafe>
      <ScreenHeader onBack={navigation.goBack} title={privacy ? 'データの取り扱い' : '出典・ライセンス'} />
      <ScrollView contentContainerStyle={styles.content}>
        {privacy ? <>
          {dataHandlingSections.map(({ title, body }) => <View key={title} style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>)}
          <View style={styles.card}><SharedProductRules /></View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>プライバシーポリシー・お問い合わせ</Text>
            <Text style={styles.body}>運営者：{publication.operator ?? '公開準備中'}</Text>
            {publication.privacyUrl ? link('プライバシーポリシーを開く', publication.privacyUrl)
              : <Text style={styles.body}>公開用プライバシーポリシーは準備中です。この画面は現在のアプリの動作説明です。</Text>}
            {publication.supportFormUrl ? <>
              {link('問い合わせフォームを開く', publication.supportFormUrl)}
              <Text style={styles.body}>外部のフォームが開きます。在庫や写真を自動で送信することはありません。</Text>
            </> : <Text style={styles.body}>公開用の問い合わせフォームは準備中です。</Text>}
          </View>
        </> : <>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>アプリアイコン</Text>
            <Text style={styles.body}>葉っぱと時計を組み合わせた、このアプリ用のAI生成画像を使用しています。</Text>
            <Text accessibilityRole="header" style={styles.title}>Expoテンプレートの素材</Text>
            <Text style={styles.body}>開発初期に使用したExpoテンプレートの標準画像について、MITライセンスの著作権表示と本文を掲載します。</Text>
            {link('Expoテンプレートの元ファイル', expoTemplateAssetNotice.sourceUrl)}
            <Text selectable style={styles.body}>{expoTemplateAssetNotice.text}</Text>
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>Open Food Facts</Text>
            <Text style={styles.body}>商品データの提供：Open Food Factsとその投稿者。データベースはODbL、個々の内容はDatabase Contents License、商品画像はCC BY-SA 3.0で提供されています。</Text>
            {link('Open Food Facts', 'https://world.openfoodfacts.org/')}
            {link('データ・画像のライセンス案内', 'https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/')}
            {link('ODbL 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/')}
            {link('Database Contents License 1.0', 'https://opendatacommons.org/licenses/dbcl/1-0/')}
            {link('CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/')}
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>Yahoo!ショッピング</Text>
            <Text style={styles.body}>接続設定がある場合、検索APIを経由して商品名を取得します。Yahoo!ショッピングの商品画像は使用せず、食材アイコンまたは選んだ写真で表示します。分類・保存場所はアプリで推定しています。</Text>
            <Text selectable style={styles.body}>Webサービス by Yahoo! JAPAN （https://developer.yahoo.co.jp/sitemap/）</Text>
            {link('Yahoo!デベロッパーネットワーク', 'https://developer.yahoo.co.jp/sitemap/')}
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>イメージ写真</Text>
            <Text style={styles.body}>食材の初期表示と写真未設定のレシピにはアイコンを使用します。内蔵レシピの画像はAI生成のイメージで、実際に調理して撮影した写真ではありません。利用者が選んだ写真や、以前保存した外部画像はそのまま保持します。</Text>
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>オープンソースソフトウェア</Text>
            <Text style={styles.body}>このアプリはReact、React Native、Expoなどを使用しています。著作権表示・ライセンス本文を確認できます。</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('OssLicenses')} style={styles.link}>
              <Text style={styles.linkText}>OSSライセンスを確認する</Text>
            </Pressable>
          </View>
        </>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 23 },
  link: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm },
  linkText: { color: colors.primaryDark, fontSize: 14, lineHeight: 22, textDecorationLine: 'underline' },
});
