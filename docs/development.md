# 開発手順

## ツールと依存関係

Go `1.27.1`、golangci-lint `2.14.0`、Node.js `26.7.0`、pnpm `11.5.1`、Wrangler `4.145.0`はルートの`mise.toml`で固定する。Go moduleとWorkerソースは`backend/`、Wrangler設定はrepository rootに置く。miseのGoタスクは`backend/tasks.toml`、pnpmタスクは`frontend/tasks.toml`に置き、ルート設定からincludeする。frontendの依存関係と`pnpm-lock.yaml`は`frontend/`に置き、`minimumReleaseAge: 10080`と`minimumReleaseAgeStrict: true`で公開から7日未満のnpm依存を拒否する。

```sh
mise install
mise exec -- pnpm --dir frontend install --frozen-lockfile
```

共通の開発・ビルド・テスト操作はルートの`mise.toml`に集約する。`mise tasks ls`でtask一覧を確認できる。

## Clerkローカル設定

ルートで`.dev.vars.example`をコピーして`.dev.vars`を作り、Clerk Development InstanceのSecret Keyを設定する。`.dev.vars`はGit管理外である。

```dotenv
CLERK_SECRET_KEY=sk_test_...
```

```sh
cp .dev.vars.example .dev.vars
```

Publishable Keyはルートの`wrangler.public.jsonc`と`wrangler.admin.jsonc`の`vars.CLERK_PUBLISHABLE_KEY`に設定済みである。Clerk DashboardでGitHub、Google、メールOTPを有効にし、GitHubとGoogleの開発用OAuth連携を設定する。ローカルの許可OriginはWrangler設定の`http://localhost:8787`である。

## ローカルD1とWorker起動

```sh
mise run d1-local-init
mise run dev
```

`d1-local-init`は`backend/migrations/`のmigrationを適用し、定員1のローカル用イベントをseedする。`dev`はGo WasmとViteのfrontend資産をビルドし、Public Workerを起動する。ブラウザーで`http://localhost:8787`を開いてClerk UIを試す。Clerkの実セッションがない状態では、申込・キャンセルAPIは401を返す。

Admin Workerは別ターミナルで起動する。ローカルでは`http://localhost:8788`から直接APIを試せる。

```sh
mise run dev-admin
```

```sh
curl http://localhost:8787/health
curl -i -X POST http://localhost:8787/registrations -H 'Content-Type: application/json' -d '{"ticket_type_id":1,"user_id":"ignored"}'
curl http://127.0.0.1:8788/health
curl -i http://127.0.0.1:8788/ticket-types/1/status
```

Public Workerは申込・キャンセルを扱い、Admin Workerは管理APIを扱う。PublicからAdminへのService Bindingは設定しない。両Workerを同時に起動した場合、ローカルD1への同時書き込みで`SQLITE_BUSY`系エラーが起きる場合がある。

テスト用レコードを削除する場合はWranglerを停止後、次を実行する。これはローカルD1のみを対象とする。

```sh
mise run d1-local-cleanup
```

## テスト・ビルド・dry-run

```sh
mise run lint-go
pnpm --dir frontend run lint
pnpm --dir frontend run typecheck
pnpm --dir frontend run format:check
mise run test
pnpm --dir frontend run build
mise run build-public
mise run build-admin
mise run dry-public
mise run dry-admin
```

`mise run lint-go`はgolangci-lintでGo packageを検査する。frontendの`lint`はOxlint、`typecheck`はTypeScript、`format:check`はOxfmtを実行する。React CompilerはViteのReact pluginとBabel presetを通じてTSXを最適化する。`mise run test`はGo単体テストを実行する。Clerk認証テストはテスト用RSA鍵とローカルJWKS endpointを使い、正常token、期限切れ、署名不正、許可Origin不一致、`azp`欠落を検証する。Clerkや外部ネットワークには接続しない。Build taskは`backend/cmd/{public,admin}`のGo Wasmと`workers-go`起動資産を生成する。Viteは画面資産を`backend/build/web`へ出力し、WranglerはWorker wrapperをbundleする。画面資産はWasmへ含めない。

`test`は`test-go`を実行する。`build-public`はbackend内の`generate-public-runtime`と`build-public-wasm`、frontendのVite buildを順に実行する。`build-admin`もruntime生成とWasm compileを分けている。`workers-assets-gen`は`backend/go.mod`のtool directiveで管理し、`go tool workers-assets-gen`で実行する。各`dry-*`は対応するbuildの後にfrontend packageのWrangler dry-run taskを呼ぶ。mise taskの`dir`はGoコマンドを`backend/`、pnpmコマンドを`frontend/`で動かすために指定する。

## 構成上の注意

- GoとCloudflareの実装・関連taskは`backend/`、ブラウザー画面・TypeScript依存・関連taskは`frontend/`で管理する。全体のツール固定とtask orchestrationはルートの`mise.toml`に置く。
- Clerk JWTの検証は`backend/internal/auth`のGo middlewareが行う。認証テストは`mise run test-go`で実行する。
- Clerk Secret Keyは`.dev.vars`またはCloudflare Worker Secretへ登録する。`vars`、ソース、lockfileへ保存しない。
- Admin権限を付ける公開APIはない。Cloudflareへ適用するときは運用者がD1へClerk User IDを直接登録する。
- D1の書き込み競合はSQLite triggerと単一INSERT/UPDATEで処理する。workers-goのD1 connectorは標準Go実行環境では動かないため、Cloudflare Binding連携と並行申込のローカル・リモート試験は別途扱う。
