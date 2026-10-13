# 友達向けWebテスト版

[READMEへ戻る](../README.md) · [Phase 5](phase5-publication.md)

Apple Developer Programに未登録でも、Safariで開けるテスト版を渡せます。今回のアクセス範囲は「URLを知っている人なら開ける」です。ログイン制限は付けません。在庫は各ブラウザーに保存され、他の利用者の在庫は共有されません。

## Cloudflareの一時URLで共有する（今回の配布先）

Cloudflare Quick Tunnelを使い、アカウント登録なしでHTTPSの一時URLを発行します。Web版の書き出しと専用の静的サーバーを使います。Expoの開発サーバーをそのまま公開する構成ではありません。

```powershell
node scripts/export-web-test.cjs
# 書き出し結果に表示されたフォルダーを指定する
node scripts/serve-web-test.cjs dist-web-test/site-… 8103
```

別のターミナルで、[Cloudflare公式のcloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)を使って接続します。

```powershell
cloudflared tunnel --url http://127.0.0.1:8103 --protocol http2
```

表示された `https://….trycloudflare.com` を友達へ渡してください。PC・サーバー・cloudflaredを動かしている間だけ利用できます。PCの電源やスリープ設定は自動で変更していません。

再接続でURLのホスト名が変わると、ブラウザーの保存領域も変わります。在庫は自動で移りません。必要なデータは旧URLが使える間にバックアップを書き出し、新しいURLで復元してください。URLを変えずに内容だけ更新する場合も、まずバックアップを保存してください。

配信サーバーは書き出したフォルダー内のファイルだけを配信し、隠しファイルやフォルダー外のパス、書き込み要求を受け付けません。Expoの同梱アセットに含まれる `.pnpm` 配下のフォントは配信します。在庫・写真の保存先は各ブラウザーで、共有DBのサーバーや個人のバックアップを公開する仕組みではありません。

### 公開する連絡先と説明ページ

書き出しには `test-guide.html` と `data-handling.html` を同梱します。後者はアプリと同じデータの取り扱い説明で、正式プライバシーポリシーとは別です。案内ページの商品検索説明は `--yahoo` の有無に合わせます。

連絡先と正式ポリシーを用意した後は、[公開前チェックリスト](publication-checklist.md) に従って `publication.local.json` を作成し、次のように指定します。

```powershell
node scripts/check-publication.cjs publication.local.json
node scripts/export-web-test.cjs --yahoo --publication-config publication.local.json
```

公開設定は運営者名・問い合わせメール・HTTPSの正式ポリシーURLの3項目だけです。指定がなければ準備中と表示します。ローカル `.env` を書き出し時に読み込むことはなく、API認証情報や共有API設定をこのJSONから反映することもありません。

2026-10-03に `dist-web-test/site-ZOtBGm` を書き出し、ローカル設定が含まれないこと、HTTPS URLでのホーム・案内ページの往復、レシピ画像8枚とアイコン用フォントの配信を確認しました。配信の境界・書き込み拒否・隠しファイル拒否・フォント配信の自動テスト、型チェック、Web exportも合格しました。実際のiPhone Safariでの確認は残ります。一時URLとプロセスの情報は作業用の `.review/web-share-state.json` に記録し、Gitには含めません。このPCの現在の共有は `.review/stop-web-share.ps1` で専用プロセスだけ停止できます。

## GitHub Pagesで公開する（継続公開する場合）

既存の公開リポジトリ `arukuArupaka/Torikawa` を使います。公開先は `https://arukuArupaka.github.io/Torikawa/`、案内ページは同じURLの `test-guide.html` です。初回設定と公開処理が完了するまではアクセスできません。

