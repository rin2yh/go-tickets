export interface TicketType {
  id: number;
  name: string;
  capacity: number;
  reserved: number;
  registration_starts_at: string | null;
  registration_ends_at: string | null;
}

export interface Event {
  id: number;
  name: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  publication_status: "draft" | "published";
  ticket_types: TicketType[];
}

export type EventSummary = Pick<Event, "id" | "name" | "starts_at" | "publication_status">;
export type EventInput = Omit<Event, "id" | "ticket_types">;
