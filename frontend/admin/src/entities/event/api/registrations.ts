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
  function load() {
    return Result.pipe(
      Result.try({
        try: async () => {
          const token = await getToken();
          return await fetch(
            `/api/admin/events/${eventId}/registrations?status=${status}&ticket=${ticket}&page=${page}`,
            { headers: { Authorization: `Bearer ${token ?? ""}` } },
          );
        },
        catch: (error) =>
          error instanceof Error ? error : new Error("参加者を読み込めません", { cause: error }),
      }),
      Result.andThen((response) => {
        if (!response.ok) return Result.fail(new Error("参加者を読み込めません"));
        return Result.try({
          try: async () => {
            const registrationPage: RegistrationPage = await response.json();
            return registrationPage;
          },
          catch: (error) =>
            error instanceof Error ? error : new Error("参加者を読み込めません", { cause: error }),
        });
      }),
    );
  }

  return queryOptions({
    queryKey: ["admin", "events", eventId, "registrations", status, ticket, page] as const,
    queryFn: async () => Result.unwrap(await load()),
    retry: false,
  });
}
