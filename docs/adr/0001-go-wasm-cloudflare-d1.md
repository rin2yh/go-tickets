# ADR 0001: Go Wasm、Cloudflare Workers、D1を使う

## Context

チケットサイトのAPIはGoで実装し、Cloudflare Workers上でPublic/Adminの画面と共に提供する。永続データにはCloudflare D1を使い、両Workerが同じdatabaseを参照する。Workers用Go runtimeでは`database/sql`の複数statement transactionを利用できない。

## Decision

APIをGo WasmとしてWorkersで実行し、永続データをD1に置く。WorkerごとにGo APIとStatic Assetsを配信する。

## Consequences

GoのAPIロジックを維持しながらWorkersとD1を使える。DB更新は複数statement transactionに依存できず、予約の整合性は単一statementとD1制約・triggerで実現する。
