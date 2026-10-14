import { useAuth } from "@clerk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { buildEventQueryOptions, saveEventChange, useEvent } from "../../../entities/event";
import { toLocal, toUTC } from "../../../shared/lib/datetime";

interface BasicForm {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  publicationStatus: "draft" | "published";
}

export function BasicInformation({ eventId }: { eventId: string }) {
  const event = useEvent();
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
    mutationFn: async (body: Record<string, string | number | null>) =>
      Result.unwrap(await saveEventChange(getToken, `/api/events/${event.id}`, "PUT", body)),
    onSuccess: async () => {
      setNotice("変更を保存しました。");
      const refresh = await Result.try({
        try: async () => {
          await queryClient.invalidateQueries(
            { queryKey: buildEventQueryOptions(eventId, getToken).queryKey, exact: true },
            { throwOnError: true },
          );
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("再取得できません", { cause: error }),
      });
      if (Result.isSuccess(refresh)) setRefreshWarning("");
      else {
        setRefreshWarning(
          "変更は保存されましたが、最新情報を再取得できませんでした。画面を更新して確認してください。",
        );
      }
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
              <Textarea
                id="event-description"
                value={form.description}
                className="min-h-[300px] resize-y leading-6"
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