1. リポジトリの管理権限を持つアカウントで [Settings → Pages](https://github.com/arukuArupaka/Torikawa/settings/pages) を開く。
2. **Build and deployment → Source** を **GitHub Actions** にする。リポジトリの公開範囲やメンバーの権限は変更しない。
3. [Actions → Publish web test](https://github.com/arukuArupaka/Torikawa/actions/workflows/web-test-pages.yml) の **Run workflow** から `main` を選んで実行する。
4. テスト・型チェック・Web export・deployがすべて成功し、公開URLでホームと案内ページが開くことを確認してから友達へ渡す。

`.github/workflows/web-test-pages.yml` は手動実行だけにしています。通常のpushでは公開版を置き換えません。更新時は変更をpushした後、同じ **Run workflow** を実行します。在庫は同じサイト・ブラウザーの保存領域に残り、PCを起動し続ける必要はありません。

GitHub Actionsはロックファイルで依存関係を導入し、テストと型チェックを通してから配布用ファイルだけをアップロードします。GitHub Pagesでは共有商品APIのサーバーは実行できません。

手元で同じ構成を書き出す場合：

```powershell
node scripts/export-web-test.cjs --github-pages
```

`/Torikawa` を画像・JavaScript・案内リンクの先頭に付けます。別のリポジトリなら `--base-path /repository-name` を指定してください。配布用フォルダーには `.nojekyll` と `404.html` が入り、HTMLの `noindex` を設定します。これらはログイン制限ではなく、URLを知る人は開けます。

初回設定にはリポジトリの管理権限が必要です。push権限だけのアカウントで設定画面が404になる場合は、所有者に上記1〜2を行ってもらいます。

## Netlify向けの配布用ファイルを作る（別の方法）

```powershell
node scripts/export-web-test.cjs
```

成功すると `dist-web-test/site-…` に新しい配布用フォルダーができます。`index.html`、`_expo`、アセット、`test-guide.html`、Netlify用の設定を含みます。フォルダー名は実行ごとに変わり、古い配布ファイルを混ぜません。`npm.cmd run web:test:export` でも同じ処理です。

このコマンドは `.env` を読み込まず、親プロセスの `EXPO_PUBLIC_` 設定も引き継ぎません。Yahoo Client ID、共有DBのローカルURL、デモ設定を配布ファイルへ入れず、手元の `.env` は変更しません。商品検索は端末候補とOFFを使います。連絡先・正式ポリシーは未設定として表示します。

Yahooの商品名検索を有効にする場合は、[専用の設定手順](yahoo-name-search.md)に従い、サーバーにだけIDを設定して `--yahoo` 付きで書き出し・サーバー起動を行います。Yahooの商品画像は利用しません。静的ホスティングだけでは検索APIを実行できません。

個人の在庫、SQLite DB、バックアップ、`.env`、`review/` は配布用フォルダーへコピーしません。アプリのコード・同梱画像と文章・OSS通知は含みます。素材や外部サービスの利用条件の確認状況は [Phase 5](phase5-publication.md) を参照してください。

## Netlifyへ配置する（別の方法）

登録なしの一時公開もありますが、CLIの匿名公開は1時間以内にアカウントへ引き取らないと削除されます。継続利用にはアカウントへ引き取ってください。

1. [Netlify](https://app.netlify.com/)のアカウントを確認し、必要なら登録する。プランの料金と上限を画面で確認する。
2. ログインした状態で [Netlify Drop](https://app.netlify.com/drop) を開く。
3. 書き出した `dist-web-test/site-…` フォルダーだけをアップロードする。リポジトリ全体は渡さない。
4. 発行されたHTTPS URLをSafariで開き、ホームのテスト表示・空の初期在庫・写真付き登録の再表示を確認する。
5. 友達へURLと `/test-guide.html` の案内を渡す。

`_headers` と `robots.txt` は検索エンジンへ掲載しないよう指定しますが、認証や秘密のURLを保証する仕組みではありません。URLを転送した人も開けます。HTTPSを使い、カメラ・写真・Safariのファイル保存は実機で確認してください。

## 更新するとき

再度書き出し、同じNetlifyサイトのDeploysから更新フォルダーをアップロードします。URLのホスト名を維持してください。新しいサイトや異なるブラウザーでは保存領域が別になり、在庫は自動で移りません。Git連携による自動公開は設定していません。

## 確認する範囲

- 食材・買い物・レシピ・期限表示・写真の登録、再読み込み後の保持。
- バックアップ保存・復元、保存失敗時の案内。
- テスト用データでの一括削除、キャンセル、再起動後の空データ。
- Safariの文字拡大、画面の狭さ、VoiceOver。

期限通知、iPhoneアプリ固有の権限や保存領域の削除は、このWebテストでは確認できません。共有商品APIは別サービスなので、この静的サイトの配置だけでは動きません。

公式手順：[Expo SDK 57のbaseUrl](https://docs.expo.dev/versions/v57.0.0/config/app/#baseurl) · [GitHub Pagesのワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) · [Netlifyの手動アップロード](https://docs.netlify.com/deploy/create-deploys/)

## 2026-10-01の準備・確認

最初のNetlify向け配布用フォルダーは `dist-web-test/site-nUqpS4`。48ファイルで、個人の在庫・DB・バックアップを含まず、手元の共有API接続先がJSに含まれないことを確認しました。

GitHub Pages向けは `dist-web-test/site-GidzY3`。自動テスト195件、型チェック、Web exportが合格し、`/Torikawa/` 配下でホーム・案内ページへの移動と戻る操作、内蔵レシピ8枚の画像表示を確認しました。現在の認証ではpush権限だけがあり、Pagesの初回設定と実際の公開URLでの確認は残ります。

自動テスト195件、型チェック、Web exportが合格。選んだ写真を一時的なblob URLのまま保存せず、画像の内容を保存するよう修正しました。不正な画像や読み取り失敗時は元の写真を保持します。

別のローカルoriginを390×844のブラウザー表示で開き、空の初回起動、テスト表示、写真付き食材の登録、ページの再読み込み後の食材・写真の保持、案内ページへの移動と戻る操作を確認しました。画像は同梱のテスト用ファイルを使い、実際の利用者の保存領域は変更していません。確認画面は `.review/web-friend-photo-persistence.png`。実際のiPhone Safari・HTTPSの配布先での確認は残ります。
