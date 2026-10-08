# go-tickets — Cloudflare Workers Free / Go Wasm PoC (Phase 1)

Goのカンファレンス（600〜700人規模）の無料チケット申込を、標準Go Wasm + Cloudflare Workers + D1で実現できるかを検証するリポジトリです。本番チケット発行や認証は含みません。

## 構成

- `cmd/public`: Go `net/http` の `/health`、申込、キャンセルAPI
- `cmd/admin`: Go `net/http` の `/health`、申込状況API
- `internal/tickets`: 両Worker共通のHTTP処理とD1へのSQLアクセス
- `migrations`: Event、TicketType、RegistrationのD1スキーマと定員トリガー
- `wrangler.public.jsonc` / `wrangler.admin.jsonc`: 独立したWorker設定。同じD1 IDを参照
- `wrangler.local.jsonc` と `scripts/router.mjs`: ローカル統合テスト専用のルーター。2 Workerを1つのWrangler devプロセスで起動する

標準Go 1.26.7、`github.com/syumai/workers-go` v0.36.0、Wrangler 4.148.0を使います。元の `github.com/syumai/workers` モジュールは移行先を `workers-go` と案内するため、移行先を直接使用しています。Goの `database/sql` から同ライブラリのD1ドライバーを通じてD1 Bindingを使い、D1管理REST APIは使用しません。JavaScriptはライブラリ生成のWasm起動コードと、ローカル検証用ルーターのみです。

## 環境構築とローカル実行

`mise` をインストールした後、以下を実行します。Go、Node、Pythonのバージョンは `mise.toml`、Wranglerのバージョンは `package-lock.json` で固定しています。

```sh
mise install
mise exec -- npm ci
mise exec -- npx wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/seed-local.sql
mise exec -- npm run dev:both
```

別ターミナルで統合テストを実行します。定員1のローカルテストデータを使用し、テスト後の有効申込数は0に戻ります。テスト用ユーザーIDは実行ごとに変わります。テストデータ全体を削除する場合はWranglerを停止して次を実行します。

```sh
mise exec -- python scripts/integration.py
mise exec -- npx wrangler d1 execute go-tickets --config wrangler.public.jsonc --local --persist-to .wrangler/state --file scripts/cleanup-local.sql
```

個別起動は `mise exec -- npm run dev:public` または `mise exec -- npm run dev:admin` です。同じ永続化ディレクトリのローカルD1を別々のWranglerプロセスから同時に開くと、`SQLITE_BUSY` でプロセスが落ちることを確認しました。両Workerを同時に動かす場合は `dev:both` を使用します。ローカルルーターは `Host: public.local` と `Host: admin.local` で振り分けます。

```sh
curl -H 'Host: public.local' http://127.0.0.1:8787/health
curl -H 'Host: admin.local' http://127.0.0.1:8787/ticket-types/1/status
curl -H 'Host: public.local' -H 'Content-Type: application/json' \
  -d '{"ticket_type_id":1,"user_id":"example"}' http://127.0.0.1:8787/registrations
curl -H 'Host: public.local' -H 'Content-Type: application/json' \
  -d '{"ticket_type_id":1,"user_id":"example"}' http://127.0.0.1:8787/registrations/cancel
```

## ビルド、dry-run、CI

```sh
mise exec -- go test ./...
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npm run dry:public
mise exec -- npm run dry:admin
```

`scripts/build.sh` がWorkerごとにGo Wasmと必要な起動資産を生成します。`-buildvcs=false` でコミット情報の埋め込みを止め、サイズ計測を再現可能にしています。GitHub Actionsは認証情報なしでGoテスト、両Wasmビルド、両Wrangler dry-runを実行します。CIからCloudflareへはデプロイしません。
Wranglerの間接依存 `sharp` は、監査で報告された脆弱性を避けるため `package.json` の `overrides` で0.35.5に固定しています。

## D1作成・マイグレーション・デプロイ

このリポジトリのCloudflareリソースは、将来の本番環境のベースとして使います。既存リソースをPoC用に複製せず、`go-tickets` D1（ID: `5af5f125-7b2b-4f3e-8879-829a0f4e9369`）を1つ作成し、`go-tickets-public` / `go-tickets-admin` が共有します。リモートマイグレーションは適用済みです。スキーマだけを作成し、イベントや申込の検証データは含めていません。

```sh
mise exec -- npx wrangler d1 migrations apply go-tickets --config wrangler.public.jsonc --remote
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npx wrangler deploy --config wrangler.public.jsonc
mise exec -- npx wrangler deploy --config wrangler.admin.jsonc
```

現設定は両Workerとも `workers_dev: false`、`preview_urls: false` で、公開ルートを指定していません。workers.dev本番URLとVersion/Preview URLの両方を無効にし、認証のないAdmin APIを公開しない構成です。Publicも同様に外部公開しません。外部検証が必要になった段階で、Cloudflare Accessなどの認証を先に構成してから到達経路を追加してください。

## 定員の整合性

申込はパラメータ付きINSERTです。`registration_reserve` トリガーが同じSQLite文内で `reserved < capacity` を条件にカウンターをUPDATEします。UPDATEが0行なら `RAISE(ABORT, 'sold_out')` によってINSERTもロールバックされます。同一ユーザーと種別の組にはUNIQUE制約を設定しています。キャンセルは有効な申込のみUPDATEし、別トリガーが残席を回復します。キャンセル対象が0行なら404を返します。キャンセルしたユーザーの再申込はこのPoCでは許しません。

