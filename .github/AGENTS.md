# GitHub Actions のルール

`.github/workflows/` と GitHub Actions 関連ファイルを変更するときは、以下を守る。

## Actions の参照

- 外部 Action はタグやブランチではなく、完全な commit SHA で pin する。短縮 SHA は使わない。
- `uses:` の行末コメントに、参照した Action のバージョンまたはリリースタグを記載する。例: `uses: actions/checkout@<40桁のSHA> # vX.Y.Z`。
- Action を追加・更新するときは、利用可能な最新の安定版リリースを確認し、そのリリースの正しい commit SHA に pin する。古い SHA やタグだけの参照を新規導入しない。
- 更新時は公式リポジトリのリリース情報と SHA を確認する。メジャーバージョンの変更では、互換性、入力値、権限要件、Node.js runtime の変更も確認する。
- 同じ Action を複数箇所で使う場合は、全箇所で同じ SHA とバージョンコメントを使う。
- GitHub が提供する reusable workflow を `uses:` で呼び出す場合も、可能な限り完全な commit SHA に pin する。

## Runner と Ubuntu

- Ubuntu runner は workflow 内で共通の `runs-on` 値を定義し、全 job で共有する。
- 使用する Ubuntu バージョンは `ubuntu-26.04` に固定する。`ubuntu-latest`、`ubuntu-24.04` など別のイメージへ暗黙に切り替わる指定や、複数世代を混在させる指定は使わない。
- Ubuntu の更新が必要な場合は、GitHub-hosted runner の提供状況と非推奨・廃止予定を確認し、workflow 全体を同じバージョンへ揃えて変更する。
- runner の更新では、インストール済みツールや OS 依存パッケージの変更が各 job に影響しないか確認する。

## Workflow の安全性と保守

- 各 job に必要最小限の `permissions` を明示する。書き込み権限は、その job が実際に書き込む場合だけ付与する。
- fork からの pull request で secrets を参照したり、信頼できないコードに書き込み権限を与えたりしない。イベント条件を変更するときはこの境界を維持する。
- 外部入力を `run:` の shell 文字列へ直接埋め込まない。必要なら `env:` 経由で渡し、安全に扱う。
- job 間で同じ runner、Action、セットアップ手順を使う場合は、既存の workflow 内の共通定義を再利用する。
- workflow の変更後は YAML と GitHub Actions の式・構文を確認し、Action の SHA、権限、runner 指定に矛盾がないことをレビューする。
