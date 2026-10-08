# Phase 1 PoCの目的と検証結果

## 目的と環境

Goカンファレンス向け600〜700人規模の無料チケット申込を想定し、標準Go Wasm、Cloudflare Workers Free、D1、Wranglerの構成を検証するPoCである。Clerk認証を実装したソースのローカル検証日は2026-10-08。Workers Freeの制限値は[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)を基準とする。Freeプランであることは利用者がDashboardで確認済みである。

認証前のCloudflare計測と、認証導入後のdry-run・Cloudflare deployment計測を分けて記録する。認証導入版は既存Workerへdeploy済みだが、`No targets deployed`で外部URLは割り当てていない。

## サイズと実行制限

| 指標 | 認証なしPoC (Go 1.26.7) | Clerk JS版 (Go 1.26.7) | Clerk JS版 (Go 1.27.1) | Clerk Go SDK版 (Go 1.27.1) | Free上限・補足 |
| --- | ---: | ---: | ---: | ---: | --- |
| Public Wasm | 6,366,361 bytes | 6,367,870 bytes | 7,456,035 bytes | 13,790,659 bytes (+6,334,624 / +84.96%) | Worker bundleに同梱 |
| Admin Wasm | 6,207,639 bytes | 6,213,354 bytes | 7,542,541 bytes | 13,825,341 bytes (+6,282,800 / +83.30%) | Worker bundleに同梱 |
| Public Wrangler dry-run upload | 6,243.15 KiB | 6,295.09 KiB | 7,747.88 KiB | 13,490.39 KiB (+5,742.51 KiB / +74.12%) | 64 MiB未満 |
| Admin Wrangler dry-run upload | 6,088.14 KiB | 6,143.60 KiB | 7,831.77 KiB | 13,524.02 KiB (+5,692.25 KiB / +72.68%) | 64 MiB未満 |
| Public dry-run gzip表示 | 1,758.90 KiB | 1,772.79 KiB | 2,116.80 KiB | 3,506.62 KiB | 制限判定は非圧縮upload値 |
| Admin dry-run gzip表示 | 1,715.49 KiB | 1,729.93 KiB | 2,143.26 KiB | 3,517.89 KiB | 制限判定は非圧縮upload値 |
| 静的フロント資産 | 未導入 | `app.js` 1.8 MiB、Worker bundle外 | Vite React JS 350.98 kB (gzip 103.02 kB)、Worker bundle外 | 2026-10-08のローカルVite build値。Static Assetsで別配信 |
| Cloudflare Worker起動時間 | 9 ms | Public 9 ms / Admin 7 ms | 未測定 | Free上限1秒。Go 1.27.1版は未deploy |
| Cloudflare API CPU時間 | 未測定 | 未測定 | 未測定 | Free上限10 ms/要求 |
| Workerメモリ | 未測定 | 未測定 | 未測定 | Free上限128 MB |

Go 1.26.7とGo 1.27.1は同じ`GOOS=js GOARCH=wasm`、`-trimpath -buildvcs=false -ldflags='-s -w'`で測定した。Clerk Go SDK版も同じ設定で各1回計測した。dry-runはWrangler `4.145.0`で実行した。過去のdry-run値は別のbundle経路による履歴値である。WasmとWrangler値は実測、括弧内の増加率は計算値である。FrontendのClerk標準UIはWasmへ含めていない。

Cloudflare上の認証なしPoCのStartup Timeは9 ms、Clerk JS版はPublic 9 ms / Admin 7 msであり、Go 1.26.7版のdeploy出力値である。Clerk Go SDK版のCloudflare起動時間は未測定である。旧ローカルWranglerの単発値は`GET /health` 53 ms、Public経由Admin health 39 ms、未認証申込401が3 msである。Go SDK版の単発値はPublic health 76 ms、未認証申込401が8 ms、Admin health 62 ms、未認証管理API 6 msである。別の一時Workerでテスト署名鍵によるJWTを検証した経過時間は86 msだった。これらはローカルHTTP経過時間であり、CPU時間やCloudflare実測値ではない。

## 認証・API確認

