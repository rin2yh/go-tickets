# Admin の依存境界

- `main.tsx`・`routes/` はアプリの初期化と構成を担う。`app/` は独立した責務が必要な場合のみ使う。
- `pages/<slice>/` に画面の構成・取得状態の表示・画面固有のフォーム状態と Mutation を置く。
- `entities/event/` にイベント・チケット・参加者のモデル、API、Query 定義、イベントコンテキストを置く。
- 認証トークンの取得関数は API の呼び出し元から渡す。
- 計算された dynamic import は追加しない。現在の Oxlint 標準ルールでは検証できないため、静的に解析できる import を使う。
- URL の検証・ルート状態の解釈・リダイレクト・Outlet は `routes/` に置く。
- Shared に業務モデル・画面固有の処理を置かない。
- Shared の技術モジュールは `shared/lib/datetime/` のように用途を明示し、共用 UI は `@go-tickets/ui` の公開 API を使う。
- テストファイルは対象の実装ファイルと同じディレクトリに置く。
- ルートツリーを使う結合テストも画面実装の隣に置き、共通の認証モックと描画基盤は `test/event-page.tsx` を使う。
- widgets・features の導入や共通化は、実際の再利用と責務に基づいて判断する。
- `routeTree.gen.ts` は自動生成する。
- Oxlint のルールは無効化しない。
