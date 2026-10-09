# デプロイと運用

## デプロイ

Public/Admin WorkerはCloudflare Workers BuildsのGit連携でデプロイする。Cloudflare側では2つのWorkerプロジェクトを設定し、どちらもリポジトリルートを使う。ビルドコマンドは`mise run build`、デプロイコマンドはそれぞれ`mise exec -- wrangler deploy --config wrangler.public.jsonc`または`mise exec -- wrangler deploy --config wrangler.admin.jsonc`とする。ビルド環境にはmiseの導入が必要。リポジトリ内のWrangler設定はWorker名、entry point、Static Assets、D1 bindingを定義するが、Workers BuildsのGit連携設定は含まない。

両Workerは同じ既存の`go-tickets` D1 databaseを参照する。新しいmigrationがある場合は、Git連携デプロイの前に一度適用する。

`0003_event_details_and_registration_periods.sql`は既存イベント・チケット種別・申込をコピーしてテーブルを再構築する。イベント名、定員、確定数、申込状態は維持され、既存イベントは日時未設定の`draft`として移行される。旧テーブルに作成日時がないため、移行された行の`created_at`と`updated_at`は移行時刻になる。リモート適用前に対象イベントを確認し、公開する行は適用後に管理画面から日時・説明・チケット受付期間を入力して公開する。

```sh
mise exec -- wrangler d1 migrations apply go-tickets --remote --config wrangler.public.jsonc
```

Workers Buildsの接続・ビルド設定はCloudflare側で行う。このリポジトリから設定済みかどうかは確認できないため、設定後に各Workerのデプロイを確認する。

## Clerk

`CLERK_PUBLISHABLE_KEY`と`CLERK_AUTHORIZED_PARTIES`は各Wrangler設定の`vars`で管理する。各WorkerのoriginをClerk Dashboardのauthorized partiesに登録し、Admin originは`wrangler.admin.jsonc`にも反映する。Clerk Dashboardで必要な認証providerを有効にする。

Secret Keyは各WorkerのSecretとして登録する。リポジトリ、`vars`、コマンド引数には置かない。

```sh
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.public.jsonc
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.admin.jsonc
```

Admin APIはAdmin Workerのoriginでのみ提供し、API middlewareがClerk認証後にD1の`administrators`登録を確認する。管理者の追加は`administrators` tableへClerk user IDを登録する。Public WorkerからAdmin WorkerへのService Bindingはない。

## 運用上の制約

Publicのイベント表示は実行時にD1を読むため、イベント内容の変更にPublicの再ビルドは不要。Adminではイベント名とチケット種別を編集できる。申込一覧とチェックインは画面のみで、現在は準備中。申込一覧・チェックインAPIは未実装。
