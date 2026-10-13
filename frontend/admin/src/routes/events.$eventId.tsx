import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { EventLayout } from "../pages/event-detail";
import { EventTabs } from "./-event-tabs";

export const Route = createFileRoute("/events/$eventId")({
  // oxlint-disable-next-line no-restricted-types
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "tickets" ? ("tickets" as const) : ("basic" as const),
  }),
  component: EventDetailRoute,
});

function EventDetailRoute() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });
  const search = useRouterState({ select: (state) => state.location.search });

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

  return (
    <EventLayout
      eventId={eventId}
      renderBackLink={(label) => <Link to="/events">{label}</Link>}
      navigation={
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
            status: search.status === "cancelled" ? "cancelled" : "active",
            ticket: typeof search.ticket === "string" ? search.ticket : "all",
            page: typeof search.page === "number" ? search.page : 1,
          }}
        />
      }
    >
      <Outlet key={eventId} />
    </EventLayout>
  );
}
