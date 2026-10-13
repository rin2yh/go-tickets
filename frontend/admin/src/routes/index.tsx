import { createFileRoute } from "@tanstack/react-router";
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
        <h1>管理概要</h1>
      </div>
      <div className="dashboard-grid">
        <Link className="dashboard-link" to="/events">
          <Card>
            <CardHeader>
              <CardTitle>イベント管理</CardTitle>
              <CardDescription>イベント、開催情報、チケットを管理します。</CardDescription>
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
              <CardDescription>イベント当日の受付機能は準備中です。</CardDescription>
            </CardHeader>
            <CardContent>
              <span>チェックインへ →</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}
