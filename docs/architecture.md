# アーキテクチャ

## Workerとフロントエンド

- Public WorkerはGo Wasm APIとAstroの静的ファイルを配信する。`frontend/public/`にAstroのファイルベースページと必要箇所だけhydrateするReact Islandsを置く。
- Admin WorkerはGo Wasm APIと`frontend/admin/`のReact + Vite SPAを持ち、自身のStatic Assetsで画面を配信する。`workers_dev:true`により独立したURLを持つ。
- Admin APIはAdmin Workerのoriginで直接提供し、Go側でClerk JWTとD1の管理者情報を照合する。一般ユーザーは403、未認証は401である。
- Wrangler設定はルートに置き、D1は既存の`go-tickets`を両Workerで共有する。

## Public SSGとD1

Astroは`output: "static"`でビルドする。イベント一覧と詳細はReact IslandがPublic Go APIから表示時に取得する。イベント作成・変更後にPublicを再ビルドする必要はない。未知のイベントIDにも共通の詳細HTMLを返し、イベント有無は`GET /api/events/{eventId}`の応答で判断する。D1をビルド成果物へ複製しない。

イベント名、チケット種別、残席数は表示時に公開Go APIの`GET /api/events`と`GET /api/events/{eventId}`から取得する。Clerk標準UI、申込・キャンセル、`GET /api/registrations`によるマイチケット表示もReact Islandsに置く。

イベント詳細の共通HTMLは`/events/{eventId}`へ返し、イベントが存在しない場合はAPIの404を画面に表示する。WorkerはStatic AssetsのHTML自動redirectを無効にし、`/`、`/tickets`、`/events/{eventId}`を対応する`index.html`へ明示的に書き換える。Admin Workerは画面パスをSPAの`index.html`へ渡す。

## Clerk認証

Public/Adminフロントエンドは`@clerk/react`の`ClerkProvider`、`SignIn`、`UserButton`を利用する。ログイン状態、トークン更新、ログアウトはClerk SDKに任せ、アプリ独自にトークンを`localStorage`へ保存しない。API呼び出しはBearer tokenを送る。

両WorkerのGo middlewareはClerk公式Go SDKでJWTの署名・有効期限・issuer・`azp`を検証する。User IDは検証済みJWTの`sub`から取得する。クライアント入力の`user_id`は認証情報として扱わない。公開イベントGETと`GET /health`以外は認証必須である。AdminはさらにD1の`administrators` tableを確認する。

## D1の整合性

`events`、`ticket_types`、`registrations`と予約triggerは`backend/migrations/0001_init.sql`にある。申込はtriggerによる残席条件更新とINSERTを同一SQL statementで処理し、定員到達時はrollbackする。`(ticket_type_id,user_id)` unique制約が重複申込を防ぐ。キャンセルは単一UPDATEで残席を戻す。`workers-go` D1 connectorの複数statement transactionが未実装のため、この構成では単一statement内のtriggerで整合性を保つ。

## 制約

- Admin向けのイベント作成・更新、申込一覧、チェックインAPIは未実装である。SPAには認証と401/403確認、画面パスだけを用意し、架空データを表示しない。
- Public WorkerはPublic Astro資産とPublic APIを提供する。Admin WorkerはAdmin SPA資産とAdmin APIを自身の独立したoriginで提供する。両Worker間にService Bindingはない。
- イベント読み取りAPIはD1の現行スキーマから名前とチケット種別・残席を返す。日程や説明欄はスキーマにないため表示しない。
