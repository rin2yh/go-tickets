# Cloudflareデプロイ

## 現在のリソース

Workers Free上に`go-tickets-public`と`go-tickets-admin`をデプロイ済みである。両Workerは同じD1を参照する。

| リソース | 値 |
| --- | --- |
| D1名 | `go-tickets` |
| D1 ID | `5af5f125-7b2b-4f3e-8879-829a0f4e9369` |
| Public Worker | `go-tickets-public` |
| Admin Worker | `go-tickets-admin` |

`wrangler.public.jsonc`と`wrangler.admin.jsonc`を設定のsource of truthとする。既存の`trend-diary-db`や他のWorkerを変更せず、TerraformはPhase 2で導入する。

## D1マイグレーション

```sh
mise exec -- npx wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --remote
```

マイグレーションはスキーマのみを適用し、イベントや申込のseedデータは含めない。ローカル専用のseed/cleanupについては[開発手順](development.md#ローカルd1)を参照する。

## ビルドとデプロイ

デプロイにはCloudflare認証済みのWranglerが必要である。Workerごとに独立して実行する。

```sh
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npx wrangler deploy --config wrangler.public.jsonc
mise exec -- npx wrangler deploy --config wrangler.admin.jsonc
```

変更を反映する前に`npm run dry:public`と`npm run dry:admin`を実行し、バンドルサイズとBindingを確認する。

## 公開設定と認証

現行設定では両Workerの`workers_dev`と`preview_urls`を`false`にし、Cloudflare routeも設定していない。Workerコードはアップロード済みだが`No targets deployed`の状態で、一般から到達できるURLはない。未認証Admin APIの公開を避けるため、この設定を維持する。

現行コードにClerk認証・管理者認可・ログイン用フロントエンドはまだ存在しない。Clerk Development Instance、Publishable Key、Secret Key、OAuth/Email OTP設定、Workers Secretsの登録手順は未構成である。認証導入時はSecret KeyをWorker Secretsに設定し、リポジトリや通常のWrangler変数へ保存しないこと。認証と認可をCloudflare上で確認するまでは、`workers_dev`、Preview URL、routeを有効にしてはならない。

## デプロイ上の注意

- Workers Freeであることは利用者がCloudflare Dashboardで確認済みである。課金プランや有料機能への変更は行っていない。
- 両WorkerのD1 bindingは同じD1 IDを参照する。設定変更時に2ファイルのIDが一致することを確認する。
- 実データを削除するmigrationや試験データの投入を本番D1へ適用しない。
- 現状は認証がないため、アクセス経路を追加するだけでは安全な公開にならない。先に[アーキテクチャ上の認証状態](architecture.md#apiと現在の認証状態)と認証導入を確認する。
