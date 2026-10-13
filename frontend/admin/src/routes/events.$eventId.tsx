import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Alert } from "@go-tickets/ui/components/alert";
import { Badge } from "@go-tickets/ui/components/badge";
import { EventTabs } from "../components/event-tabs";
import { EventProvider, EventRequestError, eventQueryOptions, formatJST } from "./-event-detail";

export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
  }),
  component: EventLayout,
});

// oxlint-disable-next-line complexity
function EventLayout() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { getToken } = useAuth();
  const eventQuery = useQuery(eventQueryOptions(eventId, getToken));
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });
  const registrationStatus = useRouterState({ select: (state) => state.location.search.status });
  const registrationTicket = useRouterState({ select: (state) => state.location.search.ticket });
  const registrationPage = useRouterState({ select: (state) => state.location.search.page });

  if (tab === "tickets") {
    return (
      <Navigate
        to="/events/$eventId/tickets"
        params={{ eventId }}
        search={{ tab: "basic" }}
        replace
      />
    );
  }
  if (eventQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <p aria-live="polite">イベントを読み込み中です。</p>
      </main>
    );
  }
  if (eventQuery.isError && !eventQuery.data) {
    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6 md:py-10">
        <Alert variant="destructive">
          {eventQuery.error instanceof EventRequestError && eventQuery.error.status === 404
            ? "イベントが見つかりません。"
            : "イベントを読み込めませんでした。"}
        </Alert>
        <p>
          <Link to="/events">イベント一覧へ</Link>
        </p>
      </main>
    );
  }

  const event = eventQuery.data;
  if (!event) return null;
  return (
    <EventProvider value={event}>
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
        <EventTabs
          eventId={eventId}
          activeTab={
            routeId?.endsWith("/registrations")
              ? "registrations"
              : routeId?.endsWith("/tickets")
                ? "tickets"
                : "basic"
          }
          registrationSearch={{
            tab: "basic",
            status: registrationStatus === "cancelled" ? "cancelled" : "active",
            ticket: typeof registrationTicket === "string" ? registrationTicket : "all",
            page: typeof registrationPage === "number" ? registrationPage : 1,
          }}
        />
        <Outlet key={eventId} />
      </main>
    </EventProvider>
  );
}
