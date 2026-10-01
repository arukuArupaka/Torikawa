import { Text, View, StyleSheet } from 'react-native';
import { SHARED_RULES_VERSION } from '../../shared/productContract';
import { colors, spacing } from '../constants/theme';

export function SharedProductRules() {
  return <View style={styles.rules}>
    <Text accessibilityRole="header" style={styles.title}>商品情報の投稿ルール</Text>
    <Text style={styles.body}>共有する4項目を、他の利用者の検索・登録補助に使うことに同意して投稿してください。共有は任意です。</Text>
    <Text style={styles.body}>自分で確認した商品の正確な情報を入力してください。氏名・住所・連絡先、広告、嫌がらせや差別的な内容は投稿できません。</Text>
    <Text style={styles.body}>他のサービスからコピーした文章や、許可のない情報は投稿できません。外部検索で取得した商品情報は共有対象にしません。</Text>
    <Text style={styles.body}>投稿は管理者の確認後に公開します。不適切な情報は公開せず、公開後も非表示にする場合があります。誤情報は検索結果から通報できます。</Text>
    <Text style={styles.body}>ルールの版：{SHARED_RULES_VERSION}</Text>
  </View>;
}

const styles = StyleSheet.create({
  rules: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  body: { color: colors.text, fontSize: 13, lineHeight: 21 },
});