Clerk Go SDK v2.7.0をGo Wasmへ組み込み、Public/Adminともビルドに成功した。Go単体テストではテスト用RSA鍵とローカルJWKS endpointを使い、正常token、署名不正、期限切れ、許可Origin不一致、`azp`欠落、無効なUser IDを検証した。管理者以外403、未認証401、リクエスト本文の`user_id`を無視する既存ロジックもGo単体テストで確認した。

ローカルWrangler 4.145.0でGo Wasmを起動し、Public/Adminそれぞれのhealthが200、偽装User ID header付きの未認証申込と未認証管理APIが401を返すことを確認した。署名不正tokenも401となった。別の一時WorkerではローカルJWKS endpointが返す署名鍵をGo Wasmが取得し、テスト用署名JWTを204で受理した。Clerk Development Instanceの実tokenをGo Wasmへ送る検証、Cloudflare上の認証検証は未実施である。

## D1整合性

前のPoCではWranglerローカルD1のSELECT/INSERT/UPDATE、Public/Admin共有DB、定員到達、重複申込、キャンセル、キャンセルと申込の競合を検証した。容量1に100件を並行送信する試験は、異なるuser IDと同一user IDで成功各1件、競合各99件だった。

Cloudflare D1へは試験用の容量1 ticket typeへ直接SQLを実行し、異なるuser ID 100件のINSERTで成功1件・`sold_out` 99件、同一user IDで成功1件・UNIQUE拒否99件を確認した。キャンセルで残席を回復し、試験レコードは削除済みである。これはD1への直接SQL試験で、認証済みWorker APIからのリモート並行試験ではない。

認証導入後はローカルmigrationで`administrators` tableを作成し、Workerからのhealth起動を確認した。Remote D1にも`0002_administrators.sql`を適用済みである。Clerk tokenを使ったローカルD1の申込・キャンセルとリモートD1の認証済み並行試験はまだ行っていない。

## 発見事項・残課題

