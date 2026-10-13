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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pathname.endsWith("/registrations")) return;
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
  }, [eventId, getToken, pathname]);
  if (pathname.endsWith("/registrations")) return <Outlet />;
  async function save(path: string, method: string, body: Record<string, string | number | null>) {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const result: { error?: string } = await r.json();
      if (!r.ok) throw new Error(saveErrorMessage(result.error));
      const response = await fetch(`/api/admin/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (response.ok) setEvent(await response.json());
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
      <main className="admin-main">
        <p aria-live="polite">イベントを読み込み中です。</p>
      </main>
    );
  if (!event)
    return (
      <main className="admin-main">
        <Alert variant="destructive">イベントが見つかりません。</Alert>
        <p>
          <Link to="/events">イベント一覧へ</Link>
        </p>
      </main>
    );
  return (
    <main className="admin-main">
      <p>
        <Link to="/events">← イベント一覧</Link>
      </p>
      <div className="page-heading">
        <div>
          <h1>{event.name}</h1>
          <p className="event-meta">
            <Badge variant="outline">
              {event.publication_status === "published" ? "公開中" : "下書き"}
            </Badge>
            {event.starts_at ? formatJST(event.starts_at) : "開催日時未設定"}
          </p>
        </div>
      </div>
      <nav className="event-tabs" aria-label="イベント内ナビゲーション">
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          search={{ tab: "basic" }}
          className={tab === "basic" ? "active" : ""}
        >
          基本情報
        </Link>
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          search={{ tab: "tickets" }}
          className={tab === "tickets" ? "active" : ""}
        >
          チケット設定
        </Link>
        <Link
          to="/events/$eventId/registrations"
          params={{ eventId }}
          search={{ tab: "basic", status: "active", ticket: "all", page: 1 }}
          className=""
        >
          参加者
        </Link>
      </nav>
      {tab === "basic" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
              <CardDescription>
                下書きは未入力項目を保存できます。公開時には開催日時と説明が必要です。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="form-stack"
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
                <Label>
                  イベント名
                  <Input
                    value={eventName}
                    maxLength={200}
                    required
                    onChange={(e) => setEventName(e.target.value)}
                  />
                </Label>
                <Label>
                  イベント説明（Markdown）
                  <textarea
                    aria-label="イベント説明（Markdown）"
                    value={description}
                    rows={8}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Label>
                <Label>
                  開催開始日時（JST）
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </Label>
                <Label>
                  開催終了日時（JST）
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </Label>
                <Label>
                  会場名
                  <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} />
                </Label>
                <Label>
                  会場住所
                  <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
                </Label>
                <Label>
                  公開状態
                  <select
                    aria-label="公開状態"
                    value={publicationStatus}
                    onChange={(e) =>
                      setPublicationStatus(e.target.value === "published" ? "published" : "draft")
                    }
                  >
                    <option value="draft">下書き</option>
                    <option value="published">公開</option>
                  </select>
                </Label>
                <div>
                  <Button disabled={busy}>イベントを保存</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
      {tab === "tickets" && (
        <>
          <div className="page-heading" style={{ marginTop: 38 }}>
            <div>
              <p className="page-eyebrow">TICKETS</p>
              <h2>チケット種別</h2>
            </div>
            <Badge variant="secondary">{event.ticket_types.length} 件</Badge>
          </div>
          {event.ticket_types.length === 0 && (
            <Card>
              <CardContent>
                <p>チケット種別はありません。</p>
              </CardContent>
            </Card>
          )}
          <div className="ticket-grid">
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
                      <div className="ticket-form">
                        <Label>
                          種別名
                          <Input
                            value={value.name}
                            maxLength={200}
                            required
                            onChange={(e) =>
                              setEditing({ ...editing, [t.id]: { ...value, name: e.target.value } })
                            }
                          />
                        </Label>
                        <Label>
                          定員
                          <Input
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
                        </Label>
                        <Label>
                          受付開始日時（JST）
                          <Input
                            type="datetime-local"
                            value={value.starts}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [t.id]: { ...value, starts: e.target.value },
                              })
                            }
                          />
                        </Label>
                        <Label>
                          受付終了日時（JST）
                          <Input
                            type="datetime-local"
                            value={value.ends}
                            onChange={(e) =>
                              setEditing({ ...editing, [t.id]: { ...value, ends: e.target.value } })
                            }
                          />
                        </Label>
                        <Button disabled={busy}>保存</Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              );
            })}
          </div>
          <Card style={{ marginTop: 20 }}>
            <CardHeader>
              <CardTitle>チケット種別を追加</CardTitle>
              <CardDescription>販売するチケットの名前と定員を設定します。</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="ticket-form"
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
                <Label>
                  種別名
                  <Input
                    value={newName}
                    maxLength={200}
                    required
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </Label>
                <Label>
                  受付開始日時（JST）
                  <Input
                    type="datetime-local"
                    value={newRegistrationStarts}
                    onChange={(e) => setNewRegistrationStarts(e.target.value)}
                  />
                </Label>
                <Label>
                  受付終了日時（JST）
                  <Input
                    type="datetime-local"
                    value={newRegistrationEnds}
                    onChange={(e) => setNewRegistrationEnds(e.target.value)}
                  />
                </Label>
                <Label>
                  定員
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={capacity}
                    required
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </Label>
                <Button disabled={busy}>種別を作成</Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
      {error && (
        <Alert variant="destructive" style={{ marginTop: 16 }}>
          {error}
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
