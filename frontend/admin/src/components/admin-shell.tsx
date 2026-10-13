import { SignIn, UserButton, useAuth } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { Card, CardContent } from "@go-tickets/ui/components/card";

export function AdminShell() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <main className="admin-main">
        <p aria-live="polite">ログイン状態を確認しています…</p>
      </main>
    );
  if (!isSignedIn)
    return (
      <main className="admin-main">
        <Card>
          <CardContent>
            <SignIn routing="hash" />
          </CardContent>
        </Card>
      </main>
    );
  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link to="/" className="admin-brand">
            Go Tickets <span>Admin</span>
          </Link>
          <nav className="admin-nav" aria-label="メインナビゲーション">
            <Link to="/" activeProps={{ "aria-current": "page" }}>
              概要
            </Link>
            <Link to="/events" activeProps={{ "aria-current": "page" }}>
              イベント
            </Link>
            <Link to="/check-in" activeProps={{ "aria-current": "page" }}>
              チェックイン
            </Link>
          </nav>
          <div className="admin-account">
            <UserButton />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
