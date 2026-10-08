interface D1ResultRow {
  id: number;
  name: string;
  ticket_type_id: number | null;
  ticket_type_name: string | null;
}

interface D1Result {
  results?: D1ResultRow[];
  success: boolean;
  error?: string;
}

export interface PublicEvent {
  id: number;
  name: string;
  ticket_types: { id: number; name: string }[];
}

export function getEvents(): PublicEvent[] {
  const query = import.meta.env.PUBLIC_EVENTS_JSON;
  if (!query) throw new Error("PUBLIC_EVENTS_JSON was not provided by the Public build task");
  const results: D1Result[] = JSON.parse(query);
  const result = results[0];
  if (!result?.success) throw new Error(result?.error ?? "Wrangler D1 event query failed");

  const events = new Map<number, PublicEvent>();
  result.results?.forEach((row) => addRow(events, row));
  return [...events.values()];
}

function addRow(events: Map<number, PublicEvent>, row: D1ResultRow) {
  const event = events.get(row.id) ?? { id: row.id, name: row.name, ticket_types: [] };
  events.set(row.id, event);
  if (row.ticket_type_id !== null && row.ticket_type_name !== null) {
    event.ticket_types.push({ id: row.ticket_type_id, name: row.ticket_type_name });
  }
}
