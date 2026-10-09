import { SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

export function AdminStatus() {
  const { getToken } = useAuth();
  const [result, setResult] = useState("未取得");
  useEffect(() => {
    let active = true;
    void getToken()
      .then(async (token) => {
        const response = await fetch("/api/ticket-types/1/status", {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        const body: { error?: string; capacity?: number; reserved?: number } =
          await response.json();
        if (active)
          setResult(
            response.status === 403
              ? "403: 管理者権限がありません"
              : response.ok
                ? `定員 ${body.capacity}、申込 ${body.reserved}`
                : `${response.status}: ${body.error ?? "request_failed"}`,
          );
      })
      .catch((error: Error) => active && setResult(error.message));
    return () => {
      active = false;
    };
  }, [getToken]);
  return <p aria-live="polite">申込状況: {result}</p>;
}
