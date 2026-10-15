# go-tickets
チケットサイトのPoC。workersのサイズが増えたので、goがworkersで動作するか検証しています。

PublicとAdminのCloudflare Workers、Go Wasm API、共有D1で構成する。

## 開発

```sh
mise run init
# .dev.vars に Clerk Development Instance の CLERK_SECRET_KEY を設定
mise run dev
```

Public: <http://localhost:8787>、Admin: <http://localhost:8788>。

```sh
mise run test
mise run check
mise run build
mise run dry
mise run e2e
```

ローカル手順は[開発ガイド](docs/development.md)、デプロイとSecretsは[運用ガイド](docs/deployment.md)を参照。
