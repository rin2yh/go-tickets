# go-tickets

Goカンファレンス向け無料チケットサイトのPoCである。PublicはAstroとReact Islands、AdminはReact SPA、APIはGo Wasm・Cloudflare Workers・D1で構成する。

## 必要なツールとセットアップ

Go、golangci-lint、Node.js、pnpm、Wranglerは[mise.toml](mise.toml)で固定している。フロントエンド依存はpnpm workspaceで管理し、公開から7日未満のnpmパッケージはインストールしない。

```sh
mise install
(cd frontend && pnpm install --frozen-lockfile)
cp .dev.vars.example .dev.vars
```

`.dev.vars`へClerk Development InstanceのSecret Keyを設定する。詳しくは[開発手順](docs/development.md)を参照する。

## ローカル開発

```sh
mise run d1-local-init
mise run dev
```

Publicは`http://localhost:8787`、Adminは`http://localhost:8787/admin`、Admin Workerは内部Service Binding先として`http://localhost:8788`で起動する。

## テスト・ビルド

```sh
mise run test
mise run lint-go
cd frontend && pnpm run lint && pnpm run typecheck && pnpm run format:check
mise run build-public
mise run build-admin
mise run dry-public
mise run dry-admin
```

## 詳細

- [アーキテクチャ・認証設計](docs/architecture.md)
- [開発・ローカル検証](docs/development.md)
- [Cloudflareデプロイ・Secrets管理](docs/deployment.md)
- [PoCの計測結果・課題](docs/poc.md)
