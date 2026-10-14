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
	t.Run("admin registrations filters", func(t *testing.T) {
		for _, tc := range []struct {
			name, status, ticketID string
			page                   int
			wantTotal              int64
			wantCapacity           int64
			wantActive             int64
		}{
			{name: "active all tickets", status: "active", ticketID: "all", page: 1, wantTotal: 2, wantCapacity: 5, wantActive: 2},
			{name: "one ticket", status: "active", ticketID: "12", page: 1, wantTotal: 1, wantCapacity: 5, wantActive: 2},
			{name: "cancelled", status: "cancelled", ticketID: "all", page: 1, wantCapacity: 5, wantActive: 2},
			{name: "invalid status defaults to active", status: "unknown", ticketID: "", page: 1, wantTotal: 2, wantCapacity: 5, wantActive: 2},
		} {
			t.Run(tc.name, func(t *testing.T) {
				got, err := q.AdminRegistrations(ctx, 1, tc.status, tc.ticketID, tc.page)
				if err != nil {
					t.Fatal(err)
				}
				if got.Total != tc.wantTotal || got.Capacity != tc.wantCapacity || got.Active != tc.wantActive || len(got.Items) != int(tc.wantTotal) {
					t.Fatalf("AdminRegistrations() = %#v; want total=%d capacity=%d active=%d", got, tc.wantTotal, tc.wantCapacity, tc.wantActive)
				}
				if tc.ticketID == "12" && (got.Items[0].TicketTypeID != 12 || got.Items[0].TicketName != "Zed") {
					t.Fatalf("ticket-filtered items = %#v", got.Items)
				}
			})
		}
	})
}
