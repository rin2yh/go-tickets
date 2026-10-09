import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@go-tickets/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main className="admin-main">
      <div className="page-heading">
        <div>
          <p className="page-eyebrow">DASHBOARD</p>
          <h1>管理概要</h1>
        </div>
        <Badge>イベント運営</Badge>
      </div>
      <div className="dashboard-grid">
        <Link className="dashboard-link" to="/events">
          <Card>
            <CardHeader>
              <CardTitle>イベント管理</CardTitle>
              <CardDescription>イベントやチケットの情報を作成・編集します。</CardDescription>
            </CardHeader>
            <CardContent>
              <span>イベント一覧へ →</span>
            </CardContent>
          </Card>
        </Link>
        <Link className="dashboard-link" to="/check-in">
          <Card>
            <CardHeader>
              <CardTitle>チェックイン</CardTitle>
              <CardDescription>会場での受付と参加者確認を行います。</CardDescription>
            </CardHeader>
            <CardContent>
              <span>チェックインへ →</span>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>運営を始めましょう</CardTitle>
            <CardDescription>
              イベントを登録すると、参加者向けのイベント一覧に表示されます。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
