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

## Go テストの静的解析

`mise run check` では、Go テストのテーブル駆動化に関するAnalyzerも実行する。単独で実行する場合は `backend` ディレクトリから次のコマンドを使う。

```sh
cd backend
go run ./tool/lint ./...
```

`table-driven` は、同じ構造のテストやサブテストが重複している場合にテーブルへの統合を促す。`table-driven-complexity` は、テーブルケースの入力・期待値に依存する分岐を調べ、分岐数が4以上、またはネストしたケース依存分岐が2つ以上ある場合に診断する。標準の `for range` と `t.Run`、および `testx.NewTable(...).Run(...)` が対象となる。`go/analysis` の制約により、CLI内部ではそれぞれ `table_driven`、`table_driven_complexity` として登録される。

Analyzerは `if`、`switch`、`for`、`range` の条件を解析し、テスト名の `name` / `Name` だけに依存する分岐は数えない。ケース値を使うヘルパー関数の内部や、分岐を伴わない複数責務の混在は検出しないため、必要に応じてテストを手動で整理する。
