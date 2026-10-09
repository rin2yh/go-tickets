import { SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";

export function AdminShell() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  if (!isLoaded) return <p aria-live="polite">ログイン状態を確認しています</p>;
  if (!isSignedIn) return <SignIn routing="hash" />;
  const name = user?.username || user?.fullName || user?.firstName || "ユーザー";
  return (
    <>
      <header>
        <h1>Go Tickets Admin</h1>
        <p>ログイン中: {name}</p>
        <UserButton />
      </header>
      <nav>
        <Link to="/">概要</Link> | <Link to="/events">イベント</Link> |{" "}
        <Link to="/check-in">チェックイン</Link>
      </nav>
      <Outlet />
    </>
  );
}
