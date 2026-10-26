# iPhone版の配布準備

更新：2026-10-22。利用者の方針はiPhoneアプリのApp Store公開です。Apple Developer Programは登録済み、App Store Connectのアプリは未作成です。登録済みとの回答は、PCでのApple認証や署名証明書の設定まで確認済みという意味ではありません。

2026-10-26追記：[正式ポリシー](https://maeken07.github.io/tabedoki-website/privacy.html)を掲載し、`production`・ローカル設定へURLを反映しました。問い合わせの確認頻度・1年を目安とした削除方針を本人が採用し、フォーム説明にも反映済みです。初回公開用の共有商品APIの接続先は空にしました。App Store Connectへの登録、署名済みビルド、Yahooの商品名の保存・再利用条件の確認は未完了です。

同日、Expoアカウント `maeken` に `refrigerator-note` のEASプロジェクトを新規作成し、実際に返されたID `f5c33856-c308-4c95-913e-c7541999bfc3` を `extra.eas.projectId` に設定しました。EAS CLI 25.3.0でproduction設定を検証し、送信予定のアーカイブをローカルで確認済みです。ソースコードのアップロード・クラウドビルド・Appleへの提出はまだ実施していません。

## ローカルで用意した設定

- 利用者が選んだBundle IDは `com.arukuarupaka.tabedoki`。Apple側での登録・利用可能性は別途確認します。画面に表示するアプリ名とは別の識別情報です。App Storeへの初回登録後は変更せず使い続けます。
- `ios.supportsTablet` は `false` とし、iPad向けの最適化は対象にしません。iPad上のiPhone互換動作まで禁止する設定ではありません。
- `eas.json` の `production` は `distribution: store`、`ios.simulator: false`。TestFlight・App Store向けの実機用ビルドです。Ad HocやExpo GoのQRコード配布とは異なります。
- ビルドにはNode 24.21.0を指定します。アプリのバージョンは既存の1.20.0を維持し、ビルド番号の自動更新はEAS側で管理します。`ios.buildNumber: "1"` は初期値です。
- `production` 環境の公開値を使い、ローカルのdotenv読み込み・デモ・Webテストの設定は無効にします。運営者表示名・問い合わせフォーム・正式ポリシー・常設Yahoo検索APIのURLは `eas.json` のproductionプロファイルに設定済みです。共有商品APIは未接続です。実際のビルドでこれらの値を確認します。
- `.easignore` は `.gitignore` の除外対象を引き継ぎ、追加で `review/` と `output/` を除外します。認証ファイル、ローカル設定、DB、バックアップや作業画像をビルド用ソースに入れません。`.gitignore` を更新したら `.easignore` にも反映してください。

## ビルド前に揃えるもの

| 項目 | 作業 |
| --- | --- |
| EASプロジェクト | 上記の実在するプロジェクトへ紐づけ済み。今後も同じIDを引き継ぎ、仮のUUIDで上書きしない |
| Appleのアプリ登録 | 同じBundle IDをApple Developer側に登録し、App Store Connectにアプリを作成する。Appleチーム、署名証明書・プロビジョニング、アプリのApple IDを確認する |
| 公開設定 | 下表の値をEASのproduction環境に設定する。ローカルの `.env.local` はクラウドビルドへ送らない |
| 素材・外部サービス | [素材の確認](asset-sources.md)、[Yahoo検索の残る確認](yahoo-name-search.md)、配布物に含まれるOSS・フォントの通知を確認する |
| ポリシー・問い合わせ運用 | [掲載前の確認事項](privacy-policy-publication.md)に沿って本文を確定し、[運用手順](support-operations.md)の送信・受信・返信・削除を確認する。`npm.cmd run policy:build -- --preview` で掲載予定の3ページを手元に作れる |

| EAS productionに設定する公開値 | 内容 |
| --- | --- |
| `EXPO_PUBLIC_OPERATOR_NAME` | 利用者が決めた「たべどき!!運営」。ローカルと `eas.json` のproductionプロファイルに設定済み。必要な事業者情報への対応とは別途確認する |
| `EXPO_PUBLIC_SUPPORT_FORM_URL` | 回答者用フォーム `https://forms.gle/Rjoy4xiwzE7uBDf57`。ローカルとproductionプロファイルに設定済み |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | 正式本文を掲載した `https://maeken07.github.io/tabedoki-website/privacy.html`。ローカル・production設定へ反映済み。新規ビルドでリンクを確認する |
| `EXPO_PUBLIC_YAHOO_LOOKUP_URL` | PCを停止しても使えるHTTPSのYahoo検索API。ループバック・LAN・一時トンネルのURLを正式配布用に流用しない |
| `EXPO_PUBLIC_SHARED_PRODUCTS_URL` | 初回公開用のproduction設定では明示的に空欄。共有機能の提供を開始するときは、運用・ポリシーを揃えてから設定する |

Yahoo検索は2026-10-26に[Cloudflare Workersへ配備](yahoo-api-deployment.md)しました。`https://tabedoki-yahoo-lookup.yahoo-lookup.workers.dev/api/yahoo-product` から実商品名を確認し、`eas.json` のproductionプロファイルへ設定済みです。配布版の再ビルド・実機確認はまだで、正式ポリシーと利用条件の確認も別に必要です。

`EXPO_PUBLIC_` はアプリに含まれる公開情報です。YahooのClient IDは検索サーバーだけへ設定します。Appleのパスワード・認証コード・署名鍵・APIキーはチャットやGitへ入れず、本人の認証画面や所定の認証情報管理を使います。ここで示した設定ファイルだけでは公開可能との判定にはなりません。

## ビルドからTestFlightまで

WindowsからもEASのクラウドビルドを利用できます。依存ライブラリを変更する作業ではないため、EAS CLIは公式手順の `npx.cmd eas-cli@latest` を使います。実際にビルドする前に、ソースの送信先、ビルド枠・料金、署名情報の管理方法を確認してください。

1. `npm.cmd test` と `npm.cmd run typecheck` を通し、配布対象のソースと画像を確定します。
2. `npx.cmd eas-cli@latest project:init` でEASのプロジェクトを紐づけます。既存プロジェクトがある場合は、そのIDを引き継ぎます。
3. production環境の公開値とApple側の登録・署名設定を揃えます。`npx.cmd eas-cli@latest build:inspect --platform ios --profile production --stage archive --output .review/ios-build-archive` で送信する内容を確認します。出力先が既にある場合は別の新規フォルダーを使います。
4. `npx.cmd eas-cli@latest build --platform ios --profile production` でストア用のビルドを作ります。
5. 対象のビルドとApp Store Connectのアプリを確認し、`npx.cmd eas-cli@latest submit --platform ios --id ビルドID` でアップロードします。App Store Connectで処理完了・必要な申告を確認してからTestFlightのテスト対象を設定します。アップロードだけで一般公開にはなりません。
6. テスターを追加する場合は配布相手・グループを確認します。外部テストにはAppleのベータ審査が必要になる場合があります。実機確認の完了後、ストア説明・スクリーンショット・年齢区分・プライバシー申告・サポートURL・ポリシーURLを揃えてApp Reviewへ提出します。

## 在庫を守って実機確認する

Expo Goと単独アプリは保存先が別です。在庫や写真は自動で移りません。先にExpo Goから写真付きバックアップを書き出し、保存先にファイルがあることを確認します。新しいアプリで復元し、内容が戻るまでExpo Go側の元データを削除しません。バックアップv1/v2の形式や保存処理を、配布設定の都合で変更しません。

- 写真付き登録→終了→再起動、残量・メモ・期限の編集、使い切り・廃棄・取り消しを確認する。
- ホーム・カレンダー・詳細の値が一致し、バックアップから写真・在庫・レシピのお気に入りが復元できることを確認する。
- Yahooの商品名検索・商品未発見・通信OFF・カメラ／写真の権限拒否と再試行を確認する。
- 実際の通知許可・期限通知・通知タップ先・アプリに戻った際の再同期を確認する。Expo Goの通知制限を、配布版の確認済み結果に置き換えない。
- 問い合わせフォーム・正式ポリシーのリンク、アプリアイコン、文字拡大・読み上げ、更新後の既存データを確認する。

## 公式資料

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [EAS Buildの初回設定](https://docs.expo.dev/build/setup/)
- [eas.jsonの設定](https://docs.expo.dev/eas/json/)
- [EASの環境変数](https://docs.expo.dev/eas/environment-variables/)
- [ビルドへ送らないファイル](https://docs.expo.dev/build-reference/easignore/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
