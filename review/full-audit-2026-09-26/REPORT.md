# たべどき！！ 全体レビュー

調査日：2026年9月26日／対象：v1.20.0、コミット `c4513087b4df4e6eb5e1070a08620fb009e88f62`

最終確認：2026年9月29日。同じコミットで、追跡対象のコードに未コミットの変更がないことを確認しました。テスト・画面・性能の結果は9月26日の調査時点です。

**新機能より、復元・写真・在庫更新の整合性を先に固める段階です。** 商品共有と個人の在庫を分ける方針は維持できます。画面も全面的な作り直しは不要です。

今回はレビューのみです。アプリ・サーバーのコード、設定、実データは変更せず、commit・pushも行っていません。この報告書と今回撮影した画面だけを保存しました。

## 確認方法と限界

- package.json、app.json、全画面、関連するContext・サービス・型・数量・日付・検索・共有契約・サーバーを追跡。eas.jsonは存在しません。
- 既存テストは **99件成功**。通常のTypeScript型チェックも成功。追加の未使用チェックでは未使用importを3件検出しました。
- 実際のアプリ関数を読み込み、保存失敗、壊れたバックアップ、通知予約失敗、並行保存などをメモリー内の代替ストレージ／通知APIで再現しました。利用者の保存データや実際の通知予約は操作していません。
- Webを390×844で確認。ホーム、登録、バーコード、レシピ、調理記録、カレンダー、買い物、統計、設定の12枚を保存・目視確認しました。
- iPhone／Android実機での撮影、通知配信、OS権限画面、ファイル共有、別端末復元、強制終了、低容量時の実測は **未確認**。公開API、ストア管理画面、署名設定も未確認です。
- 以下の「再現」は条件を与えた検証結果です。現在の利用者データが既に壊れている、という意味ではありません。

## A. 重大な問題

### A1. 復元の途中失敗で、新旧データが混在する【再現】

**対象：** [backupService.ts:244](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:244)、[SettingsScreen.tsx:163](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/SettingsScreen.tsx:163)

- **内容：** 食材・レシピ・買い物・設定・学習商品を5つのキーへ `Promise.all` で書き込みます。まとめて成功／取り消しする仕組みがありません。
- **再現：** レシピの保存だけ失敗させると、食材は復元データ、レシピは旧データ、買い物は復元データになりました。画面には復元失敗と出て、Contextの置き換えは実行されません。
- **現象：** その場の画面と再起動後のデータが食い違います。失敗したから元に戻ったと思って操作すると、さらに上書きする可能性があります。
- **方針：** 復元データ・画像を別領域へ準備し、検証・永続化完了後に参照先を一度だけ切り替える。旧世代を残し、起動時に未完了復元を回復できるようにする。復元中の通常更新も制御する。

### A2. 保存が成功する前に写真を削除する【再現】

**対象：** [AppDataContext.tsx:221](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:221)、[AppDataContext.tsx:276](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:276)、[imageStorage.ts:17](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/imageStorage.ts:17)

- **内容：** 食材／レシピの削除や写真変更時、Reactのstate更新関数の中で古い画像ファイルを消します。AsyncStorageへの保存は後続のeffectです。
- **再現：** 食材削除時の保存を失敗させると、保存領域には元の食材が1件残り、写真だけが失われました。
- **現象：** 再起動後に写真のない食材が復活します。その状態でバックアップすると、画像が読めず書き出し全体が失敗する経路もあります。ファイル削除例外もここでは捕捉されていません。
- **方針：** 永続化の成功後に、どのデータからも参照されない画像を回収する。state更新関数からファイル操作を外し、回収失敗をデータ更新失敗と切り離す。

### A3. バックアップ検証と起動時検証が不十分【再現】

**対象：** [backupService.ts:44](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:44)、[backupService.ts:111](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:111)、[AppDataContext.tsx:71](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:71)、[AppDataContext.tsx:155](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:155)

