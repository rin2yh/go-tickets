import { useState } from "react";
import { useAuth } from "@clerk/react";
import { Alert } from "@go-tickets/ui/components/alert";
import { Button } from "@go-tickets/ui/components/button";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { useParticipantProfile, ParticipantNameForm } from "../../../features/participant-name";
import { TicketActions } from "../../../features/ticket-registration";
import type { AuthenticatedRoute } from "./clerk-island";
import { useEventTickets } from "./use-event-tickets";

export function SignedInContent({
  route,
  defaultName,
}: {
  route: Exclude<AuthenticatedRoute, null>;
  defaultName: string;
}) {
  const { getToken } = useAuth();
  const { state: profile, updateName, retry } = useParticipantProfile(getToken, true);
  const [editingName, setEditingName] = useState(false);

  return (
    <ParticipantProfileContent
      profile={profile}
      onRetry={retry}
      defaultName={defaultName}
      editingName={editingName}
      onSaved={(name) => {
        updateName(name);
        setEditingName(false);
      }}
      onEditName={() => setEditingName(true)}
      route={route}
    />
  );
}

function ParticipantProfileContent({
  profile,
  onRetry,
  defaultName,
  editingName,
  onSaved,
  onEditName,
  route,
}: {
  profile: ReturnType<typeof useParticipantProfile>["state"];
  onRetry: () => void;
  defaultName: string;
  editingName: boolean;
  onSaved: (name: string) => void;
  onEditName: () => void;
  route: Exclude<AuthenticatedRoute, null>;
}) {
  if (profile.status === "loading")
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">参加者情報を確認しています…</p>
        </CardContent>
      </Card>
    );
  if (profile.status === "failed")
    return (
      <div className="grid justify-items-start gap-3">
        <Alert variant="destructive">{profile.error}</Alert>
        <Button variant="outline" onClick={onRetry}>
          もう一度試す
        </Button>
      </div>
    );
  if (!profile.name || editingName)
    return <ParticipantNameForm initialName={profile.name || defaultName} onSaved={onSaved} />;

  return (
    <AuthenticatedTicketContent
      route={route}
      participantName={profile.name}
      onEditName={onEditName}
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
  const event = useEventTickets(route.mode === "event" ? route.eventId : null);

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
  if (event.status === "loading")
    return (
      <Card>
        <CardContent>
          <p aria-live="polite">イベントの申込情報を読み込み中です。</p>
        </CardContent>
      </Card>
    );
  if (event.status === "failed") return <Alert variant="destructive">{event.error}</Alert>;

  return (
    <TicketActions
      mode="event"
      eventId={route.eventId}
      ticketTypes={event.ticketTypes}
      eventEndsAt={event.endsAt}
      participantName={participantName}
      onEditName={onEditName}
    />
  );
}
