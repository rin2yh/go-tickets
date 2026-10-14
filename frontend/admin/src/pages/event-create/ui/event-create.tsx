import { useAuth } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Result } from "@praha/byethrow";
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
import { toUTC } from "../../../shared/lib/datetime";
import { createEvent } from "../../../entities/event";
interface EventForm {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  publicationStatus: "draft" | "published";
}

export function Events() {
  const { form, update, error, busy, create } = useEventCreation();

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
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={200}
                placeholder="例: 春のカンファレンス"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-description">イベント説明（Markdown）</Label>
              <Textarea
                id="event-description"
                value={form.description}
                rows={8}
                onChange={(e) => update("description", e.target.value)}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-starts-at">開催開始日時（JST）</Label>
                <Input
                  id="event-starts-at"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => update("startsAt", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-ends-at">開催終了日時（JST）</Label>
                <Input
                  id="event-ends-at"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => update("endsAt", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-venue-name">会場名</Label>
              <Input
                id="event-venue-name"
                value={form.venueName}
                onChange={(e) => update("venueName", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-venue-address">会場住所</Label>
              <Input
                id="event-venue-address"
                value={form.venueAddress}
                onChange={(e) => update("venueAddress", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-publication-status">公開状態</Label>
              <NativeSelect
                id="event-publication-status"
                value={form.publicationStatus}
                onChange={(e) =>
                  update(
                    "publicationStatus",
                    e.target.value === "published" ? "published" : "draft",
                  )
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

function useEventCreation() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<EventForm>({
    name: "",
    description: "",
    startsAt: "",
    endsAt: "",
    venueName: "",
    venueAddress: "",
    publicationStatus: "draft",
  });
  const update = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const created = await createEvent(getToken, {
      name: form.name,
      description: form.description,
      starts_at: toUTC(form.startsAt),
      ends_at: toUTC(form.endsAt),
      venue_name: form.venueName || null,
      venue_address: form.venueAddress || null,
      publication_status: form.publicationStatus,
    });
    if (Result.isFailure(created)) {
      setError(created.error.message);
      setBusy(false);
      return;
    }
    const navigation = await Result.try({
      try: () =>
        navigate({
          to: "/events/$eventId",
          params: { eventId: String(created.value) },
          search: { tab: "basic", status: "active", ticket: "all", page: 1 },
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error("画面を開けません", { cause })),
    });
    if (Result.isFailure(navigation)) setError(navigation.error.message);
    setBusy(false);
  }
  return { form, update, error, busy, create };
}