- **内容：** バックアップは数量が有限か、日付が文字列か等を見ていますが、数量の範囲、実在日、IDの一意性、状態と記録日の整合性を検証していません。起動時も全コレクションの構造検証にはなっていません。
- **再現：** 同じIDの食材2件、数量−5、期限 `2026-02-31` を持つバックアップを受理。重複IDに対して使い切りを実行すると2件ともusedになりました。買い物の保存値を配列ではないJSONオブジェクトにすると、読み込み成功扱いになりました。
- **現象：** 意図しない複数件更新、負数が正規化で1に変わる、日付の繰り上がり、買い物画面の `.filter` 呼び出しエラーが起こり得ます。JSONの構文破損を守る既存処理だけでは防げません。
- **方針：** 起動・復元の共通スキーマを設け、全件検証後だけ採用。ID重複、正規化不能な値、日付・状態の矛盾を理由付きで拒否し、元データを保持する。旧形式の移行と不正値の補正を区別する。

### A4. 合算で「足りる」と判定しても、調理記録は1在庫しか扱えない【コード経路と関数で確認】

**対象：** [recipeStock.ts:18](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/utils/recipeStock.ts:18)、[RecipeDetailScreen.tsx:55](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/RecipeDetailScreen.tsx:55)、[RecipeDetailScreen.tsx:66](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/RecipeDetailScreen.tsx:66)

- **内容：** 充足判定は `findMatchingFoods` で全在庫を集計。調理記録は `findMatchingFood` で最も期限が近い1件だけを抽出します。
- **再現：** 牛乳100ml＋200ml、必要量200mlで「300mlあるので足りる」。記録対象は100mlの在庫だけで、200mlの在庫は対象に入りません。
- **現象：** 同じ調理の100ml＋100mlを一度に記録できず、2件目の消費を記録し忘れると在庫が実物より多く残ります。単位の異なる在庫が先頭にある場合も、後ろの適切な在庫を選べません。
- **方針：** 充足判定と記録で同じ在庫集合を使う。期限順に割り当てた「在庫ID・単位・使用量」を確認でき、全件を一つの操作として更新する。推測による本→ml、パック→g変換は追加しない。

**秘密鍵・管理者キーがクライアントに含まれる事実は、今回確認した範囲では見つかりませんでした。** 公開用アプリIDの扱いはIに記載します。

## B. 優先度：高

友達への配布前に対応したい項目です。

| ID・対象 | 問題と起こり得る現象 | 改善方針 |
|---|---|---|
| B1 [notificationService.ts:104](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/notificationService.ts:104) | **再現。** 同じ食材の1件目の通知作成後、2件目で失敗すると、1件目のIDが保存されません。実予約1件／管理表0件になりました。削除・使い切り後も解除されない予約になり得ます。解除失敗を握りつぶして管理表を空にする74〜88行も同系統です。 | 作成直後からIDを追跡。OSの予約一覧と照合して食材ID単位で修復。解除できなかったIDを失わない。 |
| B2 [SettingsScreen.tsx:112](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/SettingsScreen.tsx:112)、[AppDataContext.tsx:198](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:198) | **コード確認。** 「通知を更新しました」は予約完了を待たずに表示。同期失敗はconsole警告だけです。権限を端末設定で許可し直した時やタイムゾーン変更時に、アプリ復帰だけで同期する処理もありません。 | 保存・予約同期・失敗を別状態で表示。完了を待って件数を取得。復帰時に必要な再同期を行う。 |
| B3 [AddFoodScreen.tsx:295](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/AddFoodScreen.tsx:295)、[ingredientNormalizer.ts:358](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/utils/ingredientNormalizer.ts:358) | **再現。** 編集した表示名は `name` に入りますが、画面表示は変更されない `productName` が優先。バーコード商品の名前を直しても元の名前が残ります。 | 商品名・表示名の役割を一本化、または表示名の上書きを明確に定義。登録・編集・学習・共有で同じ意味にそろえる。 |
| B4 [ingredientNormalizer.ts:231](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/utils/ingredientNormalizer.ts:231)、[ingredientNormalizer.ts:252](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/utils/ingredientNormalizer.ts:252) | **再現。** 部分一致とルール順により「焼きそば麺→そば」「米酢→米」「牛乳プリン→牛乳」。ごはんも米へ統合されます。厳密な材料照合の前に誤分類が入ると、別の食材がある扱いになります。 | 加工品・生／調理済みを区別し、具体的な語を優先。曖昧な商品は確認候補とする。商品名→分類→レシピ照合を通したテストを追加。 |
| B5 [productLookupService.ts:97](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/productLookupService.ts:97)、[AddFoodScreen.tsx:81](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/AddFoodScreen.tsx:81) | **再現。** Open Food Factsで取得した牛乳も保存場所を一律 `room` にします。登録画面は取得値を優先するため、共通の冷蔵候補より常温が優先されます。外部サービスによって登録候補が変わります。 | 取得できない保存場所を「取得済み」と扱わない。共通補助ルールと利用者の確認を使い、パッケージの保存方法を優先する。 |
| B6 [backupService.ts:149](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:149)、[backupService.ts:175](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:175)、[FoodImagePicker.tsx:26](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/components/FoodImagePicker.tsx:26) | **リスク。** 画像の寸法／合計容量の上限がなく、Base64を全件メモリー上に集めます。同じ写真が在庫と学習商品で重複することもあります。1MBの写真500枚ならBase64だけで約667MB。実機のクラッシュ限界は未測定です。 | 写真サイズを制御し、画像を重複排除。容量の事前表示・上限、段階処理を検討。大容量と空き容量不足で実機検証。 |
| B7 [backupService.ts:150](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:150)、[sampleData.ts:7](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/data/sampleData.ts:7) | **コード確認／端末間は未確認。** 埋め込むのはfile/content URIだけ。HTTP画像はURL参照のまま、組み込み画像も環境依存URIになり得ます。「全画像を含む、別端末でも必ず同じ表示」とは保証できません。 | 組み込み画像は安定したアセットID、利用者画像は実体として保存。外部画像が参照のままなら明記。iOS↔Androidで確認。 |
| B8 [RootNavigator.tsx:80](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/navigation/RootNavigator.tsx:80) | **コード確認。** 読み込み不能時の画面には再試行しかなく、正常なバックアップがあっても設定の復元画面へ進めません。永続的に壊れたデータは再試行で直りません。 | 読み込み失敗画面に、原本の退避・正常バックアップからの復元を用意。初期化を先に求めない。 |
| B9 [sampleData.ts:35](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/data/sampleData.ts:35)、[productLookupService.ts:33](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/productLookupService.ts:33) | **コード／画面確認。** 初回から実在庫と同じ領域へサンプル食材・買い物が入ります。固定の牛乳バーコードも共有／外部DBより先に返ります。この番号と実商品の対応は未確認です。 | デモを明示して実データから分離。本番検索で架空の対応表を優先しない。サンプルレシピは維持してよい。 |

