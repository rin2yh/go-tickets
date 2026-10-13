# Public フロントエンドの依存境界

- `src/pages/` は Astro のファイルベースルーティング専用とし、URL、`SiteLayout`、静的なページ構成と React Island の配置を扱う。
- `src/layouts/` は Astro 共通レイアウトを置く。ページ遷移で維持する Clerk Island もここから配置し、`client:load` と `transition:persist` を維持する。
- `src/widgets/` は画面上で独立した大きな領域を置く。イベント一覧、イベント詳細、認証状態を保つ Clerk Island は別々の widget とし、各々の UI は `ui/` に置く。Clerk Island は認証・プロフィール設定・チケット操作を組み合わせる。
- `src/features/` はユーザー操作を実現する機能を置く。Clerk 認証下で行う参加者名の設定とチケット申込・キャンセルを `participant-name/` と `ticket-registration/` に分ける。
- `src/entities/` は業務モデルとデータアクセスを置く。イベント API と短時間キャッシュは `entities/event/` に置き、他 slice からは `index.ts` の公開 API を使う。
- `src/shared/` は業務知識に依存しない技術共通処理のみを置く。現時点で必要な共有処理がないため空にしておく。
- テストは対象の slice 内で実装ファイルに近接させる。Astro の `src/pages/` と FSD の画面層が同名衝突しないよう、画面単位の React 実装を増やす場合は `src/screens/` を使う。

依存方向は `pages` / `screens` → `widgets` → `features` → `entities` → `shared` とする。各 slice は別 slice の内部ファイルを参照せず、公開 API (`index.ts`) 経由で利用する。同一レイヤーの slice 間依存は作らない。Astro ルートの相対 import は Astro の公開 entrypoint に限定する。

境界は TypeScript AST を使う `frontend/scripts/public-boundaries.mjs` で検査し、`pnpm lint` と `pnpm test` の両方から実ソースを走査する。Astro ファイルは frontmatter を TypeScript AST として解析する。TypeScript の module resolver を使い、tsconfig の alias が Public 内部へ解決される場合も検査対象にする。

React Island の境界と hydration 方針は維持する。イベント一覧とイベント詳細は従来どおり `client:only="react"`、永続化する認証 Island は `client:load` とする。
