import { queryOptions } from "@tanstack/react-query";
import { Result } from "@praha/byethrow";

interface RegistrationPage {
  items: { name: string; ticket_type_id: number; ticket_name: string; created_at: string }[];
  total: number;
  active: number;
  cancelled: number;
  capacity: number;
}

export function buildRegistrationsQueryOptions(
  eventId: string,
  status: "active" | "cancelled",
  ticket: string,
  page: number,
  getToken: () => Promise<string | null>,
) {
  return queryOptions({
    queryKey: ["admin", "events", eventId, "registrations", status, ticket, page] as const,
    queryFn: async () =>
      Result.unwrap(
        await Result.try({
          try: async () => {
            const token = await getToken();
            const response = await fetch(
              `/api/admin/events/${eventId}/registrations?status=${status}&ticket=${ticket}&page=${page}`,
              { headers: { Authorization: `Bearer ${token ?? ""}` } },
            );
            if (!response.ok) throw new Error("参加者を読み込めません");
            const payload: RegistrationPage = await response.json();
            return payload;
          },
          catch: (error) =>
            error instanceof Error ? error : new Error("参加者を読み込めません", { cause: error }),
        }),
      ),
    retry: false,
  });
}
