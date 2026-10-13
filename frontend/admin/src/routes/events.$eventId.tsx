import { useAuth } from "@clerk/react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { Button } from "@go-tickets/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@go-tickets/ui/components/card";
import { Input } from "@go-tickets/ui/components/input";
import { Label } from "@go-tickets/ui/components/label";
interface TicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
}
interface Event {
  id: number;
  name: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  publication_status: "draft" | "published";
  ticket_types: TicketType[];
}
export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
  }),
  component: EventPage,
});
// oxlint-disable-next-line complexity
function EventPage() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();
  const isRegistrationPage = useRouterState({
    select: (s) => s.matches.some((match) => match.routeId.endsWith("/registrations")),
  });
  const { getToken } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [publicationStatus, setPublicationStatus] = useState<"draft" | "published">("draft");
  const [newName, setNewName] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [newRegistrationStarts, setNewRegistrationStarts] = useState("");
  const [newRegistrationEnds, setNewRegistrationEnds] = useState("");
  const [editing, setEditing] = useState<
    Record<number, { name: string; capacity: string; starts: string; ends: string }>
  >({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isRegistrationPage) return;
    void getToken()
      .then(async (token) => {
        const response = await fetch(`/api/admin/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!response.ok) throw new Error("イベントを読み込めません");
        const item: Event = await response.json();
        setEvent(item);
        setEventName(item.name);
        setDescription(item.description);
        setStartsAt(toLocal(item.starts_at));
        setEndsAt(toLocal(item.ends_at));
        setVenueName(item.venue_name ?? "");
        setVenueAddress(item.venue_address ?? "");
        setPublicationStatus(item.publication_status);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [eventId, getToken, isRegistrationPage]);
  if (isRegistrationPage) return <Outlet />;
  async function save(path: string, method: string, body: Record<string, string | number | null>) {
    setBusy(true);
    setError("");
    setNotice("");
    setRefreshWarning("");
    try {
      const token = await getToken();
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(saveErrorMessage(result.error));

      setNotice("変更を保存しました。");
      try {
        const latestResponse = await fetch(`/api/admin/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!latestResponse.ok) throw new Error("イベント情報を再取得できません");
        setEvent(await latestResponse.json());
      } catch {
        setRefreshWarning(
          "変更は保存されましたが、最新情報を再取得できませんでした。画面を更新して確認してください。",
        );
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!event && !error)
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p aria-live="polite">イベントを読み込み中です。</p>
      </main>
    );
  if (!event)
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <Alert variant="destructive">イベントが見つかりません。</Alert>
        <p>
          <Link to="/events">イベント一覧へ</Link>
        </p>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
      <p className="mb-4 text-sm">
        <Link to="/events">← イベント一覧</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {event.name}
            </h1>
            <Badge variant={event.publication_status === "published" ? "default" : "secondary"}>
              {event.publication_status === "published" ? "公開中" : "下書き"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {event.starts_at ? formatJST(event.starts_at) : "開催日時未設定"}
          </p>
        </div>
      </div>
      <nav
        className="mb-7 flex gap-6 overflow-x-auto border-b border-border"
        aria-label="イベント内ナビゲーション"
      >
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          search={{ tab: "basic" }}
          activeOptions={{ exact: true }}
          className={
            tab === "basic" && !isRegistrationPage
              ? "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary"
              : "shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          基本情報
        </Link>
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          search={{ tab: "tickets" }}
          activeOptions={{ exact: true }}
          className={
            tab === "tickets" && !isRegistrationPage
              ? "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary"
              : "shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          チケット設定
        </Link>
        <Link
          to="/events/$eventId/registrations"
          params={{ eventId }}
          search={{ tab: "basic", status: "active", ticket: "all", page: 1 }}
          activeOptions={{ exact: true }}
          className={
            isRegistrationPage
              ? "shrink-0 border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary"
              : "shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          参加者
        </Link>
      </nav>
      {tab === "basic" && (
        <>
          <Card className="mx-auto w-full max-w-3xl">
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
              <CardDescription>
                下書きは未入力項目を保存できます。公開時には開催日時と説明が必要です。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="mx-auto grid w-full max-w-[720px] gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(`/api/events/${event.id}`, "PUT", {
                    name: eventName,
                    description,
                    starts_at: toUTC(startsAt),
                    ends_at: toUTC(endsAt),
                    venue_name: venueName,
                    venue_address: venueAddress,
                    publication_status: publicationStatus,
                  });
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="event-name">イベント名</Label>
                  <Input
                    id="event-name"
                    value={eventName}
                    maxLength={200}
                    required
                    onChange={(e) => setEventName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-description">イベント説明（Markdown）</Label>
                  <textarea
                    id="event-description"
                    value={description}
                    className="min-h-[300px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="event-starts-at">開催開始日時（JST）</Label>
                    <Input
                      id="event-starts-at"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="event-ends-at">開催終了日時（JST）</Label>
                    <Input
                      id="event-ends-at"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-venue-name">会場名</Label>
                  <Input
                    id="event-venue-name"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-venue-address">会場住所</Label>
                  <Input
                    id="event-venue-address"
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="event-publication-status">公開状態</Label>
                  <select
                    id="event-publication-status"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={publicationStatus}
                    onChange={(e) =>
                      setPublicationStatus(e.target.value === "published" ? "published" : "draft")
                    }
                  >
                    <option value="draft">下書き</option>
                    <option value="published">公開</option>
                  </select>
                </div>
                <div className="pt-1">
                  <Button disabled={busy}>イベントを保存</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
      {tab === "tickets" && (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">チケット種別</h2>
            <Badge variant="secondary">{event.ticket_types.length} 件</Badge>
          </div>
          {event.ticket_types.length === 0 && (
            <Card className="mb-4">
              <CardContent>
                <p className="text-sm text-muted-foreground">チケット種別はありません。</p>
              </CardContent>
            </Card>
          )}
          <div className="space-y-4">
            {event.ticket_types.map((t) => {
              const value = editing[t.id] ?? {
                name: t.name,
                capacity: String(t.capacity),
                starts: toLocal(t.registration_starts_at),
                ends: toLocal(t.registration_ends_at),
              };
              return (
                <form
                  key={t.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(`/api/ticket-types/${t.id}`, "PUT", {
                      name: value.name,
                      capacity: Number(value.capacity),
                      registration_starts_at: toUTC(value.starts),
                      registration_ends_at: toUTC(value.ends),
                    });
                  }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>{t.name}</CardTitle>
                      <CardDescription>
                        申込済み {t.reserved} 件 / 定員 {t.capacity} 件
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mx-auto grid w-full max-w-[720px] gap-5">
                        <div className="grid gap-2">
                          <Label htmlFor={`ticket-name-${t.id}`}>種別名</Label>
                          <Input
                            id={`ticket-name-${t.id}`}
                            value={value.name}
                            maxLength={200}
                            required
                            onChange={(e) =>
                              setEditing({ ...editing, [t.id]: { ...value, name: e.target.value } })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`ticket-capacity-${t.id}`}>定員</Label>
                          <Input
                            id={`ticket-capacity-${t.id}`}
                            type="number"
                            min={t.reserved}
                            step="1"
                            value={value.capacity}
                            required
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [t.id]: { ...value, capacity: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-5 md:grid-cols-2">
                          <div className="grid min-w-0 gap-2">
                            <Label htmlFor={`ticket-starts-${t.id}`}>受付開始日時（JST）</Label>
                            <Input
                              id={`ticket-starts-${t.id}`}
                              type="datetime-local"
                              value={value.starts}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [t.id]: { ...value, starts: e.target.value },
                                })
                              }
                            />
                          </div>
                          <div className="grid min-w-0 gap-2">
                            <Label htmlFor={`ticket-ends-${t.id}`}>受付終了日時（JST）</Label>
                            <Input
                              id={`ticket-ends-${t.id}`}
                              type="datetime-local"
                              value={value.ends}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [t.id]: { ...value, ends: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="pt-1">
                          <Button disabled={busy}>保存</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              );
            })}
          </div>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>チケット種別を追加</CardTitle>
              <CardDescription>販売するチケットの名前と定員を設定します。</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="mx-auto grid w-full max-w-[720px] gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(`/api/events/${event.id}/ticket-types`, "POST", {
                    name: newName,
                    capacity: Number(capacity),
                    registration_starts_at: toUTC(newRegistrationStarts),
                    registration_ends_at: toUTC(newRegistrationEnds),
                  }).then((ok) => {
                    if (ok) {
                      setNewName("");
                      setCapacity("0");
                      setNewRegistrationStarts("");
                      setNewRegistrationEnds("");
                    }
                  });
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="new-ticket-name">種別名</Label>
                  <Input
                    id="new-ticket-name"
                    value={newName}
                    maxLength={200}
                    required
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="new-ticket-starts">受付開始日時（JST）</Label>
                    <Input
                      id="new-ticket-starts"
                      type="datetime-local"
                      value={newRegistrationStarts}
                      onChange={(e) => setNewRegistrationStarts(e.target.value)}
                    />
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor="new-ticket-ends">受付終了日時（JST）</Label>
                    <Input
                      id="new-ticket-ends"
                      type="datetime-local"
                      value={newRegistrationEnds}
                      onChange={(e) => setNewRegistrationEnds(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-ticket-capacity">定員</Label>
                  <Input
                    id="new-ticket-capacity"
                    type="number"
                    min="0"
                    step="1"
                    value={capacity}
                    required
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
                <div className="pt-1">
                  <Button disabled={busy}>種別を作成</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
      {error && (
        <Alert className="mt-4" variant="destructive">
          {error}
        </Alert>
      )}
      {notice && (
        <p className="mt-4 text-sm font-medium text-primary" role="status">
          {notice}
        </p>
      )}
      {refreshWarning && (
        <Alert className="mt-4" variant="destructive" role="alert">
          {refreshWarning}
        </Alert>
      )}
    </main>
  );
}

function formatJST(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function toLocal(value: string | null) {
  return value
    ? new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
    : "";
}
function toUTC(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}
function saveErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    forbidden: "管理者権限がありません",
    capacity_below_reserved_or_invalid_event: "申込済み数を下回る定員には変更できません",
    invalid_event_period: "開催終了日時は開始日時より後にしてください",
    invalid_datetime: "日時を正しく入力してください",
    description_required: "公開するイベントには説明が必要です",
    event_datetime_required: "公開するイベントには開催開始・終了日時が必要です",
    invalid_publication_status: "公開状態を選択してください",
    invalid_ticket_type: "チケット名・定員・受付期間を確認してください",
    ticket_registration_period_required: "公開前に各チケットの受付開始・終了日時を設定してください",
    invalid_registration_period: "受付終了日時は受付開始日時より後にしてください",
  };
  return (code && messages[code]) || "保存できませんでした";
}
