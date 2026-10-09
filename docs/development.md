# 開発手順

## ツールと依存関係

Go、golangci-lint、Node.js、pnpm、Wranglerはルートの`mise.toml`で固定する。pnpm workspaceは`frontend/`内で閉じ、`frontend/public`、`frontend/admin`、`frontend/e2e`の依存を管理する。`minimumReleaseAge: 10080`により公開後7日未満のnpm依存を避ける。miseはローカル開発専用で、CIはツールを直接実行する。

```sh
mise run init
```

`init`はツールと依存関係をインストールし、`.dev.vars`がなければサンプルから作成する。通常のローカルD1へmigrationとテストイベントを追加し、PlaywrightのChromiumもインストールする。既存の`.dev.vars`とD1データは上書き・削除しない。ローカル管理者にするClerkユーザーIDを尋ねるので、空欄なら登録を省略する。再実行時も管理者登録は重複しない。

## Clerkローカル設定

`.dev.vars`にClerk Development InstanceのSecret Keyを設定する。初回の`mise run init`でファイルが作成される。

`.dev.vars`はGit管理外である。Publishable Keyは`wrangler.public.jsonc`と`wrangler.admin.jsonc`の`vars.CLERK_PUBLISHABLE_KEY`に設定済みである。Clerk DashboardでGitHub、Google、メールOTPを有効にし、OAuth開発設定を行う。認証済みセッションの`azp`と一致するOriginをWrangler設定の`CLERK_AUTHORIZED_PARTIES`に指定する。Publicは`http://localhost:8787`、Adminは`http://localhost:8788`である。

## D1とWorkerの起動

```sh
mise run dev
```

`dev`はGo Wasm、Astro、Admin SPAをビルドし、Public Workerを8787、Admin Workerを8788で起動する。画面URLはPublicが`http://localhost:8787/`と`/tickets`、Adminが`http://localhost:8788/`である。

Publicのイベント一覧と詳細は、表示時に同じWorkerのGo APIからD1を取得する。イベント作成・変更は次のページ表示からPublicにも反映される。PublicのビルドでD1やCloudflare認証は必要ない。未知のイベントIDはAPIが404を返し、画面にイベントが見つからない旨を表示する。

イベントの内容はページ表示時に取得するため、Adminからイベントを作成・変更した後の再ビルド・再デプロイは不要である。CIのPublicビルドもD1データに依存しない。

## 手動確認

```sh
curl http://localhost:8787/health
curl http://localhost:8787/api/events
curl http://localhost:8787/api/events/1
curl -i http://localhost:8787/api/registrations
curl http://localhost:8788/
curl -i http://localhost:8788/api/ticket-types/1/status
```

健康確認と公開イベントGETは未認証で利用できる。本人の申込一覧、申込、キャンセルはClerk tokenを必要とする。Admin APIは直接リクエストでも認証とD1管理者照会を行う。一般ユーザーの応答は403、未認証は401となる。

`mise run init`は通常のローカルD1を削除しない。テストデータのリセットが必要な場合は、`.wrangler/state`を自分で確認してから手動で操作する。

## Playwright E2E

E2Eは参加者の申込成功フローをChromiumで実行する。実際のGo Wasm API、専用ローカルD1、Clerk Development Instanceを使う。Remote D1は使用しない。`mise run init`で依存とChromiumを準備する。

Clerk DashboardでDevelopment Instanceを用意する。`CLERK_SECRET_KEY`をルートの`.dev.vars`またはシェル環境に設定する。Playwright設定は`CLERK_PUBLISHABLE_KEY`を`wrangler.public.jsonc`から読み込む。Secret KeyはGit管理ファイルやコマンド引数へ書かない。`.dev.vars`はPlaywright設定とWorkerが読み込む。Publicの`CLERK_AUTHORIZED_PARTIES`は`http://localhost:8787`、Adminは`http://localhost:8788`にする。Playwrightのsetup projectは公式の`clerkSetup()`を実行し、専用のテストユーザーをClerk Backend APIで用意する。フローでは`clerk.signIn()`を使って実セッションを作る。

`mise run e2e`は実行のたびに専用の`.wrangler/e2e`だけを作り直してD1を初期化し、そのD1からAstroのSSGを生成してPublic Workerを起動する。通常開発用の`.wrangler/state`は使わない。既存サーバーは再利用せず、8787または8788番ポートが使用中ならD1初期化前に失敗する。

```sh
cd frontend
pnpm --filter @go-tickets/e2e test

# またはリポジトリルートから
mise run e2e
```

Playwrightの失敗traceとレポートは`frontend/e2e/test-results`および`frontend/e2e/playwright-report`に出力され、Git管理対象外である。GitHub Actionsでは`CLERK_SECRET_KEY` repository secretを使ってE2Eを実行し、forkからのpull requestではsecretを利用できないためE2E jobをskipする。E2Eは`mise run test`には含めない。

## チェック

```sh
mise run test
mise run check
```

`astro-check`はPublicのAstro/TypeScript、`tsc`はAdmin SPAを検査する。TanStack Routerの`src/routeTree.gen.ts`はVite pluginが生成するファイルである。React CompilerはAstro React integrationとViteのReact Compiler設定でTSXを変換する。

## 既知の問題

- Clerk Secret KeyがないとGo Worker middlewareが起動できない。`.dev.vars`を設定してからWranglerを起動する。
- Admin画面とAPIはAdmin Workerの`http://localhost:8788`から直接利用する。Public WorkerではAdminのパスを提供しない。
- PublicのAstroビルドはD1データ取得を行わない。イベント情報はブラウザからGo APIへ問い合わせる。
## Git hooks

`mise run init` はこの clone の `core.hooksPath` を `.githooks` に設定し、リポジトリの hooks を有効にします。

コミット前に lint と format を確認し、コミット後に Go と frontend の unit test を実行します。
push 前には CI 相当のチェック一式を実行します。post-commit の test が失敗してもコミットは
作成済みです。問題を直してから再度コミットしてください。

push 前のチェックでは E2E test も実行します。先にルートの `.dev.vars` に
`CLERK_SECRET_KEY` を設定してください。E2E 専用のローカル D1 は `.wrangler/e2e` に用意します。
