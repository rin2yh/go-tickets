package tickets

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
)

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
	t.Run("updates missing rows", func(t *testing.T) {
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
	t.Run("SQLite constraints", func(t *testing.T) {
		for _, tc := range []struct {
			name              string
			eventID, capacity int64
		}{
			{"event foreign key", 99, 1}, {"negative capacity", 1, -1},
		} {
			t.Run(tc.name, func(t *testing.T) {
				_, _, c := newSQLStore(t)
				if _, err := c.CreateTicketType(ctx, tc.eventID, "Invalid", tc.capacity); err == nil {
					t.Fatal("expected SQLite constraint violation")
				}
			})
		}
	})
	t.Run("register inserts active row and cancel updates it", func(t *testing.T) {
		db, _, c := newSQLStore(t)
		eventID, err := c.CreateEvent(ctx, "Conference")
		if err != nil {
			t.Fatal(err)
		}
		typeID, err := c.CreateTicketType(ctx, eventID, "General", 5)
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, typeID, "user"); err != nil {
			t.Fatal(err)
		}
		assertRegistrationStatus(t, db, typeID, "user", "active")
		if err := c.Cancel(ctx, typeID, "user"); err != nil {
			t.Fatal(err)
		}
		assertRegistrationStatus(t, db, typeID, "user", "cancelled")
	})
	t.Run("cancel missing registration", func(t *testing.T) {
		_, _, c := newSQLStore(t)
		if err := c.Cancel(ctx, 404, "missing"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("Cancel() error = %v; want ErrNotFound", err)
		}
	})
}

func assertRegistrationStatus(t *testing.T, db *sql.DB, typeID int64, userID, want string) {
	t.Helper()
	var got string
	if err := db.QueryRow("SELECT status FROM registrations WHERE ticket_type_id = ? AND user_id = ?", typeID, userID).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("registration status = %q; want %q", got, want)
	}
}
