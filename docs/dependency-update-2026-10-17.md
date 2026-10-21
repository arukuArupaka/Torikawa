# SDK 57の依存更新と安全性確認（2026年10月17日）

[開発ガイド](DEVELOPMENT.md) · [更新前のコード品質監査](code-quality-audit-2026-10-17.md)

## 何を・なぜ変えたか

Expo SDK 57の推奨パッチ版との差分7件と、互換範囲内で修正できる間接依存を更新しました。更新前の変更を保存してから作業し、React `19.2.3`、React Native `0.86.3`、Node 24系の条件を維持しています。画面・在庫・保存・復元の実装、バックアップ形式v1/v2は変更していません。

### Expoの更新

| パッケージ | 更新前 | 更新後 |
| --- | --- | --- |
| expo | 57.0.22 | 57.0.30 |
| expo-camera | 57.0.5 | 57.0.6 |
| expo-constants | 57.0.18 | 57.0.22 |
| expo-document-picker | 57.0.2 | 57.0.3 |
| expo-image-picker | 57.0.17 | 57.0.20 |
| expo-notifications | 57.0.18 | 57.0.23 |
| expo-sharing | 57.0.19 | 57.0.23 |

`npx expo install --fix --npm` でSDK推奨版を導入し、expo-constantsのpackage.jsonの指定も `npx expo install expo-constants@~57.0.22 --npm` で揃えました。Expo CLIやModules Coreなど、SDKが要求する関連依存も更新されています。直接依存の追加・削除や、SDKのメジャー変更はありません。

