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
mise exec -- npx wrangler d1 migrations apply go-tickets-poc --config wrangler.public.jsonc --local --persist-to .wrangler/state
mise exec -- npm run dev:both
```

別ターミナルで統合テストを実行します。定員1の初期データを使用し、テスト後の有効申込数は0に戻ります。テスト用ユーザーIDは実行ごとに変わります。

```sh
mise exec -- python scripts/integration.py
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

`scripts/build.sh` がWorkerごとにGo Wasmと必要な起動資産を生成します。GitHub Actionsは認証情報なしでGoテスト、両Wasmビルド、両Wrangler dry-runを実行します。CIからCloudflareへはデプロイしません。
Wranglerの間接依存 `sharp` は、監査で報告された脆弱性を避けるため `package.json` の `overrides` で0.35.5に固定しています。

## D1作成・マイグレーション・デプロイ

Cloudflareへデプロイする場合だけ、**新しいPoC専用D1**を作成します。両設定ファイル内のダミーID `00000000-0000-0000-0000-000000000001` を、新DBの同じ実IDに置き換えます。既存DBは使用しません。

```sh
mise exec -- npx wrangler d1 create go-tickets-poc
mise exec -- npx wrangler d1 migrations apply go-tickets-poc --config wrangler.public.jsonc --remote
mise exec -- npm run build:public
mise exec -- npm run build:admin
mise exec -- npx wrangler deploy --config wrangler.public.jsonc
mise exec -- npx wrangler deploy --config wrangler.admin.jsonc
```

現設定は両Workerとも `workers_dev: false` で、公開ルートを指定していません。認証のないAdmin APIをインターネットへ公開しないためです。Publicも本PoC段階では公開しません。実際のデプロイと公開前に、Cloudflareアカウント、対象DB、公開ルート、認証方針を確認してください。

## 定員の整合性

申込はパラメータ付きINSERTです。`registration_reserve` トリガーが同じSQLite文内で `reserved < capacity` を条件にカウンターをUPDATEします。UPDATEが0行なら `RAISE(ABORT, 'sold_out')` によってINSERTもロールバックされます。同一ユーザーと種別の組にはUNIQUE制約を設定しています。キャンセルは有効な申込のみUPDATEし、別トリガーが残席を回復します。キャンセル対象が0行なら404を返します。キャンセルしたユーザーの再申込はこのPoCでは許しません。

`workers-go` のD1ドライバーは `database/sql` の `BeginTx` を実装していません。そのため、Go側で複数SQLをトランザクションとして並べる方式は使わず、D1の単一文とトリガーで原子性を持たせています。アプリケーションのDBエラーはHTTP 500、定員到達と重複は409です。

## 検証結果（2026-10-08、macOS arm64ローカル）

Workers Freeの制限値は[Cloudflare公式ドキュメント](https://developers.cloudflare.com/workers/platform/limits/)によります。64 MiBは非圧縮サイズの上限で、圧縮サイズの上限はありません。

| 指標 | Public | Admin | Free制限・判断 |
| --- | ---: | ---: | --- |
| Wasmバイナリ（3回のビルド、すべて同値） | 6,366,361 bytes | 6,207,639 bytes | 参考値 |
| Wrangler dry-run非圧縮バンドル | 6243.31 KiB | 6088.29 KiB | 64 MiB以内 |
| Wrangler dry-run gzip表示 | 1759.55 KiB | 1715.07 KiB | 制限対象外 |
| ローカルHTTP経過時間 `/health`、20回、中央値（最小〜最大） | 5.23 ms (4.16〜46.63) | 5.12 ms (4.27〜37.79) | CPU時間ではない |
| ローカルHTTP経過時間 `GET /ticket-types/1/status`、20回 | 対象外 | 6.24 ms (5.06〜13.63) | CPU時間ではない |
| API CPU時間 | 未測定 | 未測定 | 10 ms/要求。Cloudflare実行ログが必要 |
| Worker起動時間 | 未測定 | 未測定 | 1秒。ローカルHTTP経過時間からは判定不可 |
| Workerメモリ使用量 | 未測定 | 未測定 | 128 MB。プロセス全体のRSSからは判定不可 |

`wrangler deploy --dry-run --outdir` は両Workerで成功しました。`go test ./...`、Go Wasmビルド、個別のWrangler起動、D1のSELECT/INSERT/UPDATE、両Workerから同じD1へのアクセスが成功しました。ローカルの実D1 Bindingを使った定員1の検証では、異なる100ユーザーの同時申込と同一ユーザーの100重複要求の双方で、成功1件・競合99件でした。キャンセル後の残席回復と、キャンセル・申込競合後のカウンター整合も確認しました。

## 発見した問題と採用判断

- `workers-go` のD1対応はalphaで、`BeginTx` 未実装です。D1ドライバーは `js/wasm` 専用なので、Worker入口だけビルドタグを付けて通常の `go test ./...` を可能にしています。
- 別プロセスのWranglerで同じローカルD1を同時使用すると `SQLITE_BUSY_RECOVERY` が発生しました。単一devセッションでは成功しています。この現象からCloudflare上のD1の挙動は推定できません。
- 標準Goはローカルで動作し、サイズ制限内です。そのためTinyGo比較は未実施です。
- Cloudflare上へのデプロイ、Workers FreeのCPU時間・起動時間・メモリ、リモートD1での100件同時申込は未検証です。**現段階ではWorkers Freeを本番構成として採用できるとは判定できません。** 特に10 msのCPU上限と1秒の起動上限を実環境で確認する必要があります。

次は隔離したCloudflare PoC用DBと非公開の検証経路で両Workerをデプロイし、[Workersの実行ログ・メトリクス](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)でCPU時間、起動失敗、メモリ制限、D1競合時の挙動を測定します。管理APIの認証、公開ルート、ユーザーIDの信頼性、本番の再申込・キャンセル規則を決めてから公開します。TerraformはPhase 2で導入します。
