# go-tickets

Goカンファレンス向け無料チケット申込の検証プロジェクトである。バックエンドはGo Wasm、Cloudflare Workers、D1、フロントエンドはClerk標準UIで構成する。

## 必要なツールとセットアップ

Go、Node.js、pnpm、Wranglerは[mise.toml](mise.toml)で固定している。frontendの依存関係とロックファイルは[frontend/](frontend/)で管理し、公開から7日間経過していないnpm依存をインストールしない。

```sh
mise install
mise exec -- pnpm --dir frontend install --frozen-lockfile
```

## ローカル開発

ルートの`.dev.vars`にClerk Development InstanceのSecret Keyを設定し、ローカルD1を初期化してWorkerを起動する。変数名やClerk Dashboardの設定は[開発手順](docs/development.md)を参照する。

```sh
mise run d1-local-init
mise run dev
```

ブラウザーで`http://localhost:8787`を開く。

## テスト・ビルド

```sh
mise run test
mise run build-public
mise run build-admin
mise run dry-public
mise run dry-admin
```

## 詳細ドキュメント

- [アーキテクチャ・認証設計](docs/architecture.md)
- [開発・ローカル検証](docs/development.md)
- [Cloudflareデプロイ・Secrets管理](docs/deployment.md)
- [PoCの計測結果・課題](docs/poc.md)