公開共有APIを友達に使ってもらう場合は、Iの運用準備も配布前の条件です。

## C. 優先度：中

| ID・対象 | 問題・影響 | 方針 |
|---|---|---|
| C1 [HomeScreen.tsx:53](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/HomeScreen.tsx:53) | **画面確認。** 期限切れ3件があっても上部は0件・「期限が近い食材はありません」。優先して確認すべき状態が伝わりません。 | 期限切れを独立した件数／確認導線で最上部へ。食べられるという判定にはしない。 |
| C2 [productLookupService.ts:29](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/productLookupService.ts:29)、[BarcodeScreen.tsx:107](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/BarcodeScreen.tsx:107) | 共有4秒→Yahoo8秒→OFF8秒の直列検索で、全接続先が遅い場合は概ね20秒＋端末処理。途中から手入力へ切り替える操作がありません。学習データの読み込み失敗では後続検索が0回になることも再現しました。 | 全体の待ち時間予算と手入力への切り替えを設ける。学習データの障害を外部検索から隔離。未登録と通信失敗を維持して区別。 |
| C3 [learnedProductService.ts:40](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/learnedProductService.ts:40) | **同時呼び出しで再現。** 2商品のread→modify→writeが同じ旧カタログを読み、最後の1件だけ残ります。setItemの順序制御だけでは防げません。通常の1画面操作での発生頻度は未確認です。 | 読み込みから変更まで一つのキューに入れる。復元との競合も同じ窓口で処理。 |
| C4 [shoppingList.ts:9](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/utils/shoppingList.ts:9)、[ShoppingListScreen.tsx:76](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/ShoppingListScreen.tsx:76) | 「卵」と「たまご」は別項目。レシピと同じ表記揺れルールではありません。購入済み→在庫登録の関連IDもなく、何度でも同じ購入から登録できます。「よく買うもの」は在庫と購入済みを両方数え、一購入を二重に数え得ます。 | 表記揺れだけ共通化し、ブランド違いは勝手に統合しない。登録済みの表示と購入・在庫の関係を明確にする。 |
| C5 [RecipeDetailScreen.tsx:226](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/RecipeDetailScreen.tsx:226)、[types/index.ts:25](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/types/index.ts:25) | 部分使用は現在量の上書きだけで、いつ・どのレシピで・何量使ったかが残りません。部分使用の取り消しもありません。確認ダイアログ内の古い食材情報を使って全項目更新する経路もあります。二重減算の通常操作での発生は今回確認していません。 | 調理1回を操作ID付きで記録し、更新直前の在庫を確認。数量更新・期限変更・状態変更を別の操作に分ける。 |
| C6 [FoodImagePicker.tsx:11](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/components/FoodImagePicker.tsx:11)、[FoodCard.tsx:32](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/components/FoodCard.tsx:32) | ピッカー起動／権限API例外のcatch、画像表示のonError代替がありません。通信不能・画像消失時の案内が不足。実機での例外発生は未確認です。 | 写真なしで継続できる表示と再選択を用意。権限拒否、API例外、画像取得失敗を分ける。 |
| C7 [SettingsScreen.tsx:51](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/SettingsScreen.tsx:51) | **Webで確認。** 通知一覧APIが未対応で失敗しても「確認中…」のまま。バックアップもWeb未対応のFile APIを使っています。 | Webでは対応範囲を明示し、非対応操作を押せない／適切な案内へ。API失敗には終了状態を設ける。 |
| C8 [AppDataContext.tsx:181](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:181)、[RecipesScreen.tsx:110](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/RecipesScreen.tsx:110) | 何か1項目が変わるたび4コレクションを保存。単一Contextの全利用画面が更新されます。レシピ768行、詳細650行には計算・状態遷移・表示が混在。 | 変更領域だけ保存、Context分割／選択購読、共通の在庫判定・調理操作へ抽出。詳しくはH。 |

