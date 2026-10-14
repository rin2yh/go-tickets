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
  async function load(): Promise<Result.Result<RegistrationPage, Error>> {
    const [tokenOutcome] = await Promise.allSettled([getToken()]);
    if (tokenOutcome.status === "rejected") {
      return Result.fail(
        tokenOutcome.reason instanceof Error
          ? tokenOutcome.reason
          : new Error("参加者を読み込めません", { cause: tokenOutcome.reason }),
      );
    }
    const [responseOutcome] = await Promise.allSettled([
      fetch(
        `/api/admin/events/${eventId}/registrations?status=${status}&ticket=${ticket}&page=${page}`,
        { headers: { Authorization: `Bearer ${tokenOutcome.value ?? ""}` } },
      ),
    ]);
    if (responseOutcome.status === "rejected") {
      return Result.fail(
        responseOutcome.reason instanceof Error
          ? responseOutcome.reason
          : new Error("参加者を読み込めません", { cause: responseOutcome.reason }),
      );
    }
    if (!responseOutcome.value.ok) return Result.fail(new Error("参加者を読み込めません"));
    const [payloadOutcome] = await Promise.allSettled([responseOutcome.value.json()]);
    if (payloadOutcome.status === "rejected") {
      return Result.fail(
        payloadOutcome.reason instanceof Error
          ? payloadOutcome.reason
          : new Error("参加者を読み込めません", { cause: payloadOutcome.reason }),
      );
    }
    const payload: RegistrationPage = payloadOutcome.value;
    return Result.succeed(payload);
  }

  return queryOptions({
    queryKey: ["admin", "events", eventId, "registrations", status, ticket, page] as const,
    queryFn: async () => {
      const result = await load();
      if (Result.isFailure(result)) throw result.error;
      return result.value;
    },
    retry: false,
  });
}
