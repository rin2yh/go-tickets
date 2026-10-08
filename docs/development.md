# 開発手順

## ツールと依存関係

Go、golangci-lint、Node.js、pnpm、Wranglerはルートの`mise.toml`で固定する。pnpm workspaceは`frontend/`内で閉じ、`frontend/public`と`frontend/admin`の依存とビルドを別々に管理する。`minimumReleaseAge: 10080`により公開後7日未満のnpm依存を避ける。

```sh
mise install
cd frontend
pnpm install --frozen-lockfile
cd ..
```

## Clerkローカル設定

リポジトリルートで開発変数ファイルを作成し、Clerk Development InstanceのSecret Keyを記入する。

```sh
cp .dev.vars.example .dev.vars
```

`.dev.vars`はGit管理外である。Publishable Keyは`wrangler.public.jsonc`と`wrangler.admin.jsonc`の`vars.CLERK_PUBLISHABLE_KEY`に設定済みである。Clerk DashboardでGitHub、Google、メールOTPを有効にし、OAuth開発設定を行う。認証済みセッションの`azp`と一致するOriginをWrangler設定の`CLERK_AUTHORIZED_PARTIES`に指定する。ローカル値は`http://localhost:8787`である。

## D1とWorkerの起動

```sh
mise run d1-local-init
mise run dev
```

`dev`はGo Wasm、Astro、Admin SPAをビルドし、Public Workerを8787、Admin Workerを8788で起動する。PublicからAdminへのService Bindingは、ローカルで同じWorker名のWrangler dev sessionが起動している場合に接続される。画面URLは`http://localhost:8787/`、`/tickets`、`/admin`である。

`mise run build-public`はビルド前にWrangler経由でD1から公開イベント名とチケット種別を取得する。ローカルはlocal D1を読み、`PUBLIC_D1_PERSIST`で保存先を変えられる。リモートのD1からビルドする場合は`PUBLIC_EVENTS_SOURCE=remote mise run build-public`を使う。remoteモードにはWranglerのCloudflare認証が必要である。ビルド成果物にはイベント情報がHTMLとして含まれ、イベントが0件なら空の一覧を生成する。詳細ページも実在するD1イベントだけ生成し、不明なIDは404となる。残席数は閲覧時にGo APIから取得する。

イベントを追加・変更した後は、内容を確認してPublic Workerを再ビルド・再デプロイする。D1更新だけでは生成済みHTMLは変わらない。CIとローカルのseedイベントを使ってSSG HTMLを検証するには`mise run d1-local-init`の後に`mise run verify-public-ssg`を実行する。

## 手動確認

```sh
curl http://localhost:8787/health
curl http://localhost:8787/api/events
curl http://localhost:8787/api/events/1
curl -i http://localhost:8787/registrations
curl http://localhost:8787/admin
curl -i http://localhost:8787/admin-api/ticket-types/1/status
curl -i http://localhost:8788/ticket-types/1/status
```

健康確認と公開イベントGETは未認証で利用できる。本人の申込一覧、申込、キャンセルはClerk tokenを必要とする。Admin APIはService Binding経由でも認証とD1管理者照会を行う。一般ユーザーの応答は403、未認証は401となる。

`mise run d1-local-cleanup`はローカルのテスト申込・イベントを削除する。これはローカルD1限定である。

## Playwright E2E

E2Eは参加者の申込成功フローをChromiumで実行する。実際のGo Wasm API、ローカルD1、Clerk Development Instanceを使う。Remote D1は使用しない。初回は通常のfrontend依存を入れ、PlaywrightのChromiumをインストールする。

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm --filter @go-tickets/e2e exec playwright install chromium
```

Clerk DashboardでDevelopment Instanceを用意し、テスト用ユーザーを作成する。`CLERK_SECRET_KEY`と対応する`CLERK_PUBLISHABLE_KEY`をシェル環境またはルートの`.dev.vars`に設定し、`E2E_CLERK_USER_EMAIL`にそのユーザーのメールアドレスをシェル環境で設定する。テスト実行にClerkのSecret Keyが必要なので、値はGit管理ファイルやコマンド引数に書かない。`.dev.vars`はPlaywright設定とWorkerが読み込む。メール+パスワード認証を有効にし、テストユーザーは`+clerk_test`形式のメールアドレスにするとClerkからメールが送信されない。`CLERK_AUTHORIZED_PARTIES`は`http://localhost:8787`にする。ClerkのテストトークンはPlaywrightのsetup projectで`clerkSetup()`を実行して取得し、テストでは公式の`clerk.signIn()`で実セッションを作る。

どちらの方法でも、実行のたびに`.wrangler/e2e`だけを削除してローカルD1を初期化し、その同じD1からAstroのSSGを生成してPublic/Admin Workerを起動する。既存サーバーは再利用せず、Publicの8787番ポートが使用中ならD1初期化前に失敗する。

```sh
cd frontend
pnpm --filter @go-tickets/e2e test

# またはリポジトリルートから
mise run test-e2e
```

Playwrightの失敗traceとレポートは`frontend/e2e/test-results`および`frontend/e2e/playwright-report`に出力され、Git管理対象外である。E2Eは通常の`mise run test`とCIには含めていない。

## チェック

```sh
mise run test
mise run lint-go
cd frontend
pnpm run lint
pnpm run typecheck
pnpm run format:check
```

`astro-check`はPublicのAstro/TypeScript、`tsc`はAdmin SPAを検査する。TanStack Routerの`src/routeTree.gen.ts`はVite pluginが生成するファイルである。React CompilerはAstro React integrationとViteのReact Compiler設定でTSXを変換する。

## 既知の問題

- Clerk Secret KeyがないとGo Worker middlewareが起動できない。`.dev.vars`を設定してからWranglerを起動する。
- ローカルService Bindingを使うにはAdmin WorkerのWrangler dev sessionも起動する必要がある。Publicだけを起動したとき`/admin-api/*`は502になる。
- Astroの単独`pnpm run build:public`はD1データ取得を行わない。SSGデータを取得してからAstroを実行するルートの`mise run build-public-assets`または`mise run build-public`を使う。
