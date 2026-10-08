# アーキテクチャ

## Workerとフロントエンド

- Public WorkerはGo Wasm APIとAstroの静的ファイルを配信する。`frontend/public/`にAstroのファイルベースページと必要箇所だけhydrateするReact Islandsを置く。
- Admin WorkerはGo Wasm APIを持つ。`frontend/admin/`のReact + Vite SPAはPublic WorkerのStatic Assetsから`/admin/*`で配信する。Admin Workerは`workers_dev:false`で外部routeを持たない。
- Public Workerの`ADMIN` Service Bindingは`/admin-api/*`だけをAdmin Workerへ転送する。Admin APIはGo側でClerk JWTとD1の管理者情報を照合する。一般ユーザーは403、未認証は401である。
- Wrangler設定はルートに置き、D1は既存の`go-tickets`を両Workerで共有する。

## Public SSGとD1

Astroは`output: "static"`でビルドする。ビルドタスクはWrangler CLIでPublic Workerに設定したD1 databaseからイベント名とチケット種別を一度取得し、同じ結果をAstro一覧と`getStaticPaths()`へ渡す。ローカルビルドはlocal D1、デプロイ用ビルドは`PUBLIC_EVENTS_SOURCE=remote`でremote D1を使う。APIサーバー起動、Clerk認証、直接のD1 REST APIは不要であり、D1を別のデータファイルに複製しない。

イベント名とチケット種別はAstroがHTMLへ出力するため、JavaScriptなしでも読める。残席数は変動情報のため、イベント詳細のReact Islandが公開Go APIの`GET /api/events/{eventId}`から取得する。Clerk標準UI、申込・キャンセル、`GET /registrations`によるマイチケット表示もReact Islandsに置く。SSGはビルド時点の公開情報を固定するため、イベントの作成・変更後はPublicを再ビルド・再デプロイする。

詳細ページはビルド時にD1に存在したIDだけ生成する。存在しないIDに汎用の詳細シェルを返さず404とする。WorkerはStatic AssetsのHTML自動redirectを無効にし、`/`、`/tickets`、`/events/{eventId}`、`/admin/*`を対応する`index.html`へ明示的に書き換える。

## Clerk認証

Public/Adminフロントエンドは`@clerk/react`の`ClerkProvider`、`SignIn`、`UserButton`を利用する。ログイン状態、トークン更新、ログアウトはClerk SDKに任せ、アプリ独自にトークンを`localStorage`へ保存しない。API呼び出しはBearer tokenを送る。

両WorkerのGo middlewareはClerk公式Go SDKでJWTの署名・有効期限・issuer・`azp`を検証する。User IDは検証済みJWTの`sub`から取得する。クライアント入力の`user_id`は認証情報として扱わない。公開イベントGETと`GET /health`以外は認証必須である。AdminはさらにD1の`administrators` tableを確認する。

## D1の整合性

`events`、`ticket_types`、`registrations`と予約triggerは`backend/migrations/0001_init.sql`にある。申込はtriggerによる残席条件更新とINSERTを同一SQL statementで処理し、定員到達時はrollbackする。`(ticket_type_id,user_id)` unique制約が重複申込を防ぐ。キャンセルは単一UPDATEで残席を戻す。`workers-go` D1 connectorの複数statement transactionが未実装のため、この構成では単一statement内のtriggerで整合性を保つ。

## 制約

- Admin向けのイベント作成・更新、申込一覧、チェックインAPIは未実装である。SPAには認証と401/403確認、画面パスだけを用意し、架空データを表示しない。
- Admin SPA資産はPublic Workerから配信する。Admin APIは同じPublic originの`/admin-api/*`を経由し、内部Service Bindingへ渡す。Admin Worker自体には公開routeがない。
- イベント読み取りAPIはD1の現行スキーマから名前とチケット種別・残席を返す。日程や説明欄はスキーマにないため表示しない。