`workers-go` のD1ドライバーは `database/sql` の `BeginTx` を実装していません。そのため、Go側で複数SQLをトランザクションとして並べる方式は使わず、D1の単一文とトリガーで原子性を持たせています。アプリケーションのDBエラーはHTTP 500、定員到達と重複は409です。

## 検証結果（2026-10-08）

Workers Freeの制限値は[Cloudflare公式ドキュメント](https://developers.cloudflare.com/workers/platform/limits/)によります。64 MiBは非圧縮サイズの上限で、圧縮サイズの上限はありません。
サイズとHTTP経過時間はmacOS arm64でのローカル測定、Worker起動時間とD1同時実行はCloudflare上の測定です。CloudflareアカウントがWorkers Freeであることは利用者がダッシュボードで確認済みです。

| 指標 | Public | Admin | Free制限・判断 |
| --- | ---: | ---: | --- |
| Wasmバイナリ（3回のビルド、すべて同値） | 6,366,361 bytes | 6,207,639 bytes | 参考値 |
| Wrangler dry-run非圧縮バンドル | 6243.15 KiB | 6088.14 KiB | 64 MiB以内 |
| Wrangler dry-run gzip表示 | 1758.90 KiB | 1715.49 KiB | 制限対象外 |
| ローカルHTTP経過時間 `/health`、20回、中央値（最小〜最大） | 5.23 ms (4.16〜46.63) | 5.12 ms (4.27〜37.79) | CPU時間ではない |
| ローカルHTTP経過時間 `GET /ticket-types/1/status`、20回 | 対象外 | 6.24 ms (5.06〜13.63) | CPU時間ではない |
| Cloudflareデプロイ表示のWorker起動時間 | 9 ms | 9 ms | 1秒以内。Wranglerのdeploy出力 |
| API CPU時間 | 未測定 | 未測定 | 10 ms/要求。公開せずに呼ぶ経路がなく、リクエスト未実行 |
| Workerメモリ使用量 | 未測定 | 未測定 | 128 MB。プロセス全体のRSSからは判定不可 |

`go test ./...`、両Go Wasmビルド、両WorkerのWrangler dry-run、両Workerのデプロイに成功しました。Cloudflareは両WorkerのWorker Startup Timeとして9 msを表示しました。両設定は `workers_dev: false`、`preview_urls: false` で、ルートがありません。Cloudflareのdeploy出力も `No targets deployed` であり、Public/Adminとも呼び出し可能な公開URLは有効化していません。

| Worker | デプロイ version ID | 起動時間 |
| --- | --- | ---: |
| `go-tickets-public` | `4aa87520-5e0f-41ff-8ac3-1393763d7bd0` | 9 ms |
| `go-tickets-admin` | `b47cf780-6265-4320-8565-596acc926884` | 9 ms |

ローカルではD1 SELECT/INSERT/UPDATE、両Workerから同じD1へのアクセス、キャンセル後の残席回復とキャンセル・申込競合後のカウンター整合を確認しました。Cloudflare上のD1では、一時的な定員1の種別に別ユーザー100件を同時INSERTし、成功1件・`sold_out` 99件を確認しました。キャンセルで残席を戻し、同一ユーザー100件を同時INSERTした試験では成功1件・UNIQUE制約違反99件でした。試験用イベント、種別、申込はキャンセルtriggerを通して削除し、終了後の本番D1はイベント0件・種別0件・申込0件です。このリモート試験はD1 triggerの整合性確認であり、Worker API経由の試験ではありません。

## 発見した問題と採用判断

- `workers-go` のD1対応はalphaで、`BeginTx` 未実装です。D1ドライバーは `js/wasm` 専用なので、Worker入口だけビルドタグを付けて通常の `go test ./...` を可能にしています。
- 別プロセスのWranglerで同じローカルD1を同時使用すると `SQLITE_BUSY_RECOVERY` が発生しました。単一devセッションでは成功しています。この現象からCloudflare上のD1の挙動は推定できません。
- 標準Goはローカルで動作し、サイズ制限内です。そのためTinyGo比較は未実施です。
- リモートD1マイグレーションは、trigger内の `SELECT CASE ... END` 形式がCloudflare D1のSQL処理で `incomplete input` になりました。SQLite trigger内の条件付き `SELECT RAISE(...) WHERE ...` に変更するとリモート適用でき、ローカル・リモート双方で使用しています。
- Cloudflare上のWorker CPU時間は未測定です。未認証APIを外から呼べる経路を作らない条件を優先し、workers.dev、Version URL、ルートを無効にしています。安全にHTTPリクエストを実行できないため、起動時間以外のリモート実行メトリクスは取得できません。メモリも未測定です。
- 定員超過と重複抑止はローカルのWorker APIおよび本番D1 triggerで確認しましたが、本番Worker APIを通したリモート統合試験ではありません。CPU 10 ms上限を確認できていないため、Free構成はサイズと起動時間の点では範囲内ですが、本番採用可否は未確定です。

次はCloudflare Access等の認証を構成した検証用の呼び出し経路を追加し、[Workersの実行ログ・メトリクス](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)でCPU時間とメモリを確認します。Admin APIの認証、ユーザーIDの信頼性、本番の再申込・キャンセル規則を決めてから一般公開します。TerraformはPhase 2で導入します。
