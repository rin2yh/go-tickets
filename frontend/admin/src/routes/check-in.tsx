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
    <main className="admin-main">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">ON-SITE</p>
          <h1>チェックイン</h1>
        </div>
        <Badge variant="outline">準備中</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>受付ツール</CardTitle>
          <CardDescription>イベント当日の参加者受付を行う画面です。</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            チェックイン機能は現在準備中です。受付APIが利用可能になると、参加者の検索と受付状況の更新ができるようになります。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
