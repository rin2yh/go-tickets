import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@go-tickets/ui/components/alert";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import {
  ParticipantNameForm,
  participantNameKey,
  participantNameQueryOptions,
} from "../../../features/participant-name";
import { publicEventQueryOptions } from "../../../entities/event";
import { TicketActions } from "../../../features/ticket-registration";
import type { AuthenticatedRoute } from "./clerk-island";

export function SignedInContent({
  route,
  defaultName,
}: {
  route: Exclude<AuthenticatedRoute, null>;
  defaultName: string;
}) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    ...participantNameQueryOptions(userId ?? "", getToken),
    enabled: Boolean(userId),
  });
  const [editingName, setEditingName] = useState(false);

  if (!userId)
    return (
      <Alert variant="destructive">
        ログイン情報を取得できません。ページを再読み込みしてください。
      </Alert>
    );
  if (profileQuery.isPending)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">参加者情報を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (profileQuery.isError)
    return (
      <div className="grid justify-items-start gap-3">
        <Alert variant="destructive">{profileQuery.error.message}</Alert>
        <Button variant="outline" onClick={() => void profileQuery.refetch()}>
          もう一度試す
        </Button>
      </div>
    );
  if (!profileQuery.data || editingName)
    return (
      <ParticipantNameForm
        initialName={profileQuery.data || defaultName}
        onSaved={(name) => {
          if (!userId) return;
          queryClient.setQueryData(participantNameKey(userId), name);
          setEditingName(false);
        }}
      />
    );

  return (
    <AuthenticatedTicketContent
      route={route}
      participantName={profileQuery.data}
      onEditName={() => setEditingName(true)}
    />
  );
}

function AuthenticatedTicketContent({
  route,
  participantName,
  onEditName,
}: {
  route: Exclude<AuthenticatedRoute, null>;
  participantName: string;
  onEditName: () => void;
}) {
  const eventId = route.mode === "event" ? route.eventId : null;
  const eventQuery = useQuery({
    ...publicEventQueryOptions(eventId ?? 0),
    enabled: eventId !== null,
  });

  if (route.mode === "tickets")
    return (
      <TicketActions
        mode="tickets"
        eventId={0}
        ticketTypes={[]}
        eventEndsAt={null}
        participantName={participantName}
        onEditName={onEditName}
      />
    );
  if (eventQuery.isPending)
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントの申込情報を読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (eventQuery.isError)
    return (
      <div className="grid justify-items-start gap-3">
        <Alert variant="destructive">{eventQuery.error.message}</Alert>
        <Button variant="outline" onClick={() => void eventQuery.refetch()}>
          もう一度試す
        </Button>
      </div>
    );
  if (!eventQuery.data) return null;

  return (
    <TicketActions
      mode="event"
      eventId={route.eventId}
      ticketTypes={eventQuery.data.ticket_types}
      eventEndsAt={eventQuery.data.ends_at}
      participantName={participantName}
      onEditName={onEditName}
    />
  );
}
