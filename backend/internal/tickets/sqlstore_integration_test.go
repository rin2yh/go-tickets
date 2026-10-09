package tickets

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	_ "modernc.org/sqlite"
)

func newSQLStore(t *testing.T) (*sql.DB, SQLQuery, SQLCommand) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "tickets.db")+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, name := range []string{"0001_init.sql", "0002_administrators.sql"} {
		migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(migration)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
	}
	return db, SQLQuery{DB: db}, SQLCommand{DB: db}
}

func seedSQLStore(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO events(id, name) VALUES (1, 'Later'), (2, 'Earlier')`,
		`INSERT INTO ticket_types(id, event_id, name, capacity) VALUES (12, 1, 'Zed', 3), (11, 1, 'Alpha', 2), (21, 2, 'General', 1), (30, 2, 'No registrations', 0)`,
		`INSERT INTO registrations(ticket_type_id, user_id) VALUES (12, 'user'), (21, 'user'), (11, 'other')`,
		`INSERT INTO administrators(clerk_user_id) VALUES ('admin')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed database: %v", err)
		}
	}
}

func TestSQLQuery(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name  string
		check func(*testing.T, SQLQuery)
	}{
		{name: "status", check: func(t *testing.T, q SQLQuery) {
			got, err := q.Status(ctx, 12)
			if err != nil || got != (Status{TicketTypeID: 12, Capacity: 3, Reserved: 1}) {
				t.Fatalf("Status() = %#v, %v", got, err)
			}
		}},
		{name: "is admin", check: func(t *testing.T, q SQLQuery) {
			for _, tc := range []struct {
				id   string
				want bool
			}{{"admin", true}, {"visitor", false}} {
				got, err := q.IsAdmin(ctx, tc.id)
				if err != nil || got != tc.want {
					t.Errorf("IsAdmin(%q) = %v, %v; want %v", tc.id, got, err, tc.want)
				}
			}
		}},
		{name: "events joins and ordering", check: func(t *testing.T, q SQLQuery) {
			got, err := q.Events(ctx)
			want := []Event{
				{ID: 1, Name: "Later", TicketTypes: []TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1}}},
				{ID: 2, Name: "Earlier", TicketTypes: []TicketType{{ID: 21, Name: "General", Capacity: 1, Reserved: 1}, {ID: 30, Name: "No registrations", Capacity: 0, Reserved: 0}}},
			}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("Events() = %#v, %v; want %#v", got, err, want)
			}
		}},
		{name: "event with empty ticket type list", check: func(t *testing.T, q SQLQuery) {
			got, err := q.Event(ctx, 1)
			want := Event{ID: 1, Name: "Later", TicketTypes: []TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1}}}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("Event() = %#v, %v; want %#v", got, err, want)
			}
		}},
		{name: "registrations joins ordering and zero rows", check: func(t *testing.T, q SQLQuery) {
			got, err := q.Registrations(ctx, "user")
			want := []Registration{{TicketTypeID: 12, EventName: "Later", TicketName: "Zed", Status: "active"}, {TicketTypeID: 21, EventName: "Earlier", TicketName: "General", Status: "active"}}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("Registrations() = %#v, %v; want %#v", got, err, want)
			}
			got, err = q.Registrations(ctx, "missing")
			if err != nil || len(got) != 0 {
				t.Fatalf("empty Registrations() = %#v, %v", got, err)
			}
		}},
		{name: "missing ids and empty database", check: func(t *testing.T, q SQLQuery) {
			if _, err := q.Status(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
				t.Errorf("Status missing error = %v", err)
			}
			if _, err := q.Event(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
				t.Errorf("Event missing error = %v", err)
			}
			got, err := q.Events(ctx)
			if err != nil || len(got) != 0 {
				t.Errorf("empty Events() = %#v, %v", got, err)
			}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			db, q, _ := newSQLStore(t)
			if tc.name != "missing ids and empty database" {
				seedSQLStore(t, db)
			}
			tc.check(t, q)
		})
	}
}