### C9. 在庫から商品を識別し直せず、編集内容を端末学習へ戻せない

**対象：** [types/index.ts:25](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/types/index.ts:25)、[BarcodeScreen.tsx:88](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/BarcodeScreen.tsx:88)、[AddFoodScreen.tsx:315](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/AddFoodScreen.tsx:315)

- **コード確認：** FoodItemにはbarcodeや商品参照IDがなく、バーコードは登録画面への引数と編集可能なメモにだけ渡ります。既存食材の編集では、端末の商品学習を更新する処理より先に戻ります。
- **影響：** 登録後に商品名や食材分類の誤りを修正しても、次のスキャンには以前の学習結果が出ます。在庫ごとの値と端末の商品候補を結び付けて訂正できません。
- **方針：** 在庫に任意のバーコード／商品参照を保持し、商品候補の訂正と今回の在庫だけの変更を区別する。商品情報のスナップショットを在庫に持つこと自体は問題ではなく、個人の期限・数量を共有DBへ送る必要もありません。

## D. 優先度：低

- **版番号の重複：** [backupService.ts:192](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:192)、SettingsScreen、package.json、app.jsonに個別記載。OFFのUser-Agentは1.8.0のままです。バージョン参照を共通化します。
- **バックアップのファイル名だけUTC：** [backupService.ts:200](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:200)。日本時間9月26日00:30でファイル名の日付が9月25日になることを再現。中の期限日・購入日がずれる問題ではありません。ファイル名もローカル日付へそろえます。
- **小さな重複や未使用import：** Fの候補は重大問題を直した後に整理。移行コードやWeb用ファイルを機械的に削除しないでください。

## E. 良くできている部分

