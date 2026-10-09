# デプロイと運用

## 前提

Public/Admin WorkerはそれぞれのWrangler設定とStatic Assetsを使い、同じ既存の`go-tickets` D1 databaseを参照する。新しいmigrationがある場合はデプロイ前に適用する。

```sh
mise exec -- wrangler d1 migrations apply go-tickets --remote --config wrangler.public.jsonc
mise run dry
mise exec -- wrangler deploy --config wrangler.admin.jsonc
mise exec -- wrangler deploy --config wrangler.public.jsonc
```

## Clerk

`CLERK_PUBLISHABLE_KEY`と`CLERK_AUTHORIZED_PARTIES`は各Wrangler設定の`vars`で管理する。デプロイ後は各WorkerのoriginをClerk Dashboardのauthorized partiesに登録し、Admin originは`wrangler.admin.jsonc`にも反映して再デプロイする。Clerk Dashboardで必要な認証providerを有効にする。

Secret Keyは各WorkerのSecretとして登録する。リポジトリ、`vars`、コマンド引数には置かない。

```sh
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.public.jsonc
mise exec -- wrangler secret put CLERK_SECRET_KEY --config wrangler.admin.jsonc
```

Admin APIはAdmin Workerのoriginでのみ提供し、API middlewareがClerk認証後にD1の`administrators`登録を確認する。管理者の追加は`administrators` tableへClerk user IDを登録する。Public WorkerからAdmin WorkerへのService Bindingはない。

## 運用上の制約

Publicのイベント表示は実行時にD1を読むため、イベント内容の変更にPublicの再ビルドは不要。Admin向けのイベント編集、申込一覧、チェックインAPIは未実装。
