# ADR 0004: D1 triggerで予約数を整合させる

## Context

予約作成は残席の消費と申込レコードの作成を一体として扱う必要がある。一方、Workers用Go D1 driverでは`database/sql`の複数statement transactionが未実装である。

## Decision

単一の申込INSERTを起点にD1 triggerで公開状態・受付期間・開催終了時刻を検証し、残席を条件付き更新する。条件を満たさない申込や残席がない場合はstatementをabortする。キャンセル時もtriggerで残席を戻し、ticket typeとuserの組み合わせにはunique制約を置く。

## Consequences

受付条件の検査・残席更新・申込結果は同じSQL statementの成否に従い、アプリケーション側の複数statement transactionを必要としない。予約数の整合性はmigration内のtriggerと制約に依存するため、これらの変更は予約処理の振る舞いに影響する。
