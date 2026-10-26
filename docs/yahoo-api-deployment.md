# Yahoo商品名検索をPCなしで動かす

更新：2026-10-26。Cloudflare Workers Freeプランへ配備し、認証情報を付けないHTTPS接続で実際のYahoo商品名検索を確認しました。iPhone実機での接続と、正式公開に向けた利用条件・アプリ用ポリシーの確認は別に残っています。

検索URL：<https://tabedoki-yahoo-lookup.yahoo-lookup.workers.dev/api/yahoo-product>

ヘルス確認：<https://tabedoki-yahoo-lookup.yahoo-lookup.workers.dev/healthz>

## 何を置くのか

iPhone → Cloudflareの検索API → Yahoo!ショッピングの順で問い合わせます。Cloudflareへ置くのは商品名検索の中継処理だけです。紹介サイトはGitHub Pagesのままで、在庫アプリ・共有商品DB・ローカルファイルは配信しません。既存のNodeサーバーも開発用として維持します。

Node側とCloudflare側は `server/yahoo-product-lookup.cjs` の要求検証と検索処理を共用します。返すのはバーコード・商品名・出典URLのみで、Yahooの商品画像や説明文は返しません。Client IDはCloudflareのSecretとして設定し、アプリ・Git・サイトへ入れません。

## 制限と記録

