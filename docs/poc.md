# Phase 1 PoCの目的と検証結果

## 目的と環境

Goカンファレンス向け600〜700人規模の無料チケット申込を想定し、標準Go Wasm、Cloudflare Workers Free、D1、Wranglerの構成を検証するPoCである。Clerk認証を実装したソースのローカル検証日は2026-10-08。Workers Freeの制限値は[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)を基準とする。Freeプランであることは利用者がDashboardで確認済みである。

認証前のCloudflare計測と、認証導入後のdry-run・Cloudflare deployment計測を分けて記録する。認証導入版は既存Workerへdeploy済みだが、`No targets deployed`で外部URLは割り当てていない。

## サイズと実行制限

| 指標 | 認証なしPoC | Clerkコード追加後 | Free上限・補足 |
| --- | ---: | ---: | --- |
| Public Wasm | 6,366,361 bytes | 6,367,870 bytes (+1,509 / +0.024%) | Worker bundleに同梱 |
| Admin Wasm | 6,207,639 bytes | 6,213,354 bytes (+5,715 / +0.092%) | Worker bundleに同梱 |
| Public Wrangler dry-run upload | 6,243.15 KiB | 6,295.09 KiB (+51.94 KiB / +0.83%) | 64 MiB未満 |
| Admin Wrangler dry-run upload | 6,088.14 KiB | 6,143.60 KiB (+55.46 KiB / +0.91%) | 64 MiB未満 |
| Public dry-run gzip表示 | 1,758.90 KiB | 1,772.79 KiB | 制限判定は非圧縮upload値 |
| Admin dry-run gzip表示 | 1,715.49 KiB | 1,729.93 KiB | 制限判定は非圧縮upload値 |
| 静的フロント資産 | 未導入 | `app.js` 1.8 MiB、Worker bundle外 | Static Assetsで別配信 |
| Cloudflare Worker起動時間 | 9 ms | Public 9 ms / Admin 7 ms | Free上限1秒。認証導入版のdeploy出力値 |
| Cloudflare API CPU時間 | 未測定 | 未測定 | Free上限10 ms/要求 |
| Workerメモリ | 未測定 | 未測定 | Free上限128 MB |

認証前Wasm値は同一Goバージョン・`GOOS=js GOARCH=wasm`・`-trimpath -buildvcs=false -ldflags='-s -w'`で3回ビルドした値である。認証導入後はmise taskで同じGoとbuild flagsを使って測定した。Wranglerはpnpm lockfileの`4.145.0`でdry-runした。FrontendのClerk標準UIはWasmへ含めていない。

Cloudflare上の認証なしPoCのStartup Timeは9 ms、認証導入版はPublic 9 ms、Admin 7 msである。いずれもdeploy出力値である。ローカルWrangler 4.145.0で一度ずつ観測した経過時間は`GET /health` 53 ms、Public経由Admin health 39 ms、未認証申込401が3 msだった。これらは単発のローカルHTTP経過時間で、CPU時間やCloudflare実測値ではない。

## 認証・API確認

Clerk Backend SDKのJWT検証はテスト用RSA鍵を使ったNode単体テストで確認した。正常token、期限切れtoken、許可Origin不一致、クライアント偽装identity headerの置換をテストした。Go単体テストは未認証401、管理者以外403、本文`user_id`を無視して検証済みIDを保存へ渡す処理を確認した。

ローカルWranglerではPublic/AdminのGo Wasmが起動し、`GET /health`とPublic経由のAdmin healthが200、未認証申込が401、静的ログイン画面の配信を確認した。Clerk Development Instanceへの実ログインとWorkerへの実token送信は未確認である。認証導入版はCloudflareへdeploy済みである。両Workerに`CLERK_SECRET_KEY` Secret名があることは確認したが、URLが無効なためCloudflare上の認証・認可は未検証である。

## D1整合性

前のPoCではWranglerローカルD1のSELECT/INSERT/UPDATE、Public/Admin共有DB、定員到達、重複申込、キャンセル、キャンセルと申込の競合を検証した。容量1に100件を並行送信する試験は、異なるuser IDと同一user IDで成功各1件、競合各99件だった。

Cloudflare D1へは試験用の容量1 ticket typeへ直接SQLを実行し、異なるuser ID 100件のINSERTで成功1件・`sold_out` 99件、同一user IDで成功1件・UNIQUE拒否99件を確認した。キャンセルで残席を回復し、試験レコードは削除済みである。これはD1への直接SQL試験で、認証済みWorker APIからのリモート並行試験ではない。

認証導入後はローカルmigrationで`administrators` tableを作成し、Workerからのhealth起動を確認した。Remote D1にも`0002_administrators.sql`を適用済みである。Clerk tokenを使ったローカルD1の申込・キャンセルとリモートD1の認証済み並行試験はまだ行っていない。

## 発見事項・残課題

- workers-go D1 driverでは`database/sql.BeginTx`が未実装である。申込triggerは単一INSERT内で残席更新と登録を処理する。
- ローカルD1を別々のWranglerプロセスから同時利用すると`SQLITE_BUSY_RECOVERY`が起きることがある。単一`mise run dev`で起動する。
- Wrangler 4.145.0付属のworkerdが対応する最新compatibility dateは`2026-10-07`であったため、Worker設定をその日に固定した。
- Clerk認証導入版はFreeのサイズ上限に対して十分小さい。一方、10 ms CPU上限の実測、実Clerk tokenのWorker検証、Cloudflare上のD1競合試験、メモリ測定は未実施である。
- GitHub、Google、メールOTPのDashboard provider設定はソースから判定できない。Clerk Dashboardで有効化とOAuth設定を確認する。
- Admin公開routeはなく、認証済みの管理者登録に使う運用手順だけを用意した。Secret名は登録済みだが値の検証、Clerk provider設定、Cloudflare上の認証試験が完了するまで非公開設定を保つ。

## 採用判断

Go Wasm・D1・Clerk wrapperの組み合わせはローカル起動し、Wasmとdry-run uploadはWorkers Freeの64 MiB未満である。これにより構成の実装可能性は確認できた。認証導入版も既存Workerへdeploy済みだが、URLが無効なためCloudflare上の実認証は未検証である。本番採用の判断には、Clerk認証、CPU 10 ms、リモートD1並行申込、実行エラー、メモリ上限を確認する必要がある。
