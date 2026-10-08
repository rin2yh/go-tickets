CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE ticket_types (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= capacity)
);

CREATE TABLE registrations (
  id INTEGER PRIMARY KEY,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  UNIQUE(ticket_type_id, user_id)
);

CREATE TRIGGER registration_reserve AFTER INSERT ON registrations
WHEN NEW.status = 'active'
BEGIN
  UPDATE ticket_types SET reserved = reserved + 1
  WHERE id = NEW.ticket_type_id AND reserved < capacity;
  SELECT RAISE(ABORT, 'sold_out') WHERE changes() != 1;
END;

CREATE TRIGGER registration_cancel AFTER UPDATE OF status ON registrations
WHEN OLD.status = 'active' AND NEW.status = 'cancelled'
BEGIN
  UPDATE ticket_types SET reserved = reserved - 1
  WHERE id = NEW.ticket_type_id AND reserved > 0;
  SELECT RAISE(ABORT, 'counter_inconsistent') WHERE changes() != 1;
END;
