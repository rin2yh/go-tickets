import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@go-tickets/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";
export const Route = createFileRoute("/check-in")({ component: CheckIn });
function CheckIn() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-[34px] md:pb-[72px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          チェックイン
        </h1>
        <Badge variant="outline">準備中</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>受付ツール</CardTitle>
          <CardDescription>イベント当日の参加者受付を行う画面です。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            チェックイン機能は現在準備中です。受付APIが利用可能になると、参加者の検索と受付状況の更新ができるようになります。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
