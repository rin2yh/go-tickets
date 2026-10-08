# ローカル開発

## ツールとセットアップ

Go `1.26.7`、Node.js `26.7.0`、Python `3.13.7`は`mise.toml`、Wrangler `4.148.0`は`package-lock.json`で固定する。

```sh
mise install
mise exec -- npm ci
```

## ローカルD1

初回はマイグレーションを適用し、ローカルテスト用のイベントと定員1のチケット種別をseedする。

```sh
mise exec -- npx wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/seed-local.sql
```

`migrations/0001_init.sql`はスキーマだけを作成する。ローカル用レコードは`seed-local.sql`で投入し、`cleanup-local.sql`で削除する。本番D1にこれらのseed/cleanupコマンドを実行してはならない。

## Worker起動と統合テスト

```sh
mise exec -- npm run dev:both
```

別ターミナルから統合テストを実行する。

```sh
mise exec -- python scripts/integration.py
```

統合テストはPublic/Admin双方のhealth、申込・キャンセル、定員1への100並行申込、同一ユーザーの重複要求、キャンセルと申込の競合を確認する。実行前にseed済みローカルD1の`reserved`が0である必要がある。テストユーザーIDは各実行で変わる。

Wranglerを停止した後に、ローカルテストデータを完全に削除する場合は次を実行する。

```sh
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/cleanup-local.sql
```

単独起動には`mise exec -- npm run dev:public`または`mise exec -- npm run dev:admin`を使う。2つの独立したWranglerプロセスで同一のローカルD1を同時に開くと`SQLITE_BUSY`または`SQLITE_BUSY_RECOVERY`で停止することがある。両Workerを同時に動かす場合は`dev:both`を使う。

ローカルルーターは`Host: public.local`と`Host: admin.local`で振り分ける。例：

```sh
curl -H 'Host: public.local' http://127.0.0.1:8787/health
curl -H 'Host: admin.local' http://127.0.0.1:8787/ticket-types/1/status
curl -H 'Host: public.local' -H 'Content-Type: application/json' \
  -d '{"ticket_type_id":1,"user_id":"example"}' http://127.0.0.1:8787/registrations
curl -H 'Host: public.local' -H 'Content-Type: application/json' \
  -d '{"ticket_type_id":1,"user_id":"example"}' http://127.0.0.1:8787/registrations/cancel
```

現行PoCは認証未実装である。これらのローカル例の`user_id`は本番で信頼できる認証情報ではない。

## テストとビルド

```sh
mise exec -- go test ./...
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npm run dry:public
mise exec -- npm run dry:admin
```

`scripts/build.sh`は各Workerの起動資産とWasmを生成する。CIは依存関係監査、Goテスト、両WorkerのWasmビルド、Wrangler dry-runを実行する。CIからCloudflareへはデプロイしない。

## 既知の問題

- 共有のローカルD1はWranglerの複数プロセスから同時利用するとSQLite busyエラーになることがある。単一`dev:both`セッションを使う。
- Wranglerの間接依存`sharp`は監査上の問題を避けるため`package.json`の`overrides`で`0.35.5`に固定している。
- `workers-go`のD1ドライバーは`js/wasm`専用であり、通常のGoテストではCloudflare D1 Bindingは利用しない。SQLStoreのWorker統合確認はWranglerローカルD1で行う。
