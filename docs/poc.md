# Phase 1 PoCの目的と検証結果

## 目的と環境

Goカンファレンス向け600〜700人規模の無料チケット申込を想定し、標準Go Wasm、Cloudflare Workers Free、D1、Wranglerの構成を検証するPoCである。計測日は2026-10-08。Workers Freeの制限値は[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)を参照した。CloudflareアカウントがFreeであることは利用者がDashboardで確認済みである。

サイズとHTTP経過時間はmacOS arm64のローカル測定、Worker起動時間とリモートD1同時実行はCloudflare上での測定である。各結果の測定場所を混同しない。

## Wasmサイズと実行制限

| 指標 | Public | Admin | Workers Freeの制限・評価 |
| --- | ---: | ---: | --- |
| Wasmファイル（3回ビルド、全て同じ値） | 6,366,361 bytes | 6,207,639 bytes | 参考値 |
| Wrangler dry-run非圧縮バンドル | 6,243.15 KiB | 6,088.14 KiB | 64 MiB以内 |
| Wrangler dry-run gzip表示 | 1,758.90 KiB | 1,715.49 KiB | gzip表示はサイズ制限の対象外 |
| ローカル`GET /health`経過時間（20回中央値、最小〜最大） | 5.23 ms (4.16〜46.63) | 5.12 ms (4.27〜37.79) | CPU時間ではない |
| ローカルAdmin `GET /ticket-types/1/status`経過時間（20回） | 対象外 | 6.24 ms (5.06〜13.63) | CPU時間ではない |
| Cloudflare deploy出力のWorker Startup Time | 9 ms | 9 ms | 1秒以内 |
| Cloudflare上のAPI CPU時間 | 未測定 | 未測定 | 10 ms/要求。公開しない構成のためリクエスト未実行 |
| Workerメモリ使用量 | 未測定 | 未測定 | 128 MB。取得可能なリモート実測値なし |

デプロイversionはPublicが`4aa87520-5e0f-41ff-8ac3-1393763d7bd0`、Adminが`b47cf780-6265-4320-8565-596acc926884`である。`workers_dev: false`、`preview_urls: false`、routeなしでデプロイし、両方とも`No targets deployed`である。

## D1整合性

ローカルのWrangler D1 Bindingを使い、SELECT/INSERT/UPDATE、Public/Adminから共有D1へのアクセス、定員到達、重複申込、キャンセルによる残席回復、キャンセルと申込の競合を確認した。容量1に100件を並行送信したローカル統合試験は、異なるユーザーと同一ユーザーの双方で成功1件、競合99件となった。

Cloudflare上のD1では、試験用の容量1チケットへ別ユーザー100件を直接INSERTし、成功1件と`sold_out`拒否99件を確認した。キャンセルで残席を戻した後、同一ユーザー100件を直接INSERTし、成功1件とUNIQUE拒否99件を確認した。これはリモートD1への直接SQL並行試験であり、Worker APIやGo D1ドライバーを通じたリモート統合試験ではない。試験用イベント・チケット種別・申込はキャンセルtriggerを通して削除し、終了後はイベント、種別、申込が全て0件である。

## 発見した問題

- `workers-go`のD1対応はalphaで`database/sql.BeginTx`が未実装である。単一SQLとtriggerで原子性を保つ設計とした。
- ローカルD1を複数Wranglerプロセスから同時利用すると`SQLITE_BUSY_RECOVERY`が発生することがある。単一の`dev:both`プロセスで統合試験する。
- リモートmigrationでtrigger内の`SELECT CASE ... END`が`incomplete input`となった。条件付き`SELECT RAISE(...) WHERE ...`へ変更して適用した。
- 標準Go Wasmは動作しサイズ制限内であるためTinyGo比較は行っていない。

## 採用判断と残課題

サイズとdeploy出力の起動時間はWorkers Freeの制限内である。リモートD1 triggerでも定員超過と重複を抑止できることを確認した。一方で、Worker API経由のリモート統合試験、Cloudflare上のCPU時間、メモリ使用量は未検証である。特にCPU 10 msの上限を確認していないため、本番採用の判断は未確定である。

認証なしのAdmin APIを公開しないため、Workerにリクエストを送る公開経路を無効にしている。この状態ではCPU測定に必要なAPI実行ができない。認証付きの安全な呼び出し経路を構成し、Clerkを含むCPU時間、実行エラー、メモリ制限超過の有無を確認する必要がある。Clerk認証自体も現時点では未実装である。
