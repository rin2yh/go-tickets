-- SQLite cannot add non-constant timestamp defaults to populated tables. Rebuild
-- the three related tables in dependency order, copying every existing record.
CREATE TABLE events_next (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  venue_name TEXT,
  venue_address TEXT,
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (publication_status = 'draft' OR (trim(name) != '' AND trim(description) != '' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND julianday(starts_at) IS NOT NULL AND julianday(ends_at) IS NOT NULL AND julianday(starts_at) < julianday(ends_at)))
);
INSERT INTO events_next(id, name, publication_status, created_at, updated_at)
SELECT id, name, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM events;

CREATE TABLE ticket_types_next (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events_next(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= capacity),
  registration_starts_at TEXT,
  registration_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (registration_starts_at IS NULL OR registration_ends_at IS NULL OR (julianday(registration_starts_at) IS NOT NULL AND julianday(registration_ends_at) IS NOT NULL AND julianday(registration_starts_at) < julianday(registration_ends_at)))
);
INSERT INTO ticket_types_next(id, event_id, name, capacity, reserved, created_at, updated_at)
SELECT id, event_id, name, capacity, reserved, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM ticket_types;

CREATE TABLE registrations_next (
  id INTEGER PRIMARY KEY,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types_next(id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticket_type_id, user_id)
);
INSERT INTO registrations_next(id, ticket_type_id, user_id, status, created_at, updated_at)
SELECT id, ticket_type_id, user_id, status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM registrations;

DROP TABLE registrations;
DROP TABLE ticket_types;
DROP TABLE events;
ALTER TABLE events_next RENAME TO events;
ALTER TABLE ticket_types_next RENAME TO ticket_types;
ALTER TABLE registrations_next RENAME TO registrations;

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

CREATE TRIGGER events_validate_ticket_periods BEFORE UPDATE OF publication_status ON events
WHEN NEW.publication_status = 'published'
BEGIN
  SELECT RAISE(ABORT, 'invalid_registration_period') WHERE EXISTS (
    SELECT 1 FROM ticket_types t WHERE t.event_id = NEW.id
      AND (t.registration_starts_at IS NULL OR t.registration_ends_at IS NULL
        OR julianday(t.registration_starts_at) IS NULL OR julianday(t.registration_ends_at) IS NULL
        OR julianday(t.registration_starts_at) >= julianday(t.registration_ends_at))
  );
END;

CREATE TRIGGER ticket_types_validate_published_period_insert BEFORE INSERT ON ticket_types
WHEN EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.publication_status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'invalid_registration_period') WHERE NEW.registration_starts_at IS NULL
    OR NEW.registration_ends_at IS NULL OR julianday(NEW.registration_starts_at) IS NULL
    OR julianday(NEW.registration_ends_at) IS NULL OR julianday(NEW.registration_starts_at) >= julianday(NEW.registration_ends_at);
END;

CREATE TRIGGER ticket_types_validate_published_period_update BEFORE UPDATE OF registration_starts_at, registration_ends_at, event_id ON ticket_types
WHEN EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.publication_status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'invalid_registration_period') WHERE NEW.registration_starts_at IS NULL
    OR NEW.registration_ends_at IS NULL OR julianday(NEW.registration_starts_at) IS NULL
    OR julianday(NEW.registration_ends_at) IS NULL OR julianday(NEW.registration_starts_at) >= julianday(NEW.registration_ends_at);
END;

CREATE TRIGGER registration_validate BEFORE INSERT ON registrations
WHEN NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'event_unpublished') WHERE NOT EXISTS (
    SELECT 1 FROM ticket_types t JOIN events e ON e.id = t.event_id
    WHERE t.id = NEW.ticket_type_id AND e.publication_status = 'published'
  );
  SELECT RAISE(ABORT, 'event_ended') WHERE EXISTS (
    SELECT 1 FROM ticket_types t JOIN events e ON e.id = t.event_id
    WHERE t.id = NEW.ticket_type_id AND e.publication_status = 'published'
      AND julianday(e.ends_at) <= julianday('now')
  );
  SELECT RAISE(ABORT, 'registration_not_started') WHERE EXISTS (
    SELECT 1 FROM ticket_types t JOIN events e ON e.id = t.event_id
    WHERE t.id = NEW.ticket_type_id AND e.publication_status = 'published'
      AND (t.registration_starts_at IS NULL OR julianday(t.registration_starts_at) > julianday('now'))
  );
  SELECT RAISE(ABORT, 'registration_ended') WHERE EXISTS (
    SELECT 1 FROM ticket_types t JOIN events e ON e.id = t.event_id
    WHERE t.id = NEW.ticket_type_id AND e.publication_status = 'published'
      AND t.registration_ends_at IS NOT NULL AND julianday(t.registration_ends_at) <= julianday('now')
  );
  SELECT RAISE(ABORT, 'registration_not_started') WHERE NOT EXISTS (
    SELECT 1 FROM ticket_types t JOIN events e ON e.id = t.event_id
    WHERE t.id = NEW.ticket_type_id AND e.publication_status = 'published'
      AND t.registration_starts_at IS NOT NULL AND t.registration_ends_at IS NOT NULL
      AND julianday(t.registration_starts_at) <= julianday('now')
      AND julianday(t.registration_ends_at) > julianday('now')
      AND julianday(e.ends_at) > julianday('now')
  );
END;
