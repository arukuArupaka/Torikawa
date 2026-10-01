import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../constants/theme';
import { RootStackParamList } from '../navigation/types';

type Notice = { name: string; version: string; license: string; documents: { file: string; text: string }[] };
declare const require: (path: string) => Notice[];
// Load the notice text only when this screen is opened.
const loadNotices = () => require('../data/generated/oss-notices.json');

export function OssLicensesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'OssLicenses'>) {
  const notices = useMemo(loadNotices, []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Notice | null>(null);
  const filtered = useMemo(() => notices.filter((notice) => notice.name.toLowerCase().includes(query.trim().toLowerCase())), [notices, query]);
  return <Screen bottomSafe>
    <ScreenHeader title={selected ? 'ライセンス本文' : 'OSSライセンス'} onBack={selected ? () => setSelected(null) : navigation.goBack} />
    {selected ? <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.name}>{selected.name}</Text>
      <Text style={styles.caption}>{selected.version}・{selected.license}</Text>
      {selected.documents.length ? selected.documents.map((document) => <View key={document.file} style={styles.card}>
        <Text style={styles.caption}>{document.file}</Text>
        <Text selectable style={styles.body}>{document.text}</Text>
      </View>) : <Text style={styles.body}>このライブラリの通知文は確認中です。</Text>}
    </ScrollView> : <>
      <View style={styles.search}>
        <TextInput accessibilityLabel="ライブラリ名を検索" value={query} onChangeText={setQuery} placeholder="ライブラリ名を検索" style={styles.input} autoCapitalize="none" />
        <Text style={styles.caption}>{filtered.length}件</Text>
      </View>
      <FlatList data={filtered} keyExtractor={(notice) => `${notice.name}@${notice.version}`}
        contentContainerStyle={styles.content} initialNumToRender={12} windowSize={5}
        ListEmptyComponent={<Text style={styles.body}>一致するライブラリがありません。</Text>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} ${item.version}のライセンス`} onPress={() => setSelected(item)} style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.caption}>{item.version}・{item.license}</Text>
        </Pressable>} />
    </>}
  </Screen>;
}
const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, minHeight: 60 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  caption: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  body: { color: colors.text, fontSize: 14, lineHeight: 23 },
  search: { padding: spacing.md, gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: 12, color: colors.text, fontSize: 16, minHeight: 48 },
});