1. **共有と私有データの境界が明確。** [sharedProductService.ts:50](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/sharedProductService.ts:50)で送る4項目を再構成し、[productContract.js:16](C:/Users/Kenka/Documents/ChatGPT/たべどき/shared/productContract.js:16)は余計なキーを拒否。SQLiteも商品項目と管理用メタデータだけです。数量・期限・保存場所・メモ・写真を自動送信する経路は確認されませんでした。
2. **共有は初期OFF、再試行と在庫追加が分離。** 既存商品の上書き禁止、非表示化、JANチェック、2KB制限、文字数・制御文字チェック、パラメーター化SQLも維持したい設計です。
3. **材料照合はingredientNameが基本。** ブランド牛乳→牛乳、卵の表記揺れ、期限順が既存テストで確認されています。検索タグから豚肉を牛肉扱いしない点も良好。改善すべきは、その前段の分類補助です。
4. **単位を勝手に推測していない。** 同単位の複数在庫は合算。kg↔g、L↔mlは明示変換。本・パックと重量／体積が混じり不足の確定ができない場合は要確認。小数誤差、不足量の切り上げ、水の除外、人数変更もテストがあります。
5. **ライフサイクルの基本は一貫。** ホーム・カレンダー・通知はactiveを対象にし、レシピはさらに期限切れを除外。使い切り・廃棄は確認後に状態と記録日を更新。取り消しはactiveへ戻り統計から除外されます。quantityを残すのは直前残量を復元する意味で理解できますが、部分使用履歴とは別です。
6. **通常の日付処理は良好。** 期限・購入日・使用日・廃棄日はローカル日付、作成日時はISO時刻として用途が分かれています。東京／ロサンゼルス／UTCで日付の往復と翌日差を確認。日跨ぎ・アプリ復帰の表示更新もあります。無効なインポート値と通知の再同期は別途改善が必要です。
7. **統計のゼロ除算・比較不能を考慮。** ロス率は「廃棄件数÷（使用済み件数＋廃棄件数）」で、量や金額の比率ではありません。ゼロ件は0%、前月記録なしは比較不能と表示。今月・先月の空画面も正常でした。
8. **読み込み失敗で即サンプルを上書きしない。** JSON構文破損や一時的読込失敗を保護し、保存失敗の再試行導線もあります。これをA1〜A3の失敗条件まで拡張するのが適切です。

9. **バックアップの形式・必須項目は確認している。** [backupService.ts:111](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/backupService.ts:111)では形式名とversion 1を確認し、必須コレクションや設定が欠ける場合は復元書き込み前に拒否します。旧データで省略され得る商品名・分類・単位・レシピ人数などは許容する設計です。ただし、任意の旧形式すべてに対応するわけではなく、A3の値の妥当性検証も別途必要です。

## F. 不要・重複コード候補

削除は行っていません。

| 候補 | 根拠・判断 |
|---|---|
| [FormField.tsx:3](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/components/FormField.tsx:3)のspacing、[AppDataContext.tsx:1](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/context/AppDataContext.tsx:1)のReact既定import、[AddRecipeScreen.tsx:6](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/screens/AddRecipeScreen.tsx:6)のAlert | TypeScriptの追加未使用チェックで検出した確実な候補。 |
| [yahooProductLookupService.ts:61](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/yahooProductLookupService.ts:61)のisYahooProductLookupConfigured | アプリ内参照を確認できませんでした。削除か接続状態表示に使うか判断。 |
| storageLabels | FoodCard、FoodDetail、AddFoodで同じ対応表。StorageSelectorにも同じラベルがあり、定数にまとめられます。 |
| AddRecipeのcreateLocalIdとutils/id.ts | ほぼ同じ日時＋乱数ID。共通化候補。 |
| StatisticsScreenの未購入同名判定 | shoppingList.tsのhasPendingShoppingItemと重複。表記揺れを改善する時に共通化。 |
| 照合・使用可能食材抽出・数量解析 | レシピ一覧、詳細、買い物候補、端末内提案で繰り返し実行。意図が違う部分まで同一化せず、共通の判定結果を再利用。 |

未使用の画面・コンポーネントを断定できる候補は見つかりませんでした。DatePickerField.web.tsxはMetroのWeb用分岐なので削除対象ではありません。旧サンプルJSONは移行で使われています。expo-font、react-dom、react-native-screens、react-native-webは直接importが少なくても設定・描画基盤で使われるため、未使用パッケージとは断定しません。

## G. UI・操作性の改善案

今回の画面は統一感があります。大きく描き直すより、行動の優先順位と読みやすさを整える方が効果的です。

