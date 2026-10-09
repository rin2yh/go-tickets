# ADR 0002: PublicとAdminを別Workerで配信する

## Context

Publicは一般利用者向けサイト、Adminは管理画面と管理APIを提供する。管理APIは認証に加えてD1上の管理者登録を要する。両者は同じD1 databaseを利用する。

## Decision

Public WorkerとAdmin Workerを分け、それぞれの静的資産とGo APIを自身のoriginで提供する。Worker間のService Bindingは設定しない。

## Consequences

Adminの入口とAPIをPublic配信経路から分離できる。Admin画面からAPIへ同一originで接続し、Adminの認可はGo middlewareで行う。両Workerの設定・デプロイとClerk許可originを個別に管理する。