変更履歴では、[cameraのiOS側のリソース解放・読み取りの修正](https://github.com/expo/expo/blob/sdk-57/packages/expo-camera/CHANGELOG.md)と、[notificationsのAndroid Expo Goでのimport時の修正](https://github.com/expo/expo/blob/sdk-57/packages/expo-notifications/CHANGELOG.md)が含まれます。これらが実機で反映・解消したことは、今回の書き出し検証だけでは確認していません。

### 安全性に関する間接依存の更新

| 対象 | 更新前 → 更新後 | 目的 |
| --- | --- | --- |
| shell-quote | 1.8.4 → 1.12.0 | コメントに続く改行を含む引数の扱いと解析負荷に関する指摘を解消 |
| brace-expansion | 5.0.6 → 5.0.12 | 展開時の処理量・再帰に関する指摘を解消 |
| @xmldom/xmldom | 0.8.13 → 0.8.15、0.9.10 → 0.9.12 | XML処理の不正入力・出力に関する指摘を解消 |
| source-map-js | 1.2.1 → 1.2.2 | source mapの不正入力による処理負荷の指摘を解消 |
| @react-navigation/core | 7.21.1 → 7.24.0 | 脆弱性が指摘されたdecode-uri-componentを使う旧query-stringへの依存を除去 |

SDKの更新後、残る対象は `npm update --ignore-scripts shell-quote brace-expansion @xmldom/xmldom @react-navigation/core` で親の許可範囲内に更新しました。source-map-jsはSDKの依存解決時に更新されました。SDK推奨版と関係のない直接依存の版指定は変更せず、範囲外のoverrideも追加していません。

Navigation Coreの[7系の変更履歴](https://github.com/react-navigation/react-navigation/blob/7.x/packages/core/CHANGELOG.md)を確認し、導入済みのnativeパッケージが許可する `^7.21.1` 内の安定版を選びました。更新後は旧query-string、decode-uri-componentとその補助依存がlockとインストール済みのツリーから外れています。

## npm auditの比較と残る指摘

| 重要度 | 更新前 | 更新後 |
| --- | ---: | ---: |
| 重大 | 1 | **0** |
| 高 | 20 | 16 |
| 中 | 11 | 8 |
| 合計 | 32 | **24** |

これは指摘が波及した**パッケージ数**であり、独立した攻撃経路の数ではありません。指摘を非表示にする設定、依存の除外、`npm audit fix --force` は使用していません。

残る指摘の直接の原因は次の3種類です。24件すべてが解消したとは判断していません。

| 依存・経路 | 内容と残した理由 |
| --- | --- |
| braces 3.0.3：Expo → Metro → micromatch | 深く入れ子になったパターンで処理が停止する指摘。確認時点でnpmの最新版3.0.3も対象で、互換な修正版がない。上流の修正版を待って再評価する。[アドバイザリ](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| node-forge 1.4.0：Expo CLI・コード署名ツール | 特定のRSA署名検証に関する指摘。確認時点でnpmの最新版1.4.0も対象。コード署名ツールには検証の呼び出しがあるため、無害として除外せず記録する。[アドバイザリ](https://github.com/advisories/GHSA-86w9-cpqp-85rv) |
| uuid 7.0.3：Expo config-plugins → xcode | v3/v5/v6に出力バッファを渡す場合の境界検証の指摘。修正版11.1.1はxcodeの `^7.0.3` の範囲外。xcodeの導入済みコードはv4を使用し、指摘された呼び出しは見つからなかったが、依存全体が安全という保証ではない。[アドバイザリ](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |

自作の共有商品APIは、これら3ライブラリをimportしていません。一方、開発・ビルド環境での指摘は残ります。npmが提案するExpo 44への変更は現在のSDK・RNとの互換性を壊すため採用していません。修正版がないライブラリへの独自パッチや、uuidの範囲外の強制置換は今回の対象外としています。

## 確認した方法

| 検査 | 結果 |
| --- | --- |
| `npm test` | **343件成功、失敗0、skip 0** |
| `npm run typecheck` | 成功 |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | 成功 |
| `npx expo-doctor` | **21/21項目成功** |
| `npm ls --all --json` | 成功、依存のproblemsなし |
| `npm ci --dry-run --ignore-scripts --no-audit` | 成功。manifestとlockの整合性確認。クリーン環境への実インストール試験ではない |
| `npm audit --json` | 上記24パッケージを引き続き報告。auditの終了コード0を完了条件に置き換えていない |
| `npm run web:test:export` | 成功。配布用Webの書き出しまで |
| iOS・Android向けExpo export | 両方成功、Hermesバンドル生成まで。ネイティブアプリのビルド・起動確認ではない |
| `npm run licenses` | 依存更新に合わせてOSS通知を再生成。531パッケージ中474件に本文あり、57件は確認が残る |

`tests/dependency-regressions.test.cjs` に3件追加しました。

- 実際のNavigation CoreとStackRouterを描画し、食材登録・食材詳細・レシピ詳細へパラメーターを渡して開き、元のタブのキーを保ったまま戻る。
- 日本語・重複クエリ・不完全なパーセントエンコードを扱い、クエリから食材IDを置き換えない。
- shell-quoteがコメント後の改行・Unicode改行を拒否する。シェルは実行せず、通常の引数の往復も確認する。[対象の指摘](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)

既存の保存・復元・削除・通知・画像・共有APIの回帰テストも、更新後の依存で実行しています。テストのreact-test-renderer非推奨警告や、書き出しの色出力に関する警告は残っています。

## 実機で確認が必要な項目

1. iPhone・Androidでカメラの許可・拒否・再許可、バーコードの連続読み取りと画面を戻した後の再読み取りを確認する。
2. 通知の許可、予約・再同期、通知からの終了状態・前面復帰時の食材詳細の表示を確認する。
3. 写真の選択・縮小、写真入りバックアップの書き出しと復元、登録・詳細からタブへ戻る操作を確認する。

ネイティブ側の依存変更を専用アプリに反映するには再ビルドが必要です。Expo Goのネイティブ機能はExpo Go本体に含まれるため、npmの更新だけでその内部が置き換わるものではありません。[Expoの説明](https://docs.expo.dev/develop/development-builds/introduction/)

更新前の398ファイルのハッシュと未コミット変更224ファイルのコピー、変更履歴・auditの比較・検査ログは、ローカルの `.review/dependency-update-2026-10-17/` に保存しています。Gitへのコミット・pushや公開は行っていません。
