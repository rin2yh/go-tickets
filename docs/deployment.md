# Cloudflareデプロイ

## 既存リソース

今回も既存のWorkers FreeアカウントとD1 `go-tickets`を使う。新しいCloudflare環境やD1を作らず、`trend-diary-db`と他Workerには触れない。設定はrepository rootの`wrangler.public.jsonc`と`wrangler.admin.jsonc`にある。

| リソース | 値 |
| --- | --- |
| D1名 | `go-tickets` |
| D1 ID | `5af5f125-7b2b-4f3e-8879-829a0f4e9369` |
| Public Worker | `go-tickets-public` |
| Admin Worker | `go-tickets-admin` |

## Clerk設定とSecrets

Clerk Development InstanceでGitHub、Google、メールOTPを有効にする。GitHub・Googleの開発OAuth設定はClerkの標準接続を使う。アカウント連携とセッション運用をClerkへ委譲する。

`CLERK_PUBLISHABLE_KEY`は両WorkerのWrangler `vars`に設定済みである。Clerk Secret Keyはルートの`.dev.vars`（ローカル）とCloudflare Worker Secrets（リモート）にだけ登録する。リポジトリへ記載しない。Cloudflareでは両Workerの`CLERK_SECRET_KEY` Secret名が登録済みであるが、値そのものは表示・検証していない。

```sh
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.public.jsonc
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.admin.jsonc
```

各コマンドは対話入力を使い、Secret Keyをシェル引数やログへ出さない。Clerk Session tokenの`azp`と一致する許可Originを、両Workerの`CLERK_AUTHORIZED_PARTIES`へ設定する。Wrangler設定の初期値`http://localhost:8787`はローカル専用であり、本番Originへ置き換えてから認証を確認する。

ClerkのBearer tokenはTLS経由のAuthorization headerでWorkerへ送る。Clerk標準セッションとFrontend SDKがtoken lifecycleを管理し、アプリ独自のcookie/sessionを作らない。詳細は[認証設計](architecture.md#認証認可)を参照する。

## D1マイグレーション

`0002_administrators.sql`で管理者一覧を追加済みである。既存の`0001`を再作成しない。新規環境では次を実行する。

```sh
mise exec -- wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --remote
```

## ビルドとデプロイ

ビルド・dry-runはルートのmise taskを使う。

```sh
mise run dry-public
mise run dry-admin
```

認証対応版は既存Public/Admin Workerへデプロイ済みである。両方とも`No targets deployed`となり、route、workers.dev URL、preview URLは存在しない。現在のソースを再デプロイする場合は次を個別に実行する。

```sh
mise exec -- wrangler deploy --config wrangler.admin.jsonc
mise exec -- wrangler deploy --config wrangler.public.jsonc
```

## 公開範囲

Adminは`workers_dev:false`、`preview_urls:false`、route未設定のままにする。Public設定にもrouteはない。PublicからAdminへのService Bindingのみを構成しているため、Admin APIに外部URLを持たせない。Clerk token検証と管理者D1照会をCloudflare上で確認できるまでは公開routeや`workers_dev`を有効にしない。

公開前に、Cloudflare上で正常・期限切れ・不正token、一般ユーザー403、D1管理者成功、Public経由Admin要求、申込競合を確認する。その後Publicの公開Originだけを有効化し、`CLERK_AUTHORIZED_PARTIES`をそのOriginに固定する。公開OriginはClerk Dashboardのprovider設定、実ログイン、認証済みWorker requestが未確認のため有効化していない。Secret名の存在だけではSecret値の正しさを保証しない。

## 管理者登録

公開昇格APIはない。Clerkログイン後に確認したUser IDを運用者が指定し、D1へ登録する。

```sh
CLERK_USER_ID=user_... mise run admin-add
```

登録操作はCloudflare上の`go-tickets` D1だけに行う。テスト用IDの追加後は明示的なDELETEで削除する。

## デプロイ時の注意

- Workers Freeの範囲内で実施し、有料機能へ変更しない。
- Workersの`workers_dev`を有効にする前に、必ず認証済みのCloudflare試験を終える。
- Admin Workerにroute、Preview URL、workers.dev URLを作成しない。
- `backend/scripts/seed-local.sql`と`cleanup-local.sql`はローカルD1専用で、Remoteへ適用しない。
- Phase 2でTerraformを導入するときは、既存のD1とWorkerをimportし、新規作成しない。