- 全利用者・全地域で1秒1件、同時処理1件。SQLite-backed Durable Objectを1つ使って制御します。地域ごとに別カウンターを作りません。
- 運用上の初期上限は全利用者合計で1日1,000回。Yahooの契約上の利用可能回数を示す数字ではありません。`wrangler.json` の `DAILY_LOOKUP_LIMIT` で1〜10,000回に設定できます。
- 日の切り替えはUTC 0時（日本時間9時）。上限を超えると429と `Retry-After` を返し、自動で待ち続けるキューは作りません。アプリ側は既存の別検索・手入力の流れへ進みます。
- カウンターはYahooへの通信前に保存します。検索失敗も1回に数え、サーバー再起動で制限がリセットされないようにします。カウンターを読めない・保存できない場合は検索を止めます。
- 独自に永続保存するのは当日の識別値・回数・次に受け付ける時刻の3つの数値だけです。バーコード、商品名、IP、写真は記録しません。過去の日付ごとに行を増やしません。基盤の復旧用データ等の保持仕様は別です。
- `Cache-Control: no-store` とし、商品結果をキャッシュしません。独自のconsole出力は行わず、Workersのobservabilityを無効にします。Cloudflare自身による接続情報・セキュリティ情報の処理までゼロになるとの意味ではありません。正式ポリシーでは[Cloudflareの方針](https://www.cloudflare.com/privacypolicy/)・契約・実際の設定を確認して説明します。
- 公開アプリから呼べる匿名APIです。Origin確認はブラウザーからの別サイト利用を制限しますが、認証の代わりにはなりません。他者が制限枠を使い切るリスクは残ります。CORSを広げず、上限・エラー率を監視し、被害が続く場合は別途アプリの正当性確認を検討します。

2026-10-26に確認した[Workersの料金](https://developers.cloudflare.com/workers/platform/pricing/)と[Durable Objectsの料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)では、SQLite版はFreeプランで使え、無料枠を超えた操作は失敗します。既にPaidプランのアカウントでは料金が発生する場合があります。コードの回数制限は、あらゆるアクセスやアカウント全体の請求額を保証するものではありません。配備前に選択したアカウントのプランを確認し、勝手に有料プランへ変更しません。

## 配備前に確認すること

1. CloudflareアカウントとWorkers Freeプランの利用状況を確認する。GoogleフォームやExpoのアカウントとは別です。
2. Yahoo Client IDの管理者が、[商品検索仕様](https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html)・[利用約款](https://developer.yahoo.co.jp/webapi/shopping/api_contract.html)と実際の登録条件に照らし、商品名を端末に保存・再利用する本アプリの用途を確認する。画像を返さないことだけで全用途の承認済みとはしません。
3. 公開アプリの自サイトに[公式クレジット](https://developer.yahoo.co.jp/attribution/)を配置する。アプリ設定内の表記だけで自サイトの要件を代替したとはしません。2026-10-26に紹介サイトのフッターへ、公式スニペットと15pxの周囲の余白を保持して追加しました。通常のリンクの色・文字サイズを保ちます。
4. 実際の配備先・接続情報の取り扱いをアプリ用ポリシーへ反映する。共有商品APIを同時に公開する必要はありません。

## ローカルで検証する

Node 24.19以降の24系を使い、リポジトリ直下から実行します。WranglerはCloudflareの配備用CLIで、Expoアプリの依存関係には追加しません。以下は検証に使用した版を指定しています。

```powershell
node --test tests/yahoo-worker.test.cjs tests/yahoo-proxy.test.cjs tests/yahoo-product-server.test.cjs tests/yahoo-name-lookup.test.cjs
npx.cmd --yes wrangler@4.152.0 deploy --config deployment/yahoo-lookup/wrangler.json --dry-run --outdir .review/yahoo-worker-build
npm.cmd test
npm.cmd run typecheck
```

`--dry-run` は配備しません。出力はAPIコードだけで、`.env`・在庫・バックアップ・写真・公式サイトは含めません。ローカル実行の `.dev.vars*` と `.wrangler/` はGitとEAS送信の対象外にしています。

```powershell
# ローカル実行。外部公開せず、設定なしなら検索は503です。
npx.cmd --yes wrangler@4.152.0 dev --config deployment/yahoo-lookup/wrangler.json --local --ip 127.0.0.1 --port 8791
```

## 本人のログイン後に配備する

以下は初回配備で使用した手順です。2026-10-26に本人のログイン・接続許可後、Freeプランと同名Workerがないことを確認して実施しました。初回だけWorkersのサブドメインを設定する場合があります。アカウントID・発行URLは実際に返された値を使い、推測でアプリへ設定しません。

```powershell
npx.cmd --yes wrangler@4.152.0 login
npx.cmd --yes wrangler@4.152.0 whoami
npx.cmd --yes wrangler@4.152.0 deploy --config deployment/yahoo-lookup/wrangler.json
npx.cmd --yes wrangler@4.152.0 secret put YAHOO_SHOPPING_APP_ID --config deployment/yahoo-lookup/wrangler.json
```

最初の配備直後はSecret未設定のため503で、Yahooへ問い合わせません。Secretは本人の入力欄・所定の秘密情報設定へ入れます。チャットへ貼る必要はありません。既存のローカルIDを移す場合も、必要な1項目だけを非表示で渡し、`.env` 全体をアップロードしません。Secretの追加は新しいバージョンを即時配備します。

PCの配備ツールの接続は `login --scopes account:read user:read workers_scripts:write` で、アカウント・本人情報の参照とWorkerスクリプト・Durable Objectの管理に絞れます。認証画面では本人が対象アカウントと許可内容を確認します。

公開確認は、実際に発行されたURLで行います。

- `GET /healthz` が200で `{"status":"ready"}`。これは設定の有無だけの検査で、Yahooの稼働・認証・利用枠の保証ではありません。
- `GET /api/yahoo-product?barcode=4901625421798` で商品名が返り、Client ID・商品画像・説明文が返らない。
- 連続アクセスが429になり、不正JANが400、別Originが403、不要なパスが404になる。全利用者の枠を消費する大量試験はしない。
- 配備ツールを止めてもアクセスできる。最終的にPCを停止した状態でもiPhoneから確認する。

## iPhoneへ反映する

稼働確認後、実際の上記URLを `EXPO_PUBLIC_YAHOO_LOOKUP_URL` へ設定しました。Expo Go用はGit対象外の `.env.local`、配布版は `eas.json` のproductionプロファイルの公開値に反映済みです。Expo GoはExpoの再起動・完全再読み込み、配布版は再ビルドが必要です。設定しただけで既に端末へ配布されたコードが変わるわけではありません。架空のURLや古い一時トンネルを残しません。

設定後は実機でかむかむレモンの商品名・アイコンを確認し、通信OFF・商品未発見・回数制限でも手入力で登録できることを確認します。個人の在庫や保存写真は移動しません。

## 停止・更新

- 検索だけを停止する場合は、対象アカウントとWorker名を確認して `wrangler secret delete YAHOO_SHOPPING_APP_ID --config deployment/yahoo-lookup/wrangler.json` を実行します。設定なしの503に戻り、在庫やバックアップに影響しません。再開時は同じWorkerへSecretを設定し直します。
- 更新はテストとdry-run後、同じ名前へ `deploy` します。`YahooLookupGate` のクラス名・`yahoo-product-v1`・migration `v1` を安易に変更しません。別のカウンターが作られると既存の利用枠を引き継げません。
- 回数・状態コードなどの集計を管理画面で確認し、失敗が続いたら停止・設定を確認します。URLを含むリクエストログや `wrangler tail` を調査で有効にする場合、バーコード等が記録される範囲・期間・閲覧者を先に確認します。

## 公式資料

- [Durable ObjectsのSQLiteストレージ](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Wranglerの構成](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Secret](https://developers.cloudflare.com/workers/configuration/secrets/)

実機で必要な確認：常設URLからのYahoo検索、通信失敗時の手入力、アプリ再起動後の接続、既存在庫とバックアップの保持。アプリのデザインと保存処理は今回変更していません。

## 2026-10-26のローカル確認結果

- Node 24.21.0で `npm test` は434件成功（追加12件）、`npm run typecheck` も成功しました。PC内通信のテストはサンドボックスでEACCESとなったため、同じテストを制限外で実行しています。
- Wrangler 4.152.0でdry-runビルドを確認しました。出力コードに設定済みのClient IDとテスト用データを含まないことを検査しました。アプリ依存の追加はありません。
- 実際のローカルWorkers実行環境で、未設定503・不正JAN400・不要なパス404・POST405を確認しました。
- Yahooを架空の商品応答に置き換えた隔離テストでも、本番のWorkerクラスとSQLite-backed Durable Objectを動かし、正常200・応答3項目のみ・連続429・サーバー再起動後も日次制限429を確認しました。実際のYahooへの通信やクラウドでの稼働確認の代わりではありません。
- 互換日付は実行環境が対応する `2026-10-01` に固定しています。日付の自動更新で挙動を変えません。

## 2026-10-26の常設先での確認結果

- 本人の許可を得てCloudflare公式Wranglerを接続し、画面上でWorkers Free（現在のプラン）が選択されていることを確認しました。有料プランへの変更はしていません。
- 配備対象はWorker `tabedoki-yahoo-lookup` とそのSQLite-backed Durable Objectだけです。Client IDは既存のローカル設定から1項目だけをSecretへ移しました。値を表示せず、アプリやGitへ入れていません。
- 公開直後はHTTPS証明書の反映待ちがあり、その後HTTPSを検証した接続で200を確認しました。証明書検証を無効にしていません。
- クラウドでは標準Fetchの `redirect: 'error'` が未対応でTypeErrorになることが判明しました。[Cloudflare公式仕様](https://developers.cloudflare.com/workers/runtime-apis/request/#constructor)に沿い、Cloudflare用アダプターだけ `manual` にします。共有処理は3xxをエラーとして扱い、別URLへClient IDを転送しません。Node側の `error` 指定は維持します。
- 一時診断では接続エラーの種類・秘密とURLを除去した理由だけを出力し、ライブログを確認しました。診断版は通常版へ戻し、ライブログの接続も停止済みです。独自のconsole出力とWorkers observabilityは無効の状態です。
- 通常版の最終Version IDは `87fe805f-9389-4eb1-95c7-e6d948866fcf`。認証情報なしで `/healthz` が200、JAN `4901625421798` の商品名に「かむかむ」が含まれること、応答が3項目だけであることを確認しました。同時要求は200/429、不正JANは400、別Originは403、`.env` は404でした。
- PC内の配備・テストサーバーを止めた状態でも常設URLからの検索を確認しました。PC自体の停止中のiPhone確認は未実施です。iPhone公開ビルド、Yahooの全用途の規約確認、アプリ用正式ポリシーの完成を意味するものではありません。
