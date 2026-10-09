# アーキテクチャ

Public WorkerはGo Wasm APIとAstroの静的資産を配信し、Admin WorkerはGo Wasm APIとReact/Vite SPAを独立したoriginで配信する。両Workerは同じCloudflare D1 databaseをBindingし、Worker間のService Bindingはない。

Publicのイベント一覧・詳細はブラウザからGo API経由で取得する。Astroはページ外枠を静的生成し、React Islandsがイベント表示、Clerk UI、申込操作を担う。Admin SPAは同一originのAPIを呼び出す。

Goコードは`internal/`を機能別に分け、技術的なHTTP共通処理を`x/http`に置く。`backend/.go-arch-lint.yml`でパッケージ間の依存を制限する。

Clerk SDKが発行するセッションtokenをAPI要求にBearer tokenとして送り、Go middlewareがJWT署名・期限・issuer・authorized partyを検証する。Admin APIはさらにD1の`administrators`登録を確認する。ヘルス確認とPublicイベント読み取りは公開APIである。

申込・キャンセル時の残席整合性はD1 triggerと制約で保つ。申込時は単一INSERTに連動するtrigger内で残席を条件付き更新し、満席ならstatementを中止する。複数statement transactionに依存しない。
