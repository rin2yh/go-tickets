# アーキテクチャ

## Workerとフロントエンド

- Public WorkerはGo Wasm APIとAstroの静的ファイルを配信する。`frontend/public/`にAstroのファイルベースページと必要箇所だけhydrateするReact Islandsを置く。
- Admin WorkerはGo Wasm APIを持つ。`frontend/admin/`のReact + Vite SPAはPublic WorkerのStatic Assetsから`/admin/*`で配信する。Admin Workerは`workers_dev:false`で外部routeを持たない。
- Public Workerの`ADMIN` Service Bindingは`/admin-api/*`だけをAdmin Workerへ転送する。Admin APIはGo側でClerk JWTとD1の管理者情報を照合する。一般ユーザーは403、未認証は401である。
- Wrangler設定はルートに置き、D1は既存の`go-tickets`を両Workerで共有する。

## Public SSGとD1

Astroは`output: "static"`でビルドし、リモートD1には接続しない。ページのHTMLシェルを静的生成し、Clerk標準UIはReact Island内でブラウザーから起動する。イベント名、チケット種別、残席数は公開Go APIの`GET /api/events`と`GET /api/events/{eventId}`からD1を読み、一覧・詳細のReact Islandsで表示する。HTMLの`/events/{eventId}`とはパスを分けてある。`GET /registrations`は認証済み利用者本人の申込だけを返す。

Astroの動的詳細ページは`PUBLIC_EVENT_IDS`に指定されたIDだけSSGする。環境変数が空の場合は共通イベント詳細シェルをWorkerが返し、IslandがURLのIDを使ってAPIから実データを取得する。WorkerはStatic AssetsのHTML自動redirectを無効にし、`/`、`/tickets`、`/events/{eventId}`、`/admin/*`を対応する`index.html`へ明示的に書き換える。イベントはDBの値だけを表示し、存在しないイベントをサンプル表示しない。

## Clerk認証

Public/Adminフロントエンドは`@clerk/react`の`ClerkProvider`、`SignIn`、`UserButton`を利用する。ログイン状態、トークン更新、ログアウトはClerk SDKに任せ、アプリ独自にトークンを`localStorage`へ保存しない。API呼び出しはBearer tokenを送る。

両WorkerのGo middlewareはClerk公式Go SDKでJWTの署名・有効期限・issuer・`azp`を検証する。User IDは検証済みJWTの`sub`から取得する。クライアント入力の`user_id`は認証情報として扱わない。公開イベントGETと`GET /health`以外は認証必須である。AdminはさらにD1の`administrators` tableを確認する。

## D1の整合性

`events`、`ticket_types`、`registrations`と予約triggerは`backend/migrations/0001_init.sql`にある。申込はtriggerによる残席条件更新とINSERTを同一SQL statementで処理し、定員到達時はrollbackする。`(ticket_type_id,user_id)` unique制約が重複申込を防ぐ。キャンセルは単一UPDATEで残席を戻す。`workers-go` D1 connectorの複数statement transactionが未実装のため、この構成では単一statement内のtriggerで整合性を保つ。

## 制約

- Admin向けのイベント作成・更新、申込一覧、チェックインAPIは未実装である。SPAには認証と401/403確認、画面パスだけを用意し、架空データを表示しない。
- Admin SPA資産はPublic Workerから配信する。Admin APIは同じPublic originの`/admin-api/*`を経由し、内部Service Bindingへ渡す。Admin Worker自体には公開routeがない。
- イベント読み取りAPIはD1の現行スキーマから名前とチケット種別・残席を返す。日程や説明欄はスキーマにないため表示しない。