func TestSQLCommand(t *testing.T) {
	ctx := context.Background()
	t.Run("create and update", func(t *testing.T) {
		_, q, c := newSQLStore(t)
		eventID, err := c.CreateEvent(ctx, "First")
		if err != nil {
			t.Fatal(err)
		}
		if err := c.UpdateEvent(ctx, eventID, "Renamed"); err != nil {
			t.Fatal(err)
		}
		typeID, err := c.CreateTicketType(ctx, eventID, "Standard", 2)
		if err != nil {
			t.Fatal(err)
		}
		if err := c.UpdateTicketType(ctx, typeID, "Premium", 4); err != nil {
			t.Fatal(err)
		}
		got, err := q.Event(ctx, eventID)
		want := Event{ID: eventID, Name: "Renamed", TicketTypes: []TicketType{{ID: typeID, Name: "Premium", Capacity: 4, Reserved: 0}}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Event() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("missing ids", func(t *testing.T) {
		_, _, c := newSQLStore(t)
		for name, call := range map[string]func() error{
			"event":       func() error { return c.UpdateEvent(ctx, 404, "missing") },
			"ticket type": func() error { return c.UpdateTicketType(ctx, 404, "missing", 1) },
		} {
			if err := call(); !errors.Is(err, ErrNotFound) {
				t.Errorf("%s update error = %v", name, err)
			}
		}
	})
	t.Run("constraints", func(t *testing.T) {
		for _, tc := range []struct {
			name     string
			eventID  int64
			capacity int64
		}{
			{"event foreign key", 99, 1},
			{"negative capacity", 1, -1},
		} {
			t.Run(tc.name, func(t *testing.T) {
				_, _, c := newSQLStore(t)
				if _, err := c.CreateTicketType(ctx, tc.eventID, "Invalid", tc.capacity); err == nil {
					t.Fatal("expected SQLite constraint violation")
				}
			})
		}
	})
	t.Run("registration capacity duplicate and cancellation consistency", func(t *testing.T) {
		db, q, c := newSQLStore(t)
		eventID, err := c.CreateEvent(ctx, "Conference")
		if err != nil {
			t.Fatal(err)
		}
		typeID, err := c.CreateTicketType(ctx, eventID, "Limited", 1)
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, typeID, "one"); err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, typeID, "two"); !errors.Is(err, ErrSoldOut) {
			t.Fatalf("over capacity registration error = %v", err)
		}
		if err := c.Register(ctx, typeID, "one"); !errors.Is(err, ErrDuplicate) {
			t.Fatalf("duplicate registration error = %v", err)
		}
		checkStatus := func(reserved int64) {
			t.Helper()
			got, err := q.Status(ctx, typeID)
			if err != nil || got.Reserved != reserved {
				t.Fatalf("Status() = %#v, %v; want reserved %d", got, err, reserved)
			}
		}
		checkStatus(1)
		if err := c.Cancel(ctx, typeID, "one"); err != nil {
			t.Fatal(err)
		}
		checkStatus(0)
		if err := c.Register(ctx, typeID, "two"); err != nil {
			t.Fatalf("registration after cancellation: %v", err)
		}
		checkStatus(1)
		rows, err := q.Registrations(ctx, "one")
		if err != nil || len(rows) != 1 || rows[0].Status != "cancelled" {
			t.Fatalf("cancelled registration = %#v, %v", rows, err)
		}
		if err := c.Cancel(ctx, typeID, "one"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("repeat cancellation error = %v", err)
		}
		var active, cancelled int
		if err := db.QueryRow(`SELECT COUNT(*) FILTER (WHERE status = 'active'), COUNT(*) FILTER (WHERE status = 'cancelled') FROM registrations`).Scan(&active, &cancelled); err != nil {
			t.Fatal(err)
		}
		if active != 1 || cancelled != 1 {
			t.Fatalf("registration counts active=%d cancelled=%d", active, cancelled)
		}
	})
}
