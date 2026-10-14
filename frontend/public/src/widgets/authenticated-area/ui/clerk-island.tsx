import { Result } from "@praha/byethrow";
import { useEffect, useState } from "react";
import { ClerkProvider } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { AuthenticatedContent } from "./authenticated-content";

async function clerkKey() {
  const response = await Result.try({
    try: () => fetch("/api/auth/config"),
    catch: (error) =>
      error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`認証設定を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const config: { publishableKey: string } = await response.value.json();
      return config.publishableKey;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("認証設定を取得できません", { cause: error }),
  });
}

export function ClerkIsland() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    let active = true;
    async function loadKey() {
      const result = await clerkKey();
      if (!active) return;
      if (Result.isSuccess(result)) setKey(result.value);
      else setError(result.error.message);
    }
    void loadKey();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    updatePathname();
    document.addEventListener("astro:page-load", updatePathname);
    return () => document.removeEventListener("astro:page-load", updatePathname);
  }, []);

  const route = authenticatedRoute(pathname);
  if (error) return route ? <Alert variant="destructive">{error}</Alert> : null;
  if (!key && route)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">認証を読み込んでいます…</p>
        </CardContent>
      </Card>
    );
  if (!key) return null;

  return (
    <ClerkProvider publishableKey={key}>
      <AuthenticatedContent route={route} />
    </ClerkProvider>
  );
}

export type AuthenticatedRoute = { mode: "tickets" } | { mode: "event"; eventId: number } | null;

function authenticatedRoute(pathname: string): AuthenticatedRoute {
  if (pathname === "/tickets") return { mode: "tickets" };
  const eventId = pathname.match(/^\/events\/(\d+)\/?$/)?.[1];
  return eventId ? { mode: "event", eventId: Number(eventId) } : null;
}
