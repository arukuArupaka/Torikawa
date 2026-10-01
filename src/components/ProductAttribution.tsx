import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProductSource } from '../types';
import { colors, radius, spacing } from '../constants/theme';
import { useAppAlert } from '../context/AppAlertContext';

export function ProductAttribution({ source, image }: { source?: ProductSource; image: string }) {
  const alert = useAppAlert();
  if (!source) return null;
  const open = async (url: string) => {
    try { await Linking.openURL(url); }
    catch { alert('出典を開けませんでした', '通信環境やブラウザーの設定を確認してください。'); }
  };
  const off = source.provider === 'open-food-facts';
  const activeImage = source.image?.url === image ? source.image : undefined;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>商品情報の出典</Text>
    <Text style={styles.body}>{off ? 'Open Food Factsとその投稿者' : 'Yahoo!ショッピング'}</Text>
    <Text style={styles.body}>取得日：{source.fetchedAt.slice(0, 10)}{source.modified ? '・登録時／編集時に内容を変更' : ''}</Text>
    {off ? <Text style={styles.body}>データ：ODbL／Database Contents License。分類・保存場所はアプリで推定しています。</Text> : null}
    {activeImage ? <Text style={styles.body}>商品画像：{activeImage.author}（Open Food Facts）／CC BY-SA 3.0。画面に合わせて縮小・切り抜き表示しています。</Text> : null}
    <Pressable accessibilityRole="link" onPress={() => void open(source.productUrl)} style={styles.link}>
      <Text style={styles.linkText}>元の商品ページを開く</Text>
    </Pressable>
    {off ? <Pressable accessibilityRole="link" onPress={() => void open('https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/')} style={styles.link}>
      <Text style={styles.linkText}>データのライセンス</Text>
    </Pressable> : null}
    {activeImage ? <Pressable accessibilityRole="link" onPress={() => void open('https://creativecommons.org/licenses/by-sa/3.0/')} style={styles.link}>
      <Text style={styles.linkText}>画像ライセンス（CC BY-SA 3.0）</Text>
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.text, fontSize: 13, lineHeight: 21 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.primaryDark, fontSize: 14, textDecorationLine: 'underline' },
});
