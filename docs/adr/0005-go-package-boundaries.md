# ADR 0005: 機能別Goパッケージと依存制約を使う

## Context

APIには認証、イベント、チケット処理など複数の機能があり、Worker entry pointとHTTP共通処理も必要になる。機能間の依存方向を明示できる。

## Decision

`backend/internal/`を機能単位のパッケージに分け、HTTP共通処理は`backend/x/http`に置く。`backend/.go-arch-lint.yml`で許可する依存関係を定義する。

## Consequences

Worker entry pointから機能への依存を検査できる。新しい機能や依存を追加するときは、曖昧な共通パッケージを作らず、アーキテクチャ設定も更新する。
