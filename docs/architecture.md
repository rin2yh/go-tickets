# アーキテクチャ

## ディレクトリと実行単位

`backend/`にGo module、HTTP・D1処理、migrationをまとめる。Go Wasmのentry pointとWorker起動wrapperは`backend/cmd/public`と`backend/cmd/admin`で対にする。Clerk token検証は`backend/internal/auth`に置く。Wrangler設定はルートに置き、miseで管理するWranglerが両Workerをbuild・deployする。`frontend/`はブラウザー画面とViteの依存を管理する。

- `backend/cmd/public`: Public Go WasmとWorker起動wrapper
- `backend/cmd/admin`: Admin Go WasmとWorker起動wrapper
- `backend/internal/tickets`: 共通`net/http` handlerとD1 SQLStore
- `backend/internal/auth`: Clerk公式Go SDKによるJWT検証と認証済みUser IDのrequest context管理
- `backend/migrations`: D1 schema
- `frontend/index.html`、`frontend/app.tsx`: Clerk React SDKの標準UIと認証済みPublic APIを呼ぶ小さな画面
- `frontend/package.json`: Clerk React SDK、React、TypeScript、Vite、Oxlint、Oxfmtの依存管理。WranglerはGo側の作業でも使うためmiseで管理する。
- frontendで共通部品が必要になった場合は`frontend/packages/`へ追加する。現時点では共通部品はない。

## 認証・認可

ブラウザーでは`@clerk/react`の`ClerkProvider`、`SignIn`、`UserButton`を使う。ログイン状態、セッション更新、ログアウトはClerk React SDKに任せ、API呼び出し時に`useAuth()`からBearer tokenを取得する。ユーザー名は`useUser()`から表示し、メールアドレスは表示しない。ブラウザーの`localStorage`へ独自にtokenを保存しない。HTTPS上でAuthorization headerを使い、Cookie認証に伴うCSRFを避ける。OWASP Session Managementの要点であるセッションIDの保護、TLS、サーバー側検証、ログアウトのセッション失効と整合する。ただしClerk側のセッション運用と本番domain設定はClerk Dashboard上で別途確認する。

Goの`net/http` middlewareがClerk公式Go SDKでBearer tokenを検証する。SDKはClerk JWKS endpointから鍵を取得し、Workers GoのFetch API transportを通じて要求する。署名、発行者、期限、有効化時刻、許可Origin (`azp`) を検証し、失敗時は401を返す。User IDは検証済みJWTの`sub`からrequest contextに保存する。クライアント指定のUser ID headerやbodyは認証に使わない。JavaScript Worker層はPublic/Adminのroute振り分けとBindings連携を担当する。

Public Workerは申込・キャンセルを認証必須とする。Admin WorkerはJWT検証に加え、D1の`administrators` tableを照会して管理者のみ状況APIを許可する。一般ユーザーは403、未認証は401である。PublicからAdminへのService Bindingは持たせない。Admin Workerは`workers_dev:false`かつroute未設定のため、Cloudflare上では外部から到達できない。利用時は認証を確認したうえでAdmin用routeとアクセス制御を別途設定する。

管理者を追加する公開APIは提供しない。運用者がCloudflare D1からClerk User IDを直接登録する。一般のユーザーIDと管理者IDの2権限だけを持つ。

## Go WasmとD1

標準Go `net/http`を第一候補にし、`github.com/syumai/workers-go`のD1 Binding connectorを通じて`database/sql`を利用する。アプリケーションの通常のDBアクセスにD1管理REST APIは使わない。PublicとAdminは同一D1を使う。

`backend/migrations/0001_init.sql`で`events`、`ticket_types`、`registrations`を作り、`0002_administrators.sql`で管理者一覧を追加する。申込は単一INSERTがtriggerを起動し、残席の条件付き更新が0件なら同じ文をrollbackする。`(ticket_type_id,user_id)` unique制約で重複を拒否する。キャンセルは単一UPDATEとtriggerで残席を回復する。`workers-go`のD1 connectorは`BeginTx`が未実装のため、複数SQL文のトランザクションではなく単一SQL statement内で整合性を保つ。

## 技術上の制約

- 標準Go 1.27.1と`GOOS=js GOARCH=wasm`を使い、TinyGoへは切り替えていない。
- Clerk公式Go SDKがGo Wasm内でJWT検証を行う。JavaScript Worker層は起動とCloudflare Bindings連携に使う。
- `frontend/`はTypeScript、Vite、React Compilerでビルドする。画面資産は`backend/build/web`として別配信し、Wasmへ含めない。
- D1 triggerはSQLite互換の原子処理を利用する。Workers上での高負荷並行アクセス時の実挙動はCloudflare上の統合試験で再確認する。
