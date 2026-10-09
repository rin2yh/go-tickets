package ticket_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/rin2yh/go-tickets/internal/test/store"
	"github.com/rin2yh/go-tickets/internal/ticket"
)

func TestSQLCommand(t *testing.T) {
	ctx := context.Background()
	t.Run("create and update", func(t *testing.T) {
		db := store.NewDB(t)
		q, c := ticket.SQLQuery{DB: db}, ticket.SQLCommand{DB: db}
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
		want := ticket.Event{ID: eventID, Name: "Renamed", TicketTypes: []ticket.TicketType{{ID: typeID, Name: "Premium", Capacity: 4, Reserved: 0}}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("ticket.Event() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("updates missing rows", func(t *testing.T) {
		c := ticket.SQLCommand{DB: store.NewDB(t)}
		for name, call := range map[string]func() error{
			"event":       func() error { return c.UpdateEvent(ctx, 404, "missing") },
			"ticket type": func() error { return c.UpdateTicketType(ctx, 404, "missing", 1) },
		} {
			if err := call(); !errors.Is(err, ticket.ErrNotFound) {
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
				c := ticket.SQLCommand{DB: store.NewDB(t)}
				if _, err := c.CreateTicketType(ctx, tc.eventID, "Invalid", tc.capacity); err == nil {
					t.Fatal("expected SQLite constraint violation")
				}
			})
		}
	})
	t.Run("register inserts active row and cancel updates it", func(t *testing.T) {
		db := store.NewDB(t)
		c := ticket.SQLCommand{DB: db}
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
		c := ticket.SQLCommand{DB: store.NewDB(t)}
		if err := c.Cancel(ctx, 404, "missing"); !errors.Is(err, ticket.ErrNotFound) {
			t.Fatalf("Cancel() error = %v; want ticket.ErrNotFound", err)
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
