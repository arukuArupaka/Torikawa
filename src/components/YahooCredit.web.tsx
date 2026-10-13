import { isYahooProductLookupConfigured } from '../services/yahooProductLookupService';

export function YahooCredit() {
  if (!isYahooProductLookupConfigured()) return null;
  // Yahoo's prescribed attribution snippet, with its text, link and margins unchanged.
  return <span style={{ margin: '15px 15px 15px 15px' }}><a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a></span>;
}
