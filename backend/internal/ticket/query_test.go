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

func TestSQLQuery(t *testing.T) {
	ctx := context.Background()
	db := store.NewDB(t)
	q := ticket.SQLQuery{DB: db}
	store.Seed(t, db)

	t.Run("status", func(t *testing.T) {
		got, err := q.Status(ctx, 12)
		if err != nil || got != (ticket.Status{TicketTypeID: 12, Capacity: 3, Reserved: 1}) {
			t.Fatalf("ticket.Status() = %#v, %v", got, err)
		}
	})
	t.Run("events left join null ticket type and ordering", func(t *testing.T) {
		got, err := q.Events(ctx)
		start, end, regStart, regEnd := "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z", "2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"
		want := []ticket.Event{
			{ID: 1, Name: "Later", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []ticket.TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
			{ID: 2, Name: "Earlier", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []ticket.TicketType{{ID: 21, Name: "General", Capacity: 1, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 30, Name: "No registrations", Capacity: 0, Reserved: 0, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
			{ID: 3, Name: "Empty", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []ticket.TicketType{}},
		}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Events() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("event and ticket type join ordering", func(t *testing.T) {
		got, err := q.Event(ctx, 1)
		start, end, regStart, regEnd := "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z", "2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"
		want := ticket.Event{ID: 1, Name: "Later", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []ticket.TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("ticket.Event() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("registrations joins ordering and zero rows", func(t *testing.T) {
		got, err := q.Registrations(ctx, "user")
		want := []ticket.Registration{{TicketTypeID: 12, EventName: "Later", TicketName: "Zed", Status: "active"}, {TicketTypeID: 21, EventName: "Earlier", TicketName: "General", Status: "active"}}
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
			t.Errorf("ticket.Status missing error = %v", err)
		}
		if _, err := q.Event(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("ticket.Event missing error = %v", err)
		}
	})
	t.Run("empty events", func(t *testing.T) {
		emptyQuery := ticket.SQLQuery{DB: store.NewDB(t)}
		got, err := emptyQuery.Events(ctx)
		if err != nil || len(got) != 0 {
			t.Fatalf("empty Events() = %#v, %v", got, err)
		}
	})
}
