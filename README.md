# go-tickets

Go言語のカンファレンス向け無料チケット申込を、Go Wasm、Cloudflare Workers、D1で検証するプロジェクトである。

## 必要なツール

Go 1.26.7、Node.js 26.7.0、Python 3.13.7は[mise.toml](mise.toml)、Wrangler 4.148.0は`package-lock.json`で固定している。

```sh
mise install
mise exec -- npm ci
```

## ローカル開発

```sh
mise exec -- npx wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/seed-local.sql
mise exec -- npm run dev:both
```

別ターミナルで`mise exec -- python scripts/integration.py`を実行する。ローカル用テストデータの削除は、Wranglerを停止した後に次を実行する。

```sh
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/cleanup-local.sql
```

## テストとビルド

```sh
mise exec -- go test ./...
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npm run dry:public
mise exec -- npm run dry:admin
```

## 詳細ドキュメント

- [アーキテクチャ・技術選定](docs/architecture.md)
- [ローカル開発・統合テスト](docs/development.md)
- [Cloudflareデプロイ・設定](docs/deployment.md)
- [PoCの計測結果・課題](docs/poc.md)
