# ADR 0003: Publicのイベント情報を実行時に取得する

## Context

Astroは静的出力であり、イベントデータはD1に保存される。イベントの追加・変更をPublicの再ビルドなしに画面へ反映する必要がある。

## Decision

Astroでページ外枠を静的配信し、React IslandsがPublic Go APIからイベント一覧・詳細を取得する（CSR）。ビルド時にD1を読み込んでイベント内容をHTMLへ焼き込まない。

## Consequences

D1の変更が次のAPI読み取りから反映され、Public再ビルドは不要。イベント内容はJavaScript実行後に表示され、未知のイベントIDはAPIの404で判定する。
