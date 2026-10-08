# アーキテクチャ

## ディレクトリと実行単位

`backend/`にGo module、HTTP・D1処理、migration、Wrangler設定をまとめる。Go Wasmのentry pointとWorker起動wrapperは`backend/cmd/public`と`backend/cmd/admin`で対にする。Clerk token検証は`backend/internal/auth`に置く。`frontend/`はブラウザー画面と、そのビルドおよびWorker bundleに使うJavaScript依存を管理する。ビルド・開発操作はルートの`mise.toml`で管理する。

- `backend/cmd/public`: Public Go WasmとClerk認証wrapper
- `backend/cmd/admin`: Admin Go Wasmと独立したClerk認証wrapper
- `backend/internal/tickets`: 共通`net/http` handlerとD1 SQLStore
- `backend/internal/auth`: Worker境界でClerk JWTを検証するJavaScript実装。Goアプリケーション内部の認証済みidentity処理とは分離する。
- `backend/migrations`: D1 schema
- `frontend/index.html`、`frontend/app.js`: Clerk標準UIと認証済みPublic APIを呼ぶ小さな画面
- `frontend/package.json`: Clerk Frontend/Backend SDK、esbuild、Wranglerの依存管理
- frontendで共通部品が必要になった場合は`frontend/packages/`へ追加する。現時点では共通部品はない。

## 認証・認可

ブラウザーでは`@clerk/clerk-js`の標準Sign inとUser Buttonを使う。ログイン状態・セッション更新・ログアウトはClerkに任せ、API呼び出し時にClerk SessionからBearer tokenを取得する。ブラウザーの`localStorage`へ独自にtokenを保存しない。HTTPS上でAuthorization headerを使い、Cookie認証に伴うCSRFを避ける。OWASP Session Managementの要点であるセッションIDの保護、TLS、サーバー側検証、ログアウトのセッション失効と整合する。ただしClerk側のセッション運用と本番domain設定はClerk Dashboard上で別途確認する。

Worker wrapperは公式`@clerk/backend`の`verifyToken()`で署名、期限、許可Origin (`azp`) を検証する。失敗時はfail closedで401を返す。成功後に外部の`X-Go-Tickets-Authenticated-User`値を削除し、JWTの`sub`を設定してGoへ渡す。Go handlerはこのヘッダーからUser IDを得るため、本文中の`user_id`は受け付けない。

Public Workerは申込・キャンセルを認証必須とする。Admin WorkerはJWT検証に加え、D1の`administrators` tableを照会して管理者のみ状況APIを許可する。一般ユーザーは403、未認証は401である。Admin Workerは`workers_dev:false`かつroute未設定で、Public WorkerのService Binding経由でのみ到達できる設定とする。認証をCloudflare上で検証するまではPublicの公開routeも有効にしない。

管理者を追加する公開APIは提供しない。運用者がCloudflare D1からClerk User IDを直接登録する。一般のユーザーIDと管理者IDの2権限だけを持つ。

## Go WasmとD1

標準Go `net/http`を第一候補にし、`github.com/syumai/workers-go`のD1 Binding connectorを通じて`database/sql`を利用する。アプリケーションの通常のDBアクセスにD1管理REST APIは使わない。PublicとAdminは同一D1を使う。

`backend/migrations/0001_init.sql`で`events`、`ticket_types`、`registrations`を作り、`0002_administrators.sql`で管理者一覧を追加する。申込は単一INSERTがtriggerを起動し、残席の条件付き更新が0件なら同じ文をrollbackする。`(ticket_type_id,user_id)` unique制約で重複を拒否する。キャンセルは単一UPDATEとtriggerで残席を回復する。`workers-go`のD1 connectorは`BeginTx`が未実装のため、複数SQL文のトランザクションではなく単一SQL statement内で整合性を保つ。

## 技術上の制約

- 標準Go 1.26.7と`GOOS=js GOARCH=wasm`を使い、TinyGoへは切り替えていない。
- Clerk Backend SDKはCloudflare Worker wrapperへbundleし、Go Wasmは認証済みID以降の認可とビジネスロジックを担当する。
- `frontend/`の画面資産は`backend/build/web`として別配信し、Wasmへ含めない。
- D1 triggerはSQLite互換の原子処理を利用する。Workers上での高負荷並行アクセス時の実挙動はCloudflare上の統合試験で再確認する。