- workers-go D1 driverでは`database/sql.BeginTx`が未実装である。申込triggerは単一INSERT内で残席更新と登録を処理する。
- ローカルD1を別々のWranglerプロセスから同時利用すると`SQLITE_BUSY_RECOVERY`が起きることがある。単一`mise run dev`で起動する。
- Wrangler 4.145.0付属のworkerdが対応する最新compatibility dateは`2026-10-07`であったため、Worker設定をその日に固定した。
- Clerk Go SDKのWasm化で各WorkerのWasmは約83〜85%増えた。Wrangler uploadは約13.2 MiBでFree上限64 MiBを下回る。
- `workers-go`はrequestごとにGo Wasm runtimeを起動するため、Clerk Go SDKのプロセス内JWKS cacheはrequest間で共有されない。認証requestごとにClerk Backend APIからJWKSを取得する構成である。ClerkはJWKS endpointにendpoint-specific rate limitを設けていないが、認証時に外部ネットワーク往復が増える。Clerkの[API制限](https://clerk.com/docs/guides/how-clerk-works/system-limits)とWorkers上のCPU・起動時間を本番負荷で再確認する必要がある。
- Clerk Go SDK版はFreeのサイズ上限に対して十分小さい。一方、10 ms CPU上限の実測、実Clerk tokenのWorker検証、Cloudflare上のD1競合試験、メモリ測定は未実施である。
- Admin Workerは独自routeと`workers.dev` URLを持たない。Public Workerの`/admin-api/*`だけがService Bindingで転送し、Admin Go middlewareがClerk認証とD1管理者認可を行う。
- GitHub、Google、メールOTPのDashboard provider設定はソースから判定できない。Clerk Dashboardで有効化とOAuth設定を確認する。
- Admin Workerの直接公開routeはなく、Admin画面の静的資産はPublic Workerが配信する。認証済みAdmin APIのCloudflare上の検証は未実施である。

## 採用判断

Go Wasm・D1・Clerk wrapperの組み合わせはローカル起動し、Wasmとdry-run uploadはWorkers Freeの64 MiB未満である。これにより構成の実装可能性は確認できた。認証導入版も既存Workerへdeploy済みだが、URLが無効なためCloudflare上の実認証は未検証である。本番採用の判断には、Clerk認証、CPU 10 ms、リモートD1並行申込、実行エラー、メモリ上限を確認する必要がある。

## Public Astro / Admin SPAの移行

2026-10-08にフロントエンドを`frontend/public` (Astro static + React Islands) と`frontend/admin` (React + Vite + TanStack Router) へ分割した。AstroはPublicのHTMLシェルをSSGし、イベント名や残席などDBの値はPublic Go APIから取得する。既存スキーマにイベント名・チケット名以上の情報はないため、架空の説明文は加えていない。

イベントAPI `GET /api/events`、`GET /api/events/{eventId}` と本人申込API `GET /registrations` をGoへ追加した。イベントHTMLとはURLを分けた。各種ビルド・ローカル画面/API確認の結果は次節に記録する。実Clerkログイン・ログアウト、申込・キャンセル、Cloudflare上のremote Worker/D1動作は未検証である。

## Public Astro / Admin SPAのローカル確認結果

2026-10-08時点のビルド値である。Go 1.27.1、Wrangler 4.145.0を使用した。Wasmは`wc -c`、WorkerはWrangler dry-runの非圧縮upload値を記録した。gzip値はWrangler表示値である。

| 指標 | Public | Admin | 備考 |
| --- | ---: | ---: | --- |
| Go Wasm | 13,915,742 bytes | 13,830,787 bytes | Go Wasm compile成功 |
| Wrangler dry-run upload | 13,614.03 KiB | 13,529.36 KiB | Freeの64 MiB上限未満 |
| Wrangler dry-run gzip表示 | 3,537.20 KiB | 3,519.81 KiB | 参考値 |

`mise run test`、`mise run lint-go`、frontend lint、Astro/TypeScriptとAdmin TypeScriptのtypecheck、Oxfmt、Public/Adminのdry-runは通過した。Go Wasmと両フロントエンドもdry-run内でビルドできた。Workers Freeの10 ms CPU時間、起動時間、128 MBメモリはローカルでは計測できず、今回も未測定である。

WranglerローカルでPublic/Adminを別portで起動し、Public `/`、`/events`、`/events/1`、`/tickets`、`/admin`、`/admin/events/1/registrations` が200を返すことを確認した。`/api/events`と`/api/events/1`はseedしたローカルD1の値を返し、Public healthとAdmin healthは200、未認証の本人申込・Admin APIは401だった。Public `/admin-api/*`からAdmin WorkerへのService Bindingも401を返し、内部転送を確認した。使用した`.dev.vars`はローカル用の仮値で、確認後に削除した。

ChromeではClerk標準SignIn UIにGitHub、Google、メールアドレスの選択肢が表示され、Clerkのスクリプトと画面が読み込まれることを確認した。未認証の状態が安定して表示された。実Clerkアカウントによる認証は行っていないため、有効なtokenでの申込・キャンセル、ログアウト後の状態、管理者の403/成功は未検証である。401/403の区別はGo単体テストの範囲で確認した。

依存監査ではAstro 7.2.8への更新によりAstro自身の重大な指摘は解消したが、Astroの推移依存`http-cache-semantics@4.2.0`にHighが1件残る。監査DBは修正版を4.2.1以降としている一方、npm registryに4.2.1はなく、4.3.0は公開から7日未満である。pnpmの`minimumReleaseAge: 10080`は維持し、CI監査ではこのGHSAだけを一時的に除外する。他のHigh/Critical指摘は引き続きCIを失敗させる。Astroはビルド時のみ使い、Workerには静的生成物を配信する。4.3.0の公開から7日経過後にlockfileを更新し、CIの例外を削除する。

## 採用・デプロイ判断の補足

フロントエンド分離後もWorker uploadは64 MiB上限未満である。Admin Workerは外部routeを持たず、Public Workerは`/admin-api/*`だけをService Bindingで転送する構成をdry-runで確認した。今回はCloudflareへdeployしていないため、remote URLでの認証・D1共有・実行時間は測定していない。Clerk実アカウントでの認証と権限試験、High依存の修正版適用、Cloudflare上のCPU測定が残る。
