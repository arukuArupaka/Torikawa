# 画像・レシピ文章の出所確認

[READMEへ戻る](../README.md) · [公開前チェックリスト](publication-checklist.md) · [確認記録JSON](asset-source-audit.json)

確認日：2026-10-08。元ファイル、Git履歴、過去の作業記録、画像のEXIF／テキスト情報を確認しました。出所を特定できないことと、違反・違法であることは別です。制作元や許諾は推測で埋めていません。

## 確認できた標準アイコン

次の6点は、[Expo公式テンプレート](https://github.com/expo/expo/tree/a7f291bd4679b15c1ee64ffca97e68b25c6dda15/templates/expo-template-blank-typescript/assets)のファイルと、バイト列およびSHA-256が一致しました。

- `assets/icon.png`
- `assets/favicon.png`
- `assets/android-icon-foreground.png`
- `assets/android-icon-background.png`
- `assets/android-icon-monochrome.png`
- `assets/splash-icon.png`（現在のapp.jsonでは指定していない）

照合したリビジョンは `a7f291bd4679b15c1ee64ffca97e68b25c6dda15` です。[同じリビジョンのMITライセンス](https://raw.githubusercontent.com/expo/expo/a7f291bd4679b15c1ee64ffca97e68b25c6dda15/LICENSE)はこのリポジトリのLICENSEとも一致しました。アプリの「出典・ライセンス」に元ファイルへのリンクと著作権表示・全文を追加しています。

これは出所とライセンス本文の確認です。ロゴの商標やアプリ名の調査が完了したという意味ではありません。公開時には、たべどきと識別できる専用アイコンへ変更する方が利用者に分かりやすくなります。

## 出所未確認の内蔵レシピ写真

| ファイル | 対応する料理 | 状態 |
| --- | --- | --- |
| `pork-cabbage-miso-stir-fry.jpg` | 豚肉とキャベツの味噌炒め | 出所・許諾未確認 |
| `fluffy-omelette.jpg` | ふわとろ卵のオムレツ | 出所・許諾未確認 |
| `tofu-wakame-miso-soup.jpg` | 豆腐とわかめの味噌汁 | 出所・許諾未確認 |
| `cabbage-egg-stir-fry.jpg` | キャベツと卵の中華炒め | 出所・許諾未確認 |
| `milk-potage.jpg` | 牛乳ポタージュ | 出所・許諾未確認 |
| `tofu-steak.jpg` | 豆腐ステーキ | 出所・許諾未確認 |
| `vegetable-soup.jpg` | 野菜たっぷりスープ | 出所・許諾未確認 |
| `egg-sandwich.jpg` | 卵サンド | 出所・許諾未確認 |

すべて `assets/recipes/` にあります。JPEG8枚の画像メタデータに作者・著作権の記録は見つかりませんでした。Gitに含まれていることだけでは、自作・AI生成・許諾済みのいずれとも判断できません。Unsplash由来と断定する根拠もありません。

正式公開前には各ファイルの元ページ・作者・適用条件または制作記録を用意します。記録が得られなければ、自分で撮影した写真、制作過程を記録した画像、または出所・条件を確認できる素材へ置き換えます。利用者が登録した写真・編集済みレシピの内容を一括削除して対応しないでください。

## 固定のUnsplash URL

レシピの画像未設定時、端末内のレシピ候補、開発用サンプルなどに固定URLがあります。旧サンプルレシピ画像のURLは移行時の照合にも使います。開発用食材・商品カタログの画像は通常のデモOFF起動とは区別します。

[通常ライセンスの公式案内](https://help.unsplash.com/en/articles/2612315-can-i-use-unsplash-images-for-personal-or-commercial-projects)では、通常の画像利用にクレジットを必須としていません。一方、[API経由の表示規定](https://help.unsplash.com/en/articles/2511315-guideline-attribution)には撮影者とUnsplashへの表示・リンク条件があります。固定CDN URLだけでは、作者・元ページ・取得経路・適用条件を確認したことにはなりません。Unsplash+も通常ライセンスと混同しません。

URLごとの参照元をJSONに記録しました。各写真の元ページと取得経路を確認するか、画像未設定時の表示を出所の分かるアイコンへ置き換える作業が残ります。今回は既存画像の削除・差し替えはしていません。

## レシピ文章

`src/data/sampleData.ts`、移行用の `src/data/legacySampleRecipes.v1.json`、`src/services/localRecipeSuggestionService.ts` の文章を確認対象として記録しました。材料や一般的な調理方法が含まれていますが、それだけで各文章の出所や転載の有無を確定できません。元の作者・制作記録は未確認です。

置き換える場合は独立して作成した説明文を使い、材料・分量・手順の整合性も確認します。保存済みの自作・編集済みレシピは保持し、未編集の内蔵レシピだけを必要に応じて移行する設計が必要です。

## 対象外として残る確認

Open Food Factsから実際に取得した商品ごとの出典・画像投稿者、利用者の写真、Yahooの商品名の再利用条件、最終配布物のフォントとOSS、商標は、この固定素材の照合だけでは確認完了になりません。引き続き公開前チェックリストで管理します。
