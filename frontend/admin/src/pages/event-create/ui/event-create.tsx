import { useAuth } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert } from "@go-tickets/ui/components/alert";
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
import { NativeSelect, NativeSelectOption } from "@go-tickets/ui/components/native-select";
import { Textarea } from "@go-tickets/ui/components/textarea";
export function Events() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [publicationStatus, setPublicationStatus] = useState<"draft" | "published">("draft");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          name,
          description,
          starts_at: toUTC(startsAt),
          ends_at: toUTC(endsAt),
          venue_name: venueName || null,
          venue_address: venueAddress || null,
          publication_status: publicationStatus,
        }),
      });
      const body: { error?: string; id?: number } = await r.json();
      if (!r.ok) throw new Error(createErrorMessage(body.error));
      if (!body.id) throw new Error("イベントを作成できません");
      await navigate({
        to: "/events/$eventId",
        params: { eventId: String(body.id) },
        search: { tab: "basic" },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center">
        <div>
          <p className="mb-2 text-sm">
            <Link className="text-muted-foreground hover:text-foreground" to="/events">
              ← イベント一覧
            </Link>
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">イベントを作成</h1>
        </div>
      </div>
      <Card className="mx-auto w-full max-w-[800px]">
        <CardHeader>
          <CardTitle>イベント情報</CardTitle>
          <CardDescription>
            公開状態はフォームで選択できます。公開する場合は、説明と開催日時の入力が必要です。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-6 sm:px-6">
          <form onSubmit={create} className="mx-auto grid w-full max-w-[720px] gap-5">
            <div className="grid gap-2">
              <Label htmlFor="event-name">イベント名</Label>
              <Input
                id="event-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="例: 春のカンファレンス"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-description">イベント説明（Markdown）</Label>
              <Textarea
                id="event-description"
                value={description}
                rows={8}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-starts-at">開催開始日時（JST）</Label>
                <Input
                  id="event-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
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
              <NativeSelect
                id="event-publication-status"
                value={publicationStatus}
                onChange={(e) =>
                  setPublicationStatus(e.target.value === "published" ? "published" : "draft")
                }
              >
                <NativeSelectOption value="draft">下書き</NativeSelectOption>
                <NativeSelectOption value="published">公開</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="pt-1">
              <Button disabled={busy}>{busy ? "作成中…" : "イベントを作成"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {error && (
        <Alert className="mx-auto mt-4 w-full max-w-[800px]" variant="destructive">
          {error}
        </Alert>
      )}
    </main>
  );
}

function toUTC(value: string) {
  return value ? new Date(`${value}+09:00`).toISOString() : null;
}

function createErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    forbidden: "管理者権限がありません",
    invalid_name: "イベント名は200文字以内で入力してください",
    description_required: "公開するイベントには説明が必要です",
    event_datetime_required: "公開するイベントには開催開始・終了日時が必要です",
    invalid_event_period: "開催終了日時は開始日時より後にしてください",
    invalid_datetime: "日時を正しく入力してください",
  };
  return (code && messages[code]) || "イベントを作成できません";
}
