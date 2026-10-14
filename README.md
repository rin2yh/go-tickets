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

`mise run check`には、テーブル駆動テストにまとめられる重複を検出するGo Analyzerも含まれる。個別に実行する場合は `mise run lint-tabledriven` を使う。`*_test.go` の標準的なテスト関数名（`Test_Example` を含む）間と、同じブロックに直接書かれた `t.Run` 間で、テスト本体全体の構造を比較する。リテラルや同じ型のローカル変数、ローカル変数名の違いは許容する。識別子は `types.Info` の束縛を使って比較し、パッケージ変数や定数は同じ宣言を参照する場合だけ同一とみなす。呼び出し先、演算子、文や制御フローの違いは重複として扱わない。テスト本体に `for range` がある場合と、`for range` 内の `t.Run` は対象外で、自動修正もしない。

既存の[dupl](https://github.com/mibk/dupl)は一般的なコードクローンをトークン列で検出し、[go-criticの`dupSubExpr`](https://github.com/go-critic/go-critic/blob/master/docs/overview.md)は重複した式を検出する。テスト本体やサブテストを比較単位とするルールではないため、このAnalyzerで補う。

ローカル手順は[開発ガイド](docs/development.md)、デプロイとSecretsは[運用ガイド](docs/deployment.md)を参照。
