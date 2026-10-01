# 開発ガイド

[READMEへ戻る](../README.md) · [使い方](USAGE.md) · [共有商品DB](../server/README.md)

## 開発環境

このプロジェクトはExpo SDK 57、React Native、React、TypeScriptを使用します。依存関係の正確なバージョンは [package.json](../package.json) と [package-lock.json](../package-lock.json) に記録しています。

Node.jsは24.19以降の24系を使用します。共有APIはNode.js組み込みのSQLiteを使います。[Expo SDK 57の公式ドキュメント](https://docs.expo.dev/versions/v57.0.0/)も参照してください。

VS Codeを使う場合は、リポジトリのフォルダーで `code .` を実行します。コマンドがない場合は「ファイル」→「フォルダーを開く」から選べます。

## よく使うコマンド

以下はWindows用です。macOS・Linuxでは `.cmd` を外してください。

| 目的 | コマンド |
| --- | --- |
| 依存関係を導入する | `npm.cmd ci` |
| Expoを起動する | `npm.cmd start` |
| ブラウザーで起動する | `npm.cmd run web` |
| Androidで起動する | `npm.cmd run android` |
| iOSで起動する（macOS） | `npm.cmd run ios` |
| 共有APIを起動する | `npm.cmd run shared-api` |
| 自動テスト | `npm.cmd test` |
| 型チェック | `npm.cmd run typecheck` |
| Expoの構成を診断する | `npx.cmd expo-doctor` |
| 全プラットフォームを書き出す | `npx.cmd expo export --platform all` |

Expo起動中は `a` でAndroidエミュレーター、macOSでは `i` でiOSシミュレーター、`m` で開発メニューを開けます。WindowsではiOSシミュレーターは使えません。実機iPhoneのExpo Goは、PCのExpo CLIと同じExpoアカウントにログインする必要があります。同じWi-Fiでも別のアカウントでは開けません。[公式の説明](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/)

友達のiPhoneへ渡す場合は、専用アプリのTestFlight／Ad Hoc配布、または [Webテスト版](web-friend-testing.md) を使います。Web版では期限通知・ネイティブ固有の権限を確認できません。

依存を追加する場合は `npx.cmd expo install パッケージ名` を使い、SDKに合うバージョンを選びます。通常のセットアップでは、READMEの `npm.cmd ci` だけで必要な依存を導入できます。

## 環境変数の設定

Yahoo!ショッピング検索・共有商品DBを使う場合のみ設定します。初めて `.env` を作る場合は次を実行してください。既存ファイルがある場合は上書きせず、必要な項目を追記します。

```powershell
Copy-Item .env.example .env
```

| 環境変数 | 設定内容 |
| --- | --- |
| `EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID` | 利用するYahoo!ショッピング商品検索APIのアプリケーションID |
| `EXPO_PUBLIC_SHARED_PRODUCTS_URL` | 共有APIのベースURL。ローカルPCでは `http://127.0.0.1:8787` |
| `EXPO_PUBLIC_OPERATOR_NAME` | 公開する運営者名 |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | 公開する問い合わせ先メールアドレス |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | 正式なプライバシーポリシーのHTTPS URL |
| `EXPO_PUBLIC_DEMO_DATA` | 開発用サンプル在庫・商品を使う場合だけ `true`。通常・公開版は `false` |

`.env` / `.env.local` はGit対象外です。設定後はExpoを再起動し、配布アプリへ反映する場合は再ビルド・再配布します。既存の `.env.local` に同じ変数がある場合は、そちらの設定も確認してください。

`EXPO_PUBLIC_` の値はアプリから参照できる公開設定です。秘密鍵・DB認証情報は入れません。共有APIのサーバー設定は [server/README.md](../server/README.md) にまとめています。

Yahoo Client IDも現行実装では配布物に含まれます。API規約上のIDの扱い・公開用途は未確認であり、公開設定にできることを利用許諾とは扱いません。[Phase 5：公開準備](phase5-publication.md)を確認してください。連絡先・ポリシーが未設定の場合、アプリ内では準備中と表示します。

## ファイル構成

```text
Torikawa/
├─ App.tsx              # アプリの入口
├─ app.json             # Expo設定
├─ assets/              # アイコン・食材・レシピ画像
├─ docs/                # 使い方・開発ガイド
├─ server/              # 共有商品API・SQLite・管理用CLI
├─ shared/              # アプリとAPIで共用する商品データの検証
├─ src/
│  ├─ components/       # ボタン・入力欄・カードなどの共通UI
│  ├─ constants/        # 色・余白など
│  ├─ context/          # アプリデータ・確認ダイアログ
│  ├─ data/             # 初期食材・レシピ・商品サンプル
│  ├─ hooks/            # 日付更新など
│  ├─ navigation/       # 画面遷移と型
│  ├─ screens/          # 各画面
│  ├─ services/         # 保存・通知・商品検索・バックアップ
│  ├─ types/            # データ型
│  └─ utils/            # 分量・在庫・日付・分類などの計算
└─ tests/               # 回帰テスト・APIテスト
```

画面の変更は [src/screens](../src/screens)、共通UIは [src/components](../src/components)、色や余白は [theme.ts](../src/constants/theme.ts) から確認します。

## データと保存

| データ | 保存先・定義 |
| --- | --- |
| 食材・レシピ・買い物・通知設定 | 端末内のAsyncStorage。型は [src/types/index.ts](../src/types/index.ts) |
| 端末で学習したバーコード商品 | AsyncStorageの `learnedProducts` |
| 保存キー・読み書き | [storage.ts](../src/services/storage.ts) |
| 状態管理・旧データの補完 | [AppDataContext.tsx](../src/context/AppDataContext.tsx) |
| 共有商品 | サーバーのSQLite。初期値は `server/data/products.sqlite` |

`name` は表示名、`productName` は商品名、`ingredientName` はレシピ照合用の食材名です。画面は商品名があれば優先し、検索用の `tags` とレシピ照合は分けています。日付は `YYYY-MM-DD` 形式です。

保存データが読めない場合は既存データを上書きせず再読み込みを案内します。保存失敗時は再試行を案内し、同じ保存先への書き込みは順番を保証します。

初期レシピの材料補完は、元の内容と一致するデータだけが対象です。編集済み・自作レシピは変更せず、削除した初期レシピも復活させません。人数の補完も保守的に行い、設定済みの人数や明示的な空欄を保持します。

## 検証

自動テストでは、保存・復元、材料照合・人数換算・在庫不足、確認ダイアログ、共有APIの個人項目拒否、投稿同意・旧DB移行・承認前後の検索・通報と管理操作・再送などを確認します。型チェックとExpoの書き出しも合わせて実行できます。

実機では次の流れを確認してください。

- 食材の追加・編集、写真、日付変更、アプリ再起動後の保持
- バーコード読取と未登録時の手入力
- 使い切り・廃棄の確定とキャンセル、履歴の取り消し
- 買い物のチェック、重複防止、食材登録への引き継ぎ
- 通知の許可・テスト通知・通知からの詳細表示
- 現在データを退避したうえでの画像付きバックアップ復元

書き出し成功だけでは、実機のカメラ・通知・写真・スクリーンリーダーの動作確認にはなりません。共有APIのテストは一時DBを使用し、運用DBへテスト商品を追加しません。

## 起動時に困ったら

| 状況 | 対処 |
| --- | --- |
| PowerShellで `npm` が実行できない | `npm.cmd` / `npx.cmd` を使用 |
| 「Project is incompatible」と表示される | プロジェクトとExpo GoがSDK 57に対応しているか確認し、古いサーバーを終了 |
| 古い画面が表示される | `npx.cmd expo start --clear` で再起動し、新しいQRコードを使用 |
| スマホから接続できない | PCとスマホを同じWi-Fiへ接続。必要に応じて `npx.cmd expo start --tunnel` を使用 |
| 共有機能が「準備中」になる | `EXPO_PUBLIC_SHARED_PRODUCTS_URL` を確認してExpoを再起動 |
| スマホからローカル共有APIへ接続できない | スマホのlocalhostはスマホ自身。実機用にはHTTPSの接続先を設定 |

共有APIの配置・永続ディスク・CORS・投稿制限・バックアップは [共有商品DBの運用手順](../server/README.md) を参照してください。

別の接続先を指定してExpo exportする場合、キャッシュに前の値が残ることがあります。接続先が反映されないときは `--clear` を付けて書き出し直し、生成物に意図した公開URLが含まれることを確認してください。確認用のURL・デモ設定を公開ビルドへ残さないでください。
