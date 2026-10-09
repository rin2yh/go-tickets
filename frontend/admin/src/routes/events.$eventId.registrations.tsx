import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@go-tickets/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";
export const Route = createFileRoute("/events/$eventId/registrations")({
  component: Registrations,
});
function Registrations() {
  const { eventId } = Route.useParams();
  return (
    <main className="admin-main">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">REGISTRATIONS</p>
          <h1>申込状況</h1>
        </div>
        <Badge variant="outline">イベント {eventId}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>参加者一覧</CardTitle>
          <CardDescription>申込情報と参加状況を確認できます。</CardDescription>
        </CardHeader>
        <CardContent>
          <p>申込一覧機能は現在準備中です。</p>
        </CardContent>
      </Card>
    </main>
  );
}
