# 開発手順

## ツールと依存関係

Go `1.27.1`、Node.js `26.7.0`、pnpm `11.5.1`、Wrangler `4.145.0`はルートの`mise.toml`で固定する。Go moduleとWorkerソースは`backend/`、Wrangler設定はrepository rootに置く。frontendの依存関係と`pnpm-lock.yaml`は`frontend/`に置き、`minimumReleaseAge: 10080`と`minimumReleaseAgeStrict: true`で公開から7日未満のnpm依存を拒否する。

```sh
mise install
mise exec -- pnpm --dir frontend install --frozen-lockfile
```

共通の開発・ビルド・テスト操作はルートの`mise.toml`に集約する。`mise tasks ls`でtask一覧を確認できる。

## Clerkローカル設定

ルートの`.dev.vars`を作成し、Clerk Development InstanceのSecret Keyを設定する。このファイルはGit管理外である。

```dotenv
CLERK_SECRET_KEY=sk_test_...
```

Publishable Keyはルートの`wrangler.public.jsonc`と`wrangler.admin.jsonc`の`vars.CLERK_PUBLISHABLE_KEY`に設定済みである。Clerk DashboardでGitHub、Google、メールOTPを有効にし、GitHubとGoogleの開発用OAuth連携を設定する。ローカルの許可OriginはWrangler設定の`http://localhost:8787`である。

## ローカルD1とWorker起動

```sh
mise run d1-local-init
mise run dev
```

`d1-local-init`は`backend/migrations/`のmigrationを適用し、定員1のローカル用イベントをseedする。`dev`はGo WasmとViteのfrontend資産をビルドし、WranglerがWorker wrapperをbundleする。Publicを主Worker、Adminをservice binding先として1つのWranglerプロセスで起動する。ブラウザーで`http://localhost:8787`を開いてClerk UIを試す。Clerkの実セッションがない状態では、申込・キャンセルAPIは401を返す。

```sh
curl http://localhost:8787/health
curl -i -X POST http://localhost:8787/registrations -H 'Content-Type: application/json' -d '{"ticket_type_id":1,"user_id":"ignored"}'
curl http://127.0.0.1:8787/admin/health
```

Public Workerが通常の入口であり、Admin WorkerはPublicのservice binding経由で到達する。PublicのAdmin状況APIも同じservice bindingを使う。ローカルD1を複数Wranglerプロセスから同時に開くと`SQLITE_BUSY`系エラーが起きる場合があるため、単一`mise run dev`を使う。

テスト用レコードを削除する場合はWranglerを停止後、次を実行する。これはローカルD1のみを対象とする。

```sh
mise run d1-local-cleanup
```

## テスト・ビルド・dry-run

```sh
mise run test
mise run build-public
mise run build-admin
mise run dry-public
mise run dry-admin
```

`mise run test`はGoの単体テストとVitestによるClerk JWT検証テストを実行する。テスト鍵は外部アカウントへ接続せず、期限切れ・許可Origin不一致・偽装ヘッダー置換も確認する。Build taskは`backend/cmd/{public,admin}`のGo Wasmと`workers-go`起動資産を生成する。Viteは画面資産を`backend/build/web`へ出力し、WranglerはWorker wrapperとClerk SDKをbundleする。画面資産はWasmへ含めない。

`test`は`test-go`と`test-frontend`をまとめる。`build-public`はbackend内の`generate-public-runtime`と`build-public-wasm`、frontendのVite buildを順に実行する。`build-admin`もruntime生成とWasm compileを分けている。`workers-assets-gen`は`backend/go.mod`のtool directiveで管理し、`go tool workers-assets-gen`で実行する。各`dry-*`は対応するbuildの後にfrontend packageのWrangler dry-run scriptを呼ぶ。miseの`dir`はGoコマンドを`backend/`、pnpmコマンドを`frontend/`で動かすために指定する。

## 構成上の注意

- GoとCloudflareの実装は`backend/`、ブラウザー画面とJavaScript依存は`frontend/`、開発コマンドは`mise.toml`で管理する。
- `backend/internal/auth`のJWT検証は公式`@clerk/backend`の`verifyToken()`を使い、WranglerがWorker bundleへ含める。Go実装の共通ロジックは`backend/internal/tickets`に置く。
- Clerk Secret Keyは`.dev.vars`またはCloudflare Worker Secretへ登録する。`vars`、ソース、lockfileへ保存しない。
- Admin権限を付ける公開APIはない。Cloudflareへ適用するときは運用者がD1へClerk User IDを直接登録する。
- D1の書き込み競合はSQLite triggerと単一INSERT/UPDATEで処理する。workers-goのD1 connectorは標準Go実行環境では動かないため、Cloudflare Binding連携と並行申込のローカル・リモート試験は別途扱う。
