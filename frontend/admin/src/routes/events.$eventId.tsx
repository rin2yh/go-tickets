import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { EventLayout, EventTabs } from "../pages/event-detail";

export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
    status: search.status === "cancelled" ? ("cancelled" as const) : ("active" as const),
    ticket: typeof search.ticket === "string" ? search.ticket : "all",
    page: Math.max(1, Number(search.page) || 1),
  }),
  component: EventDetailRoute,
});

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });

  if (search.tab === "tickets") {
    return (
      <Navigate
        to="/events/$eventId/tickets"
        params={{ eventId }}
        search={{ ...search, tab: "basic" }}
        replace
      />
    );
  }

  return (
    <EventLayout eventId={eventId} renderBackLink={(label) => <Link to="/events">{label}</Link>}>
      <>
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
            status: search.status,
            ticket: search.ticket,
            page: search.page,
          }}
        />
        <Outlet key={eventId} />
      </>
    </EventLayout>
  );
}
