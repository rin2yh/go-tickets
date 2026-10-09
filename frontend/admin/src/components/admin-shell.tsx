import { SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { Card, CardContent } from "@go-tickets/ui/components/card";

export function AdminShell() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
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
  const name = user?.username || user?.fullName || user?.firstName || "ユーザー";
  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <Link to="/" className="admin-brand">
          Go Tickets <span style={{ color: "#71917d", fontWeight: 500 }}>管理</span>
        </Link>
        <div className="admin-account">
          <span>ログイン中: {name}</span>
          <UserButton />
        </div>
      </header>
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
      <Outlet />
    </div>
  );
}