| 画面・証拠 | 状態 | 観察と改善案 |
|---|---|---|
| [1. ホーム](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/01-home.png) | 要改善 | 期限切れ3件に対して上部が安心させる表示。期限切れを先頭で知らせ、今日・近日と分ける。統計・買い物のアイコンは意味が分かるラベルを検討。 |
| [2. 食材登録](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/02-add-food.png)、[下部](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/03-add-food-bottom.png) | 要改善 | 写真・分類・カテゴリが先にあり、期限・残量・保存が画面下。商品／分類の候補をコンパクトにし、期限・数量・単位を優先。写真・メモなどは後から編集できる配置へ。 |
| [3. バーコード](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/04-barcode.png)、[取得後フォーム](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/05-barcode-form.png) | 要改善 | 権限未許可の300pxパネルとサンプルボタンが手入力より目立ちます。許可しない場合も番号入力へすぐ移れる構成に。結果の商品名とフォームの商品名・表示名の重複も整理。 |
| [4. レシピ一覧](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/06-recipes.png) | 概ね良好 | 使える材料・買い足し・詳細ボタンが読み取りやすい。一覧の大きな写真は比較件数を減らします。件数が増えたらコンパクト表示を検討。 |
| [5. 詳細](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/07-recipe-detail.png)、[調理記録](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/08-cooking.png) | 要改善 | 必要量と在庫状態は明確。一方、調理記録まで長く、「全部使い切る」が自動選択と並列。各在庫の使用量／使用後残量を見せ、ロットごとに確認できる形にする。 |
| [6. カレンダー](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/09-calendar.png) | 概ね良好・視認性改善 | 選択日と下の一覧の関係は分かりやすい。月内の商品名は8pxで省略が強く、長い名前は識別困難。件数表示を中心にして詳細は下の一覧へ。3件以上は既に「+件数」で省略されます。 |
| [7. 買い物](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/10-shopping.png) | 概ね良好 | シンプルでチェック操作が明確。購入済み→食材登録が別段階と分かる説明もあります。登録済み表示、メモの編集、同義語の重複整理が次の改善点。 |
| [8. 統計](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/11-statistics.png) | 概ね良好 | 空状態・比較不能は説明済み。記録ゼロの0%は成果と誤読され得るため「まだ集計できません」を主表示にする案。件数ベースの割合であることを維持して明記。 |
| [9. 設定](C:/Users/Kenka/Documents/ChatGPT/たべどき/review/full-audit-2026-09-26/12-settings.png) | 要改善 | Webの「確認中…」が完了しない点は実確認。対応外・予約失敗・完了を表示し、設定保存と予約成功を区別。 |

### 読みやすさ・アクセシビリティ

