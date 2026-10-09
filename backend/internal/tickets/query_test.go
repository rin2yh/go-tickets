package tickets

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/rin2yh/go-tickets/internal/test/store"
)

func TestSQLQuery(t *testing.T) {
	ctx := context.Background()
	db := store.NewDB(t)
	q := SQLQuery{DB: db}
	store.Seed(t, db)

	t.Run("status", func(t *testing.T) {
		got, err := q.Status(ctx, 12)
		if err != nil || got != (Status{TicketTypeID: 12, Capacity: 3, Reserved: 1}) {
			t.Fatalf("Status() = %#v, %v", got, err)
		}
	})
	t.Run("admin lookup", func(t *testing.T) {
		for _, tc := range []struct {
			id   string
			want bool
		}{{"admin", true}, {"visitor", false}} {
			got, err := q.IsAdmin(ctx, tc.id)
			if err != nil || got != tc.want {
				t.Errorf("IsAdmin(%q) = %v, %v; want %v", tc.id, got, err, tc.want)
			}
		}
	})
	t.Run("events left join null ticket type and ordering", func(t *testing.T) {
		got, err := q.Events(ctx)
		want := []Event{
			{ID: 1, Name: "Later", TicketTypes: []TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1}}},
			{ID: 2, Name: "Earlier", TicketTypes: []TicketType{{ID: 21, Name: "General", Capacity: 1, Reserved: 1}, {ID: 30, Name: "No registrations", Capacity: 0, Reserved: 0}}},
			{ID: 3, Name: "Empty", TicketTypes: []TicketType{}},
		}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Events() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("event and ticket type join ordering", func(t *testing.T) {
		got, err := q.Event(ctx, 1)
		want := Event{ID: 1, Name: "Later", TicketTypes: []TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1}}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Event() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("registrations joins ordering and zero rows", func(t *testing.T) {
		got, err := q.Registrations(ctx, "user")
		want := []Registration{{TicketTypeID: 12, EventName: "Later", TicketName: "Zed", Status: "active"}, {TicketTypeID: 21, EventName: "Earlier", TicketName: "General", Status: "active"}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Registrations() = %#v, %v; want %#v", got, err, want)
		}
		got, err = q.Registrations(ctx, "missing")
		if err != nil || len(got) != 0 {
			t.Fatalf("empty Registrations() = %#v, %v", got, err)
		}
	})
	t.Run("missing ids", func(t *testing.T) {
		if _, err := q.Status(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("Status missing error = %v", err)
		}
		if _, err := q.Event(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("Event missing error = %v", err)
		}
	})
	t.Run("empty events", func(t *testing.T) {
		emptyQuery := SQLQuery{DB: store.NewDB(t)}
		got, err := emptyQuery.Events(ctx)
		if err != nil || len(got) != 0 {
			t.Fatalf("empty Events() = %#v, %v", got, err)
		}
	})
}
