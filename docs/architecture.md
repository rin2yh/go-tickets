# アーキテクチャ

## Workerの構成

PublicとAdminは別々のGo Wasm Workerであり、`cmd/public`と`cmd/admin`がそれぞれのエントリーポイントである。共通のHTTP処理とSQLアクセスは`internal/tickets`に置く。Workerごとに独立してビルド・デプロイするが、同じCloudflare D1データベースを参照する。

`scripts/build.sh`が`workers-go`のWasm起動資産を生成し、その後GoコンパイラでWorkerのWasmをビルドする。Cloudflare Bindingを使うJavaScriptは起動資産内に限られ、アプリケーションのAPIとビジネスロジックはGoの`net/http`で実装する。

## D1と申込処理

D1 Bindingには`workers-go/cloudflare/d1`を通じて`database/sql`から接続する。通常のDBアクセスにD1管理REST APIは使わない。スキーマは`migrations/0001_init.sql`で管理する。

申込は`registrations`への単一INSERTで行う。`registration_reserve` triggerが残席数を条件付きで更新し、定員到達時は同じ文をロールバックする。`(ticket_type_id, user_id)`のUNIQUE制約で重複申込を拒否する。キャンセルは有効申込のstatusを更新し、`registration_cancel` triggerが残席を回復する。

`workers-go`のD1ドライバーは`database/sql`の`BeginTx`を実装していない。そのため複数文のトランザクションではなく、単一文とSQLite triggerで定員更新と申込記録の整合性を保つ。

## APIと現在の認証状態

Publicは`GET /health`、`POST /registrations`、`POST /registrations/cancel`を提供する。申込とキャンセルは`ticket_type_id`と`user_id`を本文に求め、形式不正は400、定員到達と重複は409、キャンセル対象なしは404、DBエラーは500を返す。Adminは`GET /health`とPoCでticket type ID 1に限定した`GET /ticket-types/1/status`を提供する。現行コードにはClerk認証・管理者認可はまだ実装されていない。申込・キャンセルAPIはリクエスト本文の`user_id`を使い、Adminの状況APIもアプリケーション層では認証しない。

Cloudflare設定ではPublicとAdminの両方で`workers_dev`と`preview_urls`を無効にし、ルートも設定していない。このためWorkerはアップロード済みだが、外部からAPIを呼び出せる公開経路はない。この設定は認証の代替ではない。公開ルートを設定する前にClerkによるトークン検証とAdmin認可を実装する必要がある。

## 技術選定上の制約

- 標準Go 1.26.7を利用する。ローカルでGo Wasmが動作し、WasmサイズもWorkersのサイズ制限内であるため、TinyGoとの比較は行っていない。
- 元の`github.com/syumai/workers`は移行先として`github.com/syumai/workers-go`を案内しているため、現行モジュールを使用する。
- `workers-go`のD1対応はalphaである。特に`BeginTx`が未実装で、D1ドライバーは`js/wasm`向けである。Workerエントリーポイントはビルドタグで分け、通常の`go test ./...`を可能にしている。
- ローカル統合時は`wrangler.local.jsonc`と`scripts/router.mjs`を使い、2 Workerを1つのWrangler開発プロセス内で動かす。別プロセスから同じローカルD1を同時使用すると`SQLITE_BUSY_RECOVERY`が発生した。
- Clerk認証・管理者情報テーブル・Clerk対応フロントエンドは現状未実装である。
- キャンセル済み申込もUNIQUE制約の対象として残るため、同じユーザーの同一チケット種別への再申込は現行PoCではできない。
