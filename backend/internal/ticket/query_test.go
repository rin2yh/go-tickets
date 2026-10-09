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
	})
}
