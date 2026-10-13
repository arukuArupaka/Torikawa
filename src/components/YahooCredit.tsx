import { Linking, Text } from 'react-native';
import { isYahooProductLookupConfigured } from '../services/yahooProductLookupService';

export function YahooCredit() {
  if (!isYahooProductLookupConfigured()) return null;
  return <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://developer.yahoo.co.jp/sitemap/')}
    style={{ margin: 15 }}>Webサービス by Yahoo! JAPAN （https://developer.yahoo.co.jp/sitemap/）</Text>;
}
