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

`frontend/public`を単独ビルドするときは`cd frontend && pnpm run build:public`、Admin SPAは`pnpm run build:admin`を使う。ルートの`mise run build-public`は両フロント資産をまとめ、Public Workerへ含める。イベントIDをSSGする場合はビルド時に`PUBLIC_EVENT_IDS=1,2`のように指定する。これはルート`.dev.vars`ではなくビルド環境変数である。未指定時も詳細URLは静的シェルを返し、D1の実データをAPIから取得する。

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
- 本番相当のイベント詳細パスはAstroの静的ルート生成上、ビルド時に`PUBLIC_EVENT_IDS`を渡す運用ができる。IDを列挙しないビルドは共通詳細シェルを返す。
