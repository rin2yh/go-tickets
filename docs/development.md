# 開発

## 初期化

```sh
mise run init
```

miseで固定したツールとfrontend依存を用意し、`.dev.vars`（存在しない場合のみ）を作成する。Clerk Development Instanceの`CLERK_SECRET_KEY`を`.dev.vars`に設定する。ローカルAdminを使う場合はClerk user IDを`mise run init`時に登録する。`.dev.vars`と通常のローカルD1は初期化で上書きされない。

Clerkのauthorized partyはWrangler設定にあるローカルoriginと一致させる（Public `http://localhost:8787`、Admin `http://localhost:8788`）。Clerk DashboardのDevelopment Instanceで利用する認証providerも設定する。

## 起動・確認

```sh
mise run dev
```

Publicは8787、Adminは8788で起動する。ローカルD1は両Workerで共有されるため、同じcloneから複数の開発Workerを並行起動しない。

```sh
mise run test
mise run check
mise run build
mise run dry
```

`mise run e2e`はClerk Development Instanceと`CLERK_SECRET_KEY`を必要とする。E2E用D1は`.wrangler/e2e`に作り直し、通常開発用の`.wrangler/state`とは分離される。8787/8788が空いていることを確認して実行する。E2E結果は`frontend/e2e/test-results`と`frontend/e2e/playwright-report`に出力される。

`.dev.vars`、`.wrangler/`、E2E結果はローカル専用データとして扱い、Gitへ追加しない。