- [theme.ts:2](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/constants/theme.ts:2)の主色と白は **3.25:1**、警告色と白は **2.30:1**、赤と白は **4.15:1**。主ボタンの16px文字、FoodCardの13px期限文字では、Webの通常文字4.5:1基準を下回ります。有効な操作・文字が対象で、無効ボタンを問題として数えていません。[W3Cのコントラスト基準](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [StorageSelector.tsx:23](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/components/StorageSelector.tsx:23)の選択状態、写真変更、カメラ許可などにはrole／状態の指定が不足。Webのアクセシビリティ情報でも一部が単なるテキストとして現れました。ボタン／ラジオと選択状態を伝える設計にします。
- 月内の商品名8px、タブラベル10px、調理記録の補足などを見直す。VoiceOver／TalkBack、大きい文字、実機のホームインジケーターとの重なりは未確認です。

### 登録の入力負担とタップ数

実測したデモ導線は「ホームのバーコード→サンプル→入力内容を確認して登録」の **保存直前まで3タップ**。保存を1回加えると4タップですが、保存は今回実行していません。カメラ権限・実商品の読み取り・OS日付選択のタップ数は未測定です。

カメラ権限取得済みの実商品は、設計上「バーコード入口→登録フォームへ→保存」の3回に、期限・数量の修正操作が加わります。バーコード取得後の手入力が0でも保存できるため、少ないタップ数だけを成功指標にはできません。

手入力画面は写真を含め10項目ありますが、必須の文字入力は名前、分類は自動候補が入り、数量・日付にも初期値があります。再登録は前の残量を引き継がず入力し直す点を維持し、期限と今回買った量だけに集中できるようにするのが適切です。

### 一連の利用体験

| 流れ | 確認結果・改善する継ぎ目 |
|---|---|
| 購入→バーコード→商品取得 | 画面到達とサンプル確認。実カメラ未確認。待ち時間、商品名修正、保存場所候補に改善点。 |
| 数量・期限→登録→ホーム | フォームとコードを確認。保存失敗の表示はあるが、写真削除・復元の整合性を先に修正。 |
| 期限通知→食材詳細 | 削除済みIDならホームへ戻るコードは良好。予約途中失敗と配信は別問題。実配信未確認。 |
| レシピ→調理→使用量→残量 | 既存の単一在庫減算テストは成功。複数ロットの記録対象漏れが最も大きな問題。 |
| 使い切り→統計 | 状態・日付から再計算する構造は良好。部分使用履歴は残らない。 |
| 次回購入→再登録 | 前の残量・メモ・写真を無条件コピーしない設計は維持。購入済みと登録済みを結ぶ情報が不足。 |

## H. パフォーマンス改善案

Windows／Node v24.19.0で、10分類の模擬食材、内蔵レシピ8件を使用。3回ウォームアップ後15回の中央値です。**純粋な計算の計測であり、スマホの描画時間・FPS・起動時間ではありません。** ホーム・カレンダー・統計は当該画面相当の抽出／並び替え、レシピ2列は実際のサービス関数です。

| 食材件数 | ホーム検索等 | カレンダー日別抽出 | 8レシピ照合・在庫判定 | 端末内レシピ候補生成 | 統計の抽出等 |
|---:|---:|---:|---:|---:|---:|
| 10 | 0.01ms | 0.01ms | 1.57ms | 1.53ms | 0.01ms未満 |
| 100 | 0.10ms | 0.06ms | 11.81ms | 12.02ms | 0.01ms未満 |
| 500 | 0.42ms | 0.19ms | 57.62ms | 59.02ms | 0.03ms |

1. **分類名の正規化と在庫検索をまとめる。** ingredientName・単位・期限の索引を一度作り、一覧・詳細・買い物・候補生成で使う。現在は照合のたび全食材へUnicode正規化・ロケール変換・並び替えを繰り返しています。
2. **隠れている候補を必要時に計算。** RecipesScreenは表示を畳んだ端末内候補もfoods変更で生成。必要な条件で遅延計算し、在庫判定結果の再利用を優先。
3. **保存と購読を分割。** 買い物1件の変更で全レシピ・全食材を再保存しない。通知は期限・表示名・状態・設定の変更だけで同期し、残量変更ごとの全予約やり直しを減らす。通知キューは古い待機要求を集約する。
4. **大量一覧を仮想化。** Home、Recipes、Shopping、StatisticsはScrollViewで全件を描画。500件では計算より画像・カード・スワイプ領域の実体数が問題になる可能性があります。SectionList／FlatList等の採用を実機計測に基づき判断。
5. **通知予約数に上限設計を置く。** 現在は食材数×通知日数の全件予約。500件×3日なら最大1,500件相当。OSが全件保持・配信することは未確認で、期限順の予約枠と再補充を検討する必要があります。

件数だけを理由に、直ちに個人データをサーバーやSQLiteへ全面移行する根拠はありません。画像込み復元と実機の描画を測り、必要な範囲から改善します。

## I. 公開前に不足しているもの

### テスト配布・ビルド

- [app.json](C:/Users/Kenka/Documents/ChatGPT/たべどき/app.json)にiOSのbundleIdentifier、Androidのpackageがなく、eas.jsonもありません。EASを使うなら配布プロファイル等を準備。EAS以外でも識別子・署名・配布手順は必要です。開発者アカウントの契約状況は確認していません。
- Expo Go／Webだけで合格にせず、配布形態のiOS・Androidビルドで、拒否→許可、バックグラウンド、通知タップによる起動、再起動、画像付き復元、容量不足を通す。現在の通知はローカル通知であり、これだけのためにプッシュ用サーバーを追加する必要はありません。[Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- インストール更新時の旧データ移行と、読めない場合の回復手順。CIで型チェック・既存テスト・失敗系テストを実行する仕組み。

### 商品共有の公開運用

- [shared-products.cjs:17](C:/Users/Kenka/Documents/ChatGPT/たべどき/server/shared-products.cjs:17)は匿名投稿の単一インスタンス用。HTTPS、永続ディスク、監視、SQLiteのバックアップ／復旧、投稿制限、訂正・通報対応の担当と手順が必要です。公開先未定なので、設置状況は未確認です。
- CORSは投稿者の認証ではありません。入力長やSQL対策はありますが、商品名が正しいか、誹謗中傷や個人の連絡先が書かれていないかは判定できません。追加フィールドからの私有データ漏れと、自由入力欄に個人情報を書いて共有する問題を区別します。
- レート制限は接続元IPの一時ハッシュ。プロキシ経由では同じIPに集まり、複数利用者が一緒に制限され得ます。再起動でカウンターは消え、複数台では共通化されません。前段の制限と信頼するプロキシの設計が必要です。
- クライアントの共有先URLは公開設定です。ローカルの127.0.0.1はスマホからPCを指しません。実機へ配布する前に到達可能なHTTPSの検証先を用意します。

### プライバシー・外部サービス

- アプリ内から読めるプライバシーポリシー、問い合わせ窓口、商品共有の説明、外部サービスの扱いが不足しています。AppleのApp Privacy、Google PlayのData safetyは、実際のアプリ・外部SDK・公開サーバーの取扱いを調べて記入します。今回、その申告内容が確定できたわけではありません。[Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)、[Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- 外部商品検索ではバーコードがYahoo／OFFへ、外部写真表示では画像取得先へ通信します。共有商品DBへ個人在庫を送らないことと、アプリが一切外部通信しないことは別です。ホスティングのアクセスログはコード外なので未確認です。
- [yahooProductLookupService.ts:32](C:/Users/Kenka/Documents/ChatGPT/たべどき/src/services/yahooProductLookupService.ts:32)は `EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID` を利用し、`.env.example`にも具体的なID値があります。アプリIDは公開される設計で、秘密鍵とは区別します。有効な実運用IDかは未確認。例示値をプレースホルダーへ変え、利用条件・制限・必要なら中継APIを検討します。`.env`という名前だけで秘密にはなりません。
- Yahoo／Open Food Factsの利用条件、表示義務、キャッシュ、画像利用条件は正式公開前に別途確認が必要。今回確認したコードは外部取得商品を自動で共有DBへ再投稿しないため、その境界は維持します。
- JSONバックアップは暗号化されておらず、メモ・写真・在庫を含みます。共有商品とは異なる個人データの書き出しなので、保存先を利用者が選ぶ説明が必要。暗号化を一律必須とは断定していません。

## J. 実装していない機能について

| 機能 | 判断 | 理由 |
|---|---|---|
| 家族・同居人との冷蔵庫共有 | **後回しでよい** | 複数端末の競合と権限が増えます。まず現在の保存・復元・在庫更新を安定させる。 |
| 生成AIレシピ | **後回しでよい** | 材料分類・分量・在庫記録の不整合がある段階では、提案の種類を増やしても信頼性が上がりません。 |
| 栄養情報 | **後回しでよい** | 商品・可食量・単位の精度と情報源が先。現在の目的を満たすための必須機能ではありません。 |
| アレルギー情報 | **後回しでよい** | 誤分類を含む現在の候補情報から安全性を判断できません。追加時は情報源と更新責任を別途設計する必要があります。 |

## 改善ロードマップ

| 段階 | 具体的な作業 | 完了の判定 |
|---|---|---|
| **Phase 1：データを守る** | A1復元の一括確定、A2画像削除の延期、A3共通検証、B8読み込み不能時の復旧導線。 | 各保存キーの失敗、途中終了、不正ID／日付／数量、写真保存失敗を与えても元データが保たれ、再起動後も一貫する。 |
| **Phase 2：登録と在庫計算をそろえる** | A4複数ロット記録、B3表示名、B4分類補助、B5保存場所、C3学習保存競合、C9商品候補の訂正。調理操作を現在の在庫に対して一括実行する。 | 牛乳100＋200mlから200ml使用で0＋100ml相当となる。先期限を優先、単位不明は確認、連打・再実行で二重反映しない。商品名修正が全画面と次回検索に反映される。 |
| **Phase 3：通知・バックアップ・実機を固める** | B1〜B2通知の追跡／修復／完了表示、B6〜B7画像バックアップ、C6〜C7エラー／Web分岐。 | 編集・削除・使い切り・廃棄・取り消し・復元・設定変更の後に、予定とOS予約が一致。iOS↔Androidの写真付き復元と失敗時復旧に成功する。 |
| **Phase 4：入力負担と表示速度を改善** | C1期限切れ表示、登録項目の優先配置、Gの文字・選択状態、C4買い物の重複と登録状態、Hの計算共有／保存分割／必要な一覧仮想化。 | 10／100／500件を実機で測り、主要操作で長い停止がない。初見利用者が期限・残量を確認して登録でき、期限切れを見落とさない。 |
| **Phase 5：配布・公開準備** | B9デモ分離、ビルド識別子・署名、共有API検証環境／運用、プライバシー・外部サービス条件、ストア素材と申告、F・Dの整理。 | 配布用ビルドで一連の購入→登録→通知→使用→統計→再登録を通し、障害時の連絡・バックアップ・復旧手順を実行できる。 |

最初の修正対象は **Phase 1のデータ保護** が適切です。このレビューでは実装に着手していません。
