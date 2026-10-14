import { Result } from "@praha/byethrow";
import { useEffect, useState } from "react";
import { ClerkProvider, SignIn, useAuth, useUser } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { fetchPublicEvent } from "../../../entities/event";
import { ParticipantNameForm } from "../../../features/participant-name";
import { TicketActions, type TicketType } from "../../../features/ticket-registration";

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

async function fetchParticipantName(getToken: () => Promise<string | null>) {
  const token = await Result.try({
    try: () => getToken(),
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
  });
  if (Result.isFailure(token)) return token;

  const response = await Result.try({
    try: () => fetch("/api/profile", { headers: { Authorization: `Bearer ${token.value ?? ""}` } }),
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
  });
  if (Result.isFailure(response)) return response;
  if (!response.value.ok) {
    return Result.fail(new Error(`参加者情報を取得できません (${response.value.status})`));
  }

  return Result.try({
    try: async () => {
      const payload: { name?: string } = await response.value.json();
      return payload.name || "";
    },
    catch: (error) =>
      error instanceof Error ? error : new Error("参加者情報を取得できません", { cause: error }),
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
    const onPageLoad = () => setPathname(window.location.pathname);
    onPageLoad();
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  const needsAuth = pathname === "/tickets" || /^\/events\/\d+\/?$/.test(pathname);

  if (error) return needsAuth ? <Alert variant="destructive">{error}</Alert> : null;
  if (!key && needsAuth)
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
      <AuthenticatedContent />
    </ClerkProvider>
  );
}

// oxlint-disable-next-line complexity
function AuthenticatedContent() {
  const [pathname, setPathname] = useState("");
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const mode = pathname === "/tickets" ? "tickets" : "event";
  const eventId = Number(pathname.match(/^\/events\/(\d+)\/?$/)?.[1] ?? 0);
  const [ticketTypesForEvent, setTicketTypesForEvent] = useState<{
    eventId: number;
    ticketTypes: TicketType[];
    endsAt: string | null;
  }>({ eventId: 0, ticketTypes: [], endsAt: null });
  const ticketTypes =
    ticketTypesForEvent.eventId === eventId ? ticketTypesForEvent.ticketTypes : [];
  const eventEndsAt = ticketTypesForEvent.eventId === eventId ? ticketTypesForEvent.endsAt : null;
  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    onPageLoad();
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("needs-participant-name", isSignedIn && participantName === "");
    return () => document.body.classList.remove("needs-participant-name");
  }, [isSignedIn, participantName]);
  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    async function loadParticipant() {
      const result = await fetchParticipantName(getToken);
      if (active) setParticipantName(Result.isSuccess(result) ? result.value : "");
    }
    void loadParticipant();
    return () => {
      active = false;
    };
  }, [getToken, isSignedIn]);
  useEffect(() => {
    if (mode !== "event" || !eventId) return;
    let active = true;
    async function loadEvent() {
      const result = await fetchPublicEvent(eventId);
      if (active && Result.isSuccess(result)) {
        const event = result.value;
        setTicketTypesForEvent({ eventId, ticketTypes: event.ticket_types, endsAt: event.ends_at });
      }
    }
    void loadEvent();
    return () => {
      active = false;
    };
  }, [eventId, mode]);
  if (pathname !== "/tickets" && !/^\/events\/\d+\/?$/.test(pathname)) return null;
  if (!isLoaded)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">ログイン状態を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (!isSignedIn)
    return (
      <SignIn
        routing="hash"
        appearance={{ elements: { rootBox: "!w-full", cardBox: "!w-full" } }}
      />
    );
  if (participantName === null)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">参加者情報を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (!participantName || editingName)
    return (
      <ParticipantNameForm
        initialName={participantName || user?.fullName || user?.firstName || ""}
        onSaved={(name) => {
          setParticipantName(name);
          setEditingName(false);
        }}
      />
    );
  return (
    <TicketActions
      mode={mode}
      eventId={eventId}
      ticketTypes={ticketTypes}
      eventEndsAt={eventEndsAt}
      participantName={participantName}
      onEditName={() => setEditingName(true)}
    />
  );
}
