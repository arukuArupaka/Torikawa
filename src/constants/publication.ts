// These values are public and bundled by Expo. Never put credentials here.
export function publicHttpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function getPublicationInformation() {
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';
  return {
    operator: process.env.EXPO_PUBLIC_OPERATOR_NAME?.trim() || null,
    privacyUrl: publicHttpsUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL),
    supportEmail: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : null,
  };
}

export const dataHandlingSections = [
  { title: '端末に保存する情報', body: '食材の名前・数量・期限・メモ・写真、使用履歴、買い物リスト、レシピ、通知設定、バーコードの商品候補を端末に保存します。Web版では利用中のブラウザーに保存します。' },
  { title: '商品情報の共有', body: '共有先が設定され、登録時に投稿ルールに同意して共有を選んだ場合だけ、バーコード・商品名・レシピ用分類・カテゴリを共有商品データベースへ送ります。ルールの版と受付・審査日時も記録し、管理者の確認後に他の利用者が検索できます。個人の在庫・数量・期限・メモ・写真は共有しません。商品名などに氏名や住所を入力しないでください。' },
  { title: '共有商品への通報', body: '共有の検索結果から、バーコードと選んだ理由を送信できます。通報は商品と理由ごとに件数・受付日時・対応日時を記録します。自由記述・写真・連絡先や投稿者・通報者のIDは送りません。通報後は管理者が確認し、必要に応じて非表示にします。共有情報を使わずに手入力することもできます。' },
  { title: '外部サービスへの通信', body: '商品検索では、端末内で見つからないバーコードを、設定された共有商品データベースやYahoo!ショッピング、Open Food Factsへ送ります。外部画像を表示すると画像の配信元へ接続します。接続先はIPアドレスなどの通信情報を受け取り得ます。クックパッド検索は確認後、食材の検索語をブラウザーへ渡します。' },
  { title: 'カメラ・写真・通知', body: 'カメラはバーコードの読み取りと食材写真の撮影、写真へのアクセスは選んだ写真の登録に使います。期限通知は端末に予約するローカル通知です。通知には食材名などが表示されるため、ロック画面の表示設定にもご注意ください。Web版は期限通知に対応していません。' },
  { title: '食材を削除したとき', body: '食材の登録を削除すると、現在の一覧・履歴から除かれます。端末の商品候補、復元前の退避データ、書き出したバックアップは消えません。退避データは現在、自動では期限切れにならず、参照している写真も保持します。' },
  { title: '端末の保存データをまとめて削除', body: '設定の「この端末の保存データを削除」では、食材と履歴、買い物、自作レシピ・お気に入り、設定、商品候補、復元前の退避データ、アプリが保存した写真・一時バックアップ、通知予約と通知センターの表示を削除します。内蔵レシピは初期状態に戻ります。途中で止まった場合は再試行が必要です。写真ライブラリの元画像、外部に保存したファイル、共有商品DBの商品、OS・SDKが管理するキャッシュや端末の許可設定は対象外です。Web版の対象は、このブラウザーの同じサイトだけです。' },
  { title: 'バックアップの取り扱い', body: 'JSONファイルには在庫・メモ・写真などが含まれます。アプリ独自の暗号化はしていません。保存先や共有先を確認し、安全に保管してください。書き出したファイルや共有先のコピーは、アプリで食材を削除しても残ります。不要なコピーは保存先で削除してください。' },
] as const;
