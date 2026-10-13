export type EventLoadResult<T> =
  | { status: "success"; event: T }
  | { status: "not-found" }
  | { status: "error" };

export async function loadEvent<T>(
  eventId: string,
  getToken: () => Promise<string | null>,
  request: typeof fetch = fetch,
): Promise<EventLoadResult<T>> {
  try {
    const token = await getToken();
    const response = await request(`/api/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "error" };
    const event: T = await response.json();
    return { status: "success", event };
  } catch {
    return { status: "error" };
  }
}
