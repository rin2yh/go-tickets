import { useAuth } from "@clerk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import {
  eventQueryKey,
  refreshEvent,
  saveEventChange,
  toLocal,
  toUTC,
  useEvent,
} from "./events.$eventId";

interface BasicForm {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  publicationStatus: "draft" | "published";
}

export const Route = createFileRoute("/events/$eventId/")({ component: BasicInformation });

function BasicInformation() {
  const event = useEvent();
  const { eventId } = Route.useParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BasicForm>(() => ({
    name: event.name,
    description: event.description,
    startsAt: toLocal(event.starts_at),
    endsAt: toLocal(event.ends_at),
    venueName: event.venue_name ?? "",
    venueAddress: event.venue_address ?? "",
    publicationStatus: event.publication_status,
  }));
  const [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const mutation = useMutation({
    mutationFn: (body: Record<string, string | number | null>) =>
      saveEventChange(getToken, `/api/events/${event.id}`, "PUT", body),
    onSuccess: async () => {
      setNotice("変更を保存しました。");
      await queryClient.invalidateQueries({ queryKey: eventQueryKey(eventId) });
      const refreshed = await refreshEvent(queryClient, eventId, getToken);
      setRefreshWarning(
        refreshed
          ? ""
          : "変更は保存されましたが、最新情報を再取得できませんでした。画面を更新して確認してください。",
      );
    },
  });
  const update = <K extends keyof BasicForm>(key: K, value: BasicForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
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
              setNotice("");
              setRefreshWarning("");
              mutation.mutate({
                name: form.name,
                description: form.description,
                starts_at: toUTC(form.startsAt),
                ends_at: toUTC(form.endsAt),
                venue_name: form.venueName,
                venue_address: form.venueAddress,
                publication_status: form.publicationStatus,
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="event-name">イベント名</Label>
              <Input
                id="event-name"
                value={form.name}
                maxLength={200}
                required
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-description">イベント説明（Markdown）</Label>
              <textarea
                id="event-description"
                value={form.description}
                className="min-h-[300px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onChange={(e) => update("description", e.target.value)}
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="event-starts-at">開催開始日時（JST）</Label>
                <Input
                  id="event-starts-at"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => update("startsAt", e.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-2">
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
              <select
                id="event-publication-status"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={form.publicationStatus}
                onChange={(e) =>
                  update(
                    "publicationStatus",
                    e.target.value === "published" ? "published" : "draft",
                  )
                }
              >
                <option value="draft">下書き</option>
                <option value="published">公開</option>
              </select>
            </div>
            <div className="pt-1">
              <Button disabled={mutation.isPending}>イベントを保存</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {mutation.isError && (
        <Alert className="mx-auto mt-4 max-w-3xl" variant="destructive">
          {mutation.error.message}
        </Alert>
      )}
      {notice && (
        <p className="mx-auto mt-4 max-w-3xl text-sm font-medium text-primary" role="status">
          {notice}
        </p>
      )}
      {refreshWarning && (
        <Alert className="mx-auto mt-4 max-w-3xl" variant="destructive" role="alert">
          {refreshWarning}
        </Alert>
      )}
    </>
  );
}
