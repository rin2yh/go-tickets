# デプロイ

## 配信構成

Public WorkerはGo APIと`backend/build/public-assets`内のAstroページを配信する。Worker wrapperがAPIを先に処理し、Publicの静的URLをStatic Assetsへ渡す。`/admin/*`と`/admin-api/*`はAdmin WorkerへのService Bindingで処理する。

Admin WorkerはGo API、D1 Binding、`backend/build/admin-assets`内のSPAを持ち、`workers_dev:false`、`preview_urls:false`、route未設定を維持する。Public WorkerだけがAdminへのService Binding (`ADMIN`) を持つ。Public `/admin/*`はAdmin SPAへ、`/admin-api/*`はAdmin APIへ転送する。Admin Go middlewareがAPI要求を認証・認可する。

## D1

既存の`go-tickets` databaseを利用する。Terraformは導入しない。

```sh
mise exec -- wrangler d1 migrations apply go-tickets --remote --config wrangler.public.jsonc
```

新しいmigrationがある場合だけ適用する。今回の画面/API追加ではスキーマ変更はない。デプロイ前に`PUBLIC_EVENTS_SOURCE=remote mise run dry`を実行する。Publicのビルドはremote D1から公開情報を取得するためWrangler認証が必要である。CIではlocal D1にmigrationとseedを適用してビルドする。

## Clerk設定とSecrets

`CLERK_PUBLISHABLE_KEY`と`CLERK_AUTHORIZED_PARTIES`は各Wrangler configの`vars`に置く。Clerk Secret Keyはリポジトリ、`vars`、コマンドラインへ含めず、各WorkerのSecretとして対話登録する。

```sh
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.public.jsonc
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.admin.jsonc
```

Clerk DashboardでGitHub、Google、メールOTPを有効にする。許可Originはブラウザーを開くPublic originに絞る。Admin APIのproxy requestではBearer tokenをそのまま転送し、Go側が署名、期限、issuer、authorized party、D1管理者権限を検証する。

## Build・Deploy

```sh
PUBLIC_EVENTS_SOURCE=remote mise run build
PUBLIC_EVENTS_SOURCE=remote mise run dry
mise exec -- wrangler deploy --config wrangler.admin.jsonc
mise exec -- wrangler deploy --config wrangler.public.jsonc
```

Cloudflare上でもAdmin Workerへ公開routeや`workers.dev` URLを追加しない。Admin Workerの公開入口はPublic WorkerのService Binding経由に限る。API要求は認証・管理者認可を通過したものだけがD1へ到達する。Public Workerの公開routeを有効にする場合、`CLERK_AUTHORIZED_PARTIES`をそのoriginへ合わせ、ログイン・ログアウト・一般ユーザー403・管理者成功を確認してから行う。

## 未完了の公開前確認

このPoCはCloudflare remote deployを行わない。既存のCloudflareリソースに対する設定差分はdry-runで確認し、実デプロイ前にWorkers画面でPublic/AdminのrouteとStatic Assets設定を照合する。Admin用の管理操作、申込一覧、チェックインのGo APIはまだない。
