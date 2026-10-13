import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-[34px] md:pb-[72px]">
      <div className="mb-6 flex items-center justify-between gap-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          管理概要
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link className="block text-inherit no-underline" to="/events">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <CardTitle>イベント管理</CardTitle>
              <CardDescription>イベント、開催情報、チケットを管理します。</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary">イベント一覧へ →</span>
            </CardContent>
          </Card>
        </Link>
        <Link className="block text-inherit no-underline" to="/check-in">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <CardTitle>チェックイン</CardTitle>
              <CardDescription>イベント当日の受付機能は準備中です。</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-primary">チェックインへ →</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}
