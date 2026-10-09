import { useEffect, useState } from "react";
import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";

interface TicketType {
  id: number;
  name: string;
}
interface MyRegistration {
  ticket_type_id: number;
  event_name: string;
  ticket_name: string;
  status: "active" | "cancelled";
}

async function clerkKey(): Promise<string> {
  const response = await fetch("/api/auth/config");
  if (!response.ok) throw new Error(`認証設定を取得できません (${response.status})`);
  const config: { publishableKey: string } = await response.json();
  return config.publishableKey;
}

export function ClerkIsland() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pathname, setPathname] = useState("");
  useEffect(() => {
    let active = true;
    void clerkKey()
      .then((value) => active && setKey(value))
      .catch((cause: Error) => active && setError(cause.message));
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

function AuthenticatedContent() {
  const [pathname, setPathname] = useState("");
  const { isLoaded, isSignedIn } = useAuth();
  const mode = pathname === "/tickets" ? "tickets" : "event";
  const eventId = Number(pathname.match(/^\/events\/(\d+)\/?$/)?.[1] ?? 0);
  const [ticketTypesForEvent, setTicketTypesForEvent] = useState<{
    eventId: number;
    ticketTypes: TicketType[];
  }>({ eventId: 0, ticketTypes: [] });
  const ticketTypes =
    ticketTypesForEvent.eventId === eventId ? ticketTypesForEvent.ticketTypes : [];
  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    onPageLoad();
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);
  useEffect(() => {
    if (mode !== "event" || !eventId) return;
    let active = true;
    void fetch(`/api/events/${eventId}`)
      .then(async (response) => {
        if (!response.ok) return;
        const event: { ticket_types: TicketType[] } = await response.json();
        if (active) setTicketTypesForEvent({ eventId, ticketTypes: event.ticket_types });
      })
      .catch(() => {});
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
      <Card>
        <CardContent>
          <div data-testid="public-sign-in">
            <SignIn routing="hash" />
          </div>
        </CardContent>
      </Card>
    );
  return <TicketActions mode={mode} eventId={eventId} ticketTypes={ticketTypes} />;
}

function TicketActions({
  mode,
  eventId,
  ticketTypes,
}: {
  mode: "tickets" | "event";
  eventId: number;
  ticketTypes: TicketType[];
}) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [items, setItems] = useState<MyRegistration[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const userName = user?.username || user?.fullName || user?.firstName || "ユーザー";

  useEffect(() => {
    if (mode !== "tickets") return;
    void getToken()
      .then(async (token) => {
        if (!token) return;
        const response = await fetch("/api/registrations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) setItems(await response.json());
        else setMessage(`申込を取得できません (${response.status})`);
      })
      .catch((cause: Error) => setMessage(cause.message));
  }, [getToken, mode]);

  async function register(action: "register" | "cancel", ticketTypeId = eventId) {
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(
        action === "register" ? "/api/registrations" : "/api/registrations/cancel",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_type_id: ticketTypeId }),
        },
      );
      const result: { error?: string; status?: string } = await response.json();
      setMessage(
        response.ok
          ? (result.status ?? "完了しました")
          : `${response.status}: ${result.error ?? "request_failed"}`,
      );
      await refreshTickets(response.ok && mode === "tickets", token, setItems);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <Card>
        <CardContent>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <Badge>ログイン中</Badge>
            <span>{userName}</span>
            <UserButton />
          </div>
          {mode === "event" && (
            <RegisterButtons tickets={ticketTypes} busy={busy} register={register} />
          )}
          {mode === "tickets" && <RegistrationList items={items} busy={busy} register={register} />}
          <RegistrationMessage message={message} />
        </CardContent>
      </Card>
    </section>
  );
}

function RegisterButtons({
  tickets,
  busy,
  register,
}: {
  tickets: TicketType[];
  busy: boolean;
  register: (action: "register" | "cancel", ticketTypeId: number) => Promise<void>;
}) {
  return tickets.map((ticket) => (
    <Button
      style={{ margin: "0 10px 10px 0" }}
      key={ticket.id}
      disabled={busy}
      onClick={() => void register("register", ticket.id)}
    >
      {ticket.name}に申込
    </Button>
  ));
}

function RegistrationList({
  items,
  busy,
  register,
}: {
  items: MyRegistration[];
  busy: boolean;
  register: (action: "register" | "cancel", ticketTypeId: number) => Promise<void>;
}) {
  return (
    <ul className="public-ticket-list">
      {items.map((item) => (
        <li className="public-ticket-row" key={item.ticket_type_id}>
          <span>
            {item.event_name} / {item.ticket_name}
          </span>
          <Badge variant={item.status === "active" ? "default" : "secondary"}>
            {item.status === "active" ? "申込中" : "キャンセル済み"}
          </Badge>
          {item.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void register("cancel", item.ticket_type_id)}
            >
              キャンセル
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RegistrationMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert
      variant={message.includes(":") ? "destructive" : "default"}
      style={{ marginTop: 16 }}
      aria-live="polite"
    >
      {message}
    </Alert>
  );
}

async function refreshTickets(
  shouldRefresh: boolean,
  token: string | null,
  setItems: (items: MyRegistration[]) => void,
) {
  if (!shouldRefresh || !token) return;
  const response = await fetch("/api/registrations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) setItems(await response.json());
}

export function TicketAvailability({
  eventId,
  ticketTypeId,
}: {
  eventId: number;
  ticketTypeId: number;
}) {
  const [availability, setAvailability] = useState<{ capacity: number; reserved: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/events/${eventId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`残席を取得できません (${response.status})`);
        const event: { ticket_types: { id: number; capacity: number; reserved: number }[] } =
          await response.json();
        const ticket = event.ticket_types.find((item) => item.id === ticketTypeId);
        if (!ticket) throw new Error("チケット情報が見つかりません。");
        setAvailability({ capacity: ticket.capacity, reserved: ticket.reserved });
      })
      .catch((cause: Error) => setError(cause.message));
  }, [eventId, ticketTypeId]);
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!availability)
    return (
      <Badge variant="outline" aria-live="polite">
        残席を確認中…
      </Badge>
    );
  const remaining = Math.max(0, availability.capacity - availability.reserved);
  return <Badge variant={remaining > 0 ? "default" : "secondary"}>残席 {remaining}</Badge>;
}
