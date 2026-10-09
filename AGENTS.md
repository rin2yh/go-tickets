# Agent Rules

このルールに記載の内容は必ず守ること。

## 基本方針

- `internal/`は機能単位で分割する。
- 機能ごとのHandlerとMiddlewareはその機能のパッケージに置く。
- 技術的な共通処理は必要に応じて`x/`に配置する。
- `util`、`utils`、`common`、`shared`、`helper`などの曖昧なパッケージは禁止。
- パッケージ名は原則単数形。
- 不必要な共通化や抽象化は禁止。
- パッケージ間の依存関係は`backend/.go-arch-lint.yml`に従う。
