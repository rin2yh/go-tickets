# Admin の依存境界

- `main.tsx`・`app/`・`routes/` はアプリの構成層とする。
- `main.tsx`・`app/` で認証・QueryClient・Router の初期化とアプリ全体の構成を扱う。
- `pages/<slice>/` に画面の構成・取得状態の表示・画面固有のフォーム状態と Mutation を置く。
- `entities/event/` にイベント・チケット・参加者のモデル、API、Query 定義、イベントコンテキストを置く。
- 認証トークンの取得関数は API の呼び出し元から渡す。
- 依存方向は `app → pages → widgets → features → entities → shared` とする。
- 同じレイヤーの別 slice を直接参照しない。
- 他の slice または Shared の技術モジュールは `index.ts` の公開 API を経由して参照する。
- `ui/`・`api/`・`model/` の内部実装を外部へ直接 import しない。
- slice 内の参照には正規の相対パスを使い、Admin 内部の alias や計算した dynamic import を追加しない。
- URL の検証・ルート状態の解釈・リダイレクト・Outlet は `routes/` に置く。
- Entities と Shared に Clerk・Router への依存を持ち込まない。
- Shared に業務モデル・画面固有の処理を置かない。
- Shared の技術モジュールは `shared/lib/datetime/` のように用途を明示し、共用 UI は `@go-tickets/ui` の公開 API を使う。
- テストファイルは対象の実装ファイルと同じディレクトリに置く。
- ルートツリーを使う結合テストも画面実装の隣に置き、共通の認証モックと描画基盤は `test/event-page.tsx` を使う。
- widgets・features の導入や共通化は、実際の再利用と責務に基づいて判断する。
- `routeTree.gen.ts` は自動生成する。
- 境界変更時は `pnpm lint` の規則を合わせて更新し、違反を許すための lint 無効化を追加しない。

境界チェックは `eslint-plugin-boundaries` をOxlintのJavaScriptプラグインとして
`frontend/oxlint.config.ts` から適用する。新しいsliceにもFSDの依存方向、同層slice間の
依存禁止、`index.ts` 経由の公開APIを適用する。TypeScript resolverで各アプリの
`tsconfig.json` に定義したpath aliasも解決する。
