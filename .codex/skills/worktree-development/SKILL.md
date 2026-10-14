---
name: worktree-development
description: Use this skill only when developing in a linked Git worktree. Apply it for worktree changes involving project-specific mise configuration, Git hooks, sibling-checkout local settings, commits, or pushes. Do not use it in an ordinary or primary checkout, even if the task involves mise or Git hooks; follow the repository's normal development instructions there.
---

# Worktree 開発

## 適用条件

- 最初に `git rev-parse --path-format=absolute --git-dir` と `git rev-parse --path-format=absolute --git-common-dir` を確認する。出力が異なるlinked worktreeでのみ、このスキルを適用する。
- 出力が同じ通常checkoutでは、このスキルの手順を使わず、リポジトリの通常の開発手順に従う。miseやGit hooksの作業だけを理由に適用範囲を広げない。

作業対象の git worktree で変更・検証・commit・pushを完了する。worktree間で秘密情報や未追跡ファイルを不用意に複製しない。

## 開始時

- `pwd`、`git rev-parse --show-toplevel`、`git status --short --branch`、`git worktree list --porcelain` を確認し、現在のworktree、ブランチ、変更状態を特定する。
- 作業前に、ルートおよび変更対象ディレクトリの `AGENTS.md` と対象プロジェクトの開発手順を読む。
- git hooksの有効化方式を `git config --show-origin --get core.hooksPath`、関連設定、hookスクリプトから確認する。設定ファイルを変更して無効化しない。

## mise と hooks

- mise が `mise.toml` の未信頼を理由に停止した場合は、対象の `mise.toml` と関連設定を確認する。ユーザーがそのプロジェクトのhookやmise task実行を依頼している場合に限り、そのプロジェクトディレクトリだけ `mise trust` する。包括的なtrust設定は使わない。
- hookスクリプトの内容と副作用を確認してから、対象worktreeで通常のcommit / pushを行う。hookが失敗したら原因を直して同じhookを再実行する。既にcommit済みのpost-commit hookが失敗した場合は、修正後に該当hookスクリプトを実行する。
- **git hookの無効化・迂回は禁止。** `--no-verify`、`git -c core.hooksPath=...`、`HUSKY=0`、skip用環境変数や設定変更を使わない。hookの一部が実行できなければ、成功扱いにせず、停止理由を具体的に伝える。
- pushは通常の `git push` で行い、pre-push hookを実行させる。push前にhookを手動実行した場合も、push時のhookを省略しない。

## 別checkoutにあるローカル設定

hookが `.dev.vars` などignoredなローカル設定を必要とし、現在のworktreeにない場合は、`git worktree list --porcelain` に表示された同一リポジトリのcheckoutを調べる。ファイル名と必要キーの存在だけを確認し、値を表示・ログ出力しない。

既存の有効な設定が見つかった場合は、対象worktreeにファイルが存在しないことを確認してから一時symlinkを作成し、trap等でhook終了後に必ず削除する。設定ファイルを上書き・commitせず、hookを対象worktreeのルートから実行する。hookが使うDBやbuild出力が隔離されているか、実行前にhook内容を確認する。

必要な秘密設定がどのcheckoutにもない場合は、値をチャットに求めない。ユーザーにローカルのignored設定ファイルへ値を用意してもらい、その後hookを再実行する。

## 結果の確認

- 中断されたコマンドがあれば、再実行前にプロセスと作業状態を確認する。
- hookがexit code 0で完了したことを確認し、通過したhook、失敗した項目、未実行の項目を分けて報告する。
- push後は `git status` とリモートのブランチ先頭を照合する。PR作成・更新を依頼された場合は、push済みのHEADとPRのhead SHAが一致することを確認する。
