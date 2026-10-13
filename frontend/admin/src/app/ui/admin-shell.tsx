import { SignIn, UserButton, useAuth } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { Card, CardContent } from "@go-tickets/ui/components/card";

export function AdminShell() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-[34px]">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          ログイン状態を確認しています…
        </p>
      </main>
    );
  if (!isSignedIn)
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1120px] items-start justify-center px-4 py-8 md:px-6 md:py-12">
        <Card className="w-full max-w-md">
          <CardContent>
            <SignIn routing="hash" />
          </CardContent>
        </Card>
      </main>
    );
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-0 px-4 py-3 md:min-h-[68px] md:flex-nowrap md:gap-9 md:px-6 md:py-0">
          <Link
            to="/"
            className="shrink-0 text-lg font-bold tracking-tight text-foreground no-underline hover:text-foreground"
          >
            Go Tickets{" "}
            <span className="ml-1 text-xs font-semibold tracking-wide text-muted-foreground">
              Admin
            </span>
          </Link>
          <nav
            className="order-3 flex h-11 w-full items-center gap-5 overflow-x-auto md:order-none md:h-[68px] md:w-auto md:gap-6"
            aria-label="メインナビゲーション"
          >
            <Link
              to="/"
              className="flex h-full shrink-0 items-center border-b-2 border-transparent px-px pt-0.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary aria-[current=page]:border-primary aria-[current=page]:text-primary"
              activeProps={{ "aria-current": "page" }}
            >
              概要
            </Link>
            <Link
              to="/events"
              className="flex h-full shrink-0 items-center border-b-2 border-transparent px-px pt-0.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary aria-[current=page]:border-primary aria-[current=page]:text-primary"
              activeProps={{ "aria-current": "page" }}
            >
              イベント
            </Link>
            <Link
              to="/check-in"
              className="flex h-full shrink-0 items-center border-b-2 border-transparent px-px pt-0.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:border-primary hover:text-primary aria-[current=page]:border-primary aria-[current=page]:text-primary"
              activeProps={{ "aria-current": "page" }}
            >
              チェックイン
            </Link>
          </nav>
          <div className="ml-auto flex items-center pb-1 md:pb-0">
            <UserButton />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
