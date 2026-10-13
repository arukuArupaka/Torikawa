# たべどき！！

**冷蔵庫の「何がある？」「いつまで？」をまとめて、食べどきを逃さない。**

食材の期限と残量を管理し、レシピ選びから買い物までつなげるアプリです。iPhone・Android向けに開発しており、ブラウザーでも画面や基本操作を確認できます。

[はじめる](#はじめる) · [使い方](docs/USAGE.md) · [開発ガイド](docs/DEVELOPMENT.md) · [共有商品DB](server/README.md)

公開前に友達のiPhoneで試す場合は、[友達向けWebテスト版の準備・配布](docs/web-friend-testing.md)を参照してください。Apple開発者登録は不要で、期限通知は対象外です。

## 主な機能

| 機能 | できること |
| --- | --- |
| 食材管理 | 期限・保存場所・残量を登録し、検索やカレンダーで確認 |
| 入力の省略 | バーコード検索、自動補完、前回の登録内容を使った再登録 |
| レシピ | 手持ちの食材から検索し、人数に合わせた分量と不足量を確認 |
| 買い物リスト | 不足材料を分量メモ付きで追加し、購入後の食材登録へ |
| 期限通知・統計 | 期限前の通知と、使い切り・廃棄の履歴や集計 |
| バックアップ | 食材・レシピ・設定などを書き出し、別の端末へ復元 |
| データの削除 | 商品候補・復元前の退避も含め、確認して端末の保存データを一括削除 |

## はじめる

### 1. 準備する

- **Node.js 24.19以降の24系**とnpm
- **Git**（リポジトリを取得する場合）
- 実機で試す場合は、**Expo SDK 57に対応したExpo Go**と、PC・スマホを接続する同じWi-Fi

以下はWindowsのPowerShell用です。macOS・Linuxでは `npm.cmd` / `npx.cmd` の `.cmd` を外してください。

### 2. 取得・インストールする

```powershell
git clone https://github.com/arukuArupaka/Torikawa.git
cd Torikawa
npm.cmd ci
```

すでに取得済みなら、そのフォルダーで `npm.cmd ci` を実行します。

### 3. 起動する

**スマートフォンで試す**

```powershell
npm.cmd start
```

表示されたQRコードを、iPhoneは標準カメラ、AndroidはExpo Goから読み取ります。

**ブラウザーで試す**

```powershell
npm.cmd run web
```

初回の在庫と買い物リストは空で、期限通知はOFFです。内蔵レシピは表示されます。サンプル在庫・サンプル商品で試す場合だけ、`.env` の `EXPO_PUBLIC_DEMO_DATA=true` を設定して再起動してください。カメラを使わず番号を入力して商品検索することもできます。

> 自動入力された期限・数量・保存場所は目安です。登録時に商品の表示や実際の残量を確認してください。カメラ・通知・画像付きバックアップの確認には実機を使います。

## 商品情報の共有

見つからなかったバーコード商品を手入力したとき、利用者が投稿ルールに同意して選んだ場合に商品情報を送信できます。管理者の承認後、別の利用者が同じバーコードから情報を取得し、入力を省略できます。共有の検索結果から通報したり、その情報を使わず手入力したりできます。

| 共有する情報 | 共有しない情報 |
| --- | --- |
| バーコード・商品名・レシピ用分類・カテゴリ | 個人の在庫・数量・期限・購入日・保存場所・メモ・写真・タグ・利用者ID |

**個人の冷蔵庫の中身を共有する機能ではありません。** 共有チェックは初期状態でオフです。個人の食材や設定は端末内に保存します。

共有APIはローカルで動作確認済みで、公開先は未設定です。共有先を設定しなくても、食材登録や従来の商品検索は利用できます。起動・公開設定は [共有商品DBの手順](server/README.md) を参照してください。

## 商品検索の設定（任意）

Yahoo!ショッピング検索や共有商品DBを利用する場合は、リポジトリ直下の `.env` に接続設定を用意します。変数名は [.env.example](.env.example) に記載しています。

| 環境変数 | 用途 |
| --- | --- |
| `YAHOO_SHOPPING_APP_ID` | Yahoo検索APIのサーバーだけで使うClient ID。アプリには含めない |
| `EXPO_PUBLIC_YAHOO_LOOKUP_URL` | アプリから呼ぶ商品名検索APIのURL |
| `EXPO_PUBLIC_SHARED_PRODUCTS_URL` | 共有商品APIのURL |

設定後はExpoを再起動します。`EXPO_PUBLIC_` の値はアプリに含まれるため、秘密鍵やDBの認証情報は設定しません。詳しくは [環境変数の設定](docs/DEVELOPMENT.md#環境変数の設定) を参照してください。

Yahoo検索はサーバー経由で商品名を取得し、Yahooの商品画像は使いません。食材アイコンまたは自分の写真を表示します。[接続手順](docs/yahoo-name-search.md)を参照してください。商品名の保存・再利用などの利用条件は引き続き確認が必要です。

公開用の連絡先とポリシーをWebテスト版へ反映するには、専用の公開設定ファイルを使います。設定項目・未完了の確認は [公開前チェックリスト](docs/publication-checklist.md)、これまでの実装は [Phase 5：公開準備](docs/phase5-publication.md) にまとめています。

## 詳しいガイド

| 目的 | 読むページ |
| --- | --- |
| 公開前の画像・API・プライバシー等の課題を確認する | [公開前の権利・規約確認](docs/publication-compliance-review.md) |
| アイコン・レシピ画像・文章の出所を確認する | [素材の確認記録](docs/asset-sources.md) |
| Phase 5の公開準備・未確定事項を確認する | [Phase 5：公開準備](docs/phase5-publication.md) |
| 公開設定と実機確認を進める | [公開前チェックリスト](docs/publication-checklist.md) |
| Phase 1〜4の確認結果と残る作業を見る | [横断確認の結果](docs/phases1-4-verification.md) |
| 食材・バーコード・レシピ・買い物を使う | [使い方ガイド](docs/USAGE.md) |
| 通知やバックアップを設定する | [使い方ガイド](docs/USAGE.md#期限通知) |
| 保存エラー・読み込み失敗から復旧する | [データ保護と復旧](docs/data-protection.md) |
| 商品訂正・在庫の使用記録の改善内容を確認する | [Phase 2の変更と検証](docs/phase2-registration-inventory.md) |
| 通知の再同期・写真付きバックアップの改善内容を確認する | [Phase 3の変更と実機確認項目](docs/phase3-notifications-backup.md) |
| 入力・買い物・表示速度の改善内容を確認する | [Phase 4の変更と計測結果](docs/phase4-input-performance.md) |
| 開発環境・ファイル構成・検証方法を確認する | [開発ガイド](docs/DEVELOPMENT.md) |
| 共有APIを起動・公開・管理する | [共有商品DB](server/README.md) |

## 開発・検証

Expo SDK 57 / React Native / React / TypeScriptで開発しています。依存関係の正確なバージョンは [package.json](package.json)、利用条件は [LICENSE](LICENSE) を参照してください。

```powershell
npm.cmd test
npm.cmd run typecheck
```

開発時は [Expo SDK 57の公式ドキュメント](https://docs.expo.dev/versions/v57.0.0/) を参照してください。依存関係の確認や起動トラブルの対処は [開発ガイド](docs/DEVELOPMENT.md) にまとめています。
