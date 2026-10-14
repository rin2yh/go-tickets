package ticket_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/rin2yh/go-tickets/internal/test/store"
	"github.com/rin2yh/go-tickets/internal/ticket"
	"github.com/rin2yh/go-tickets/x/testx"
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
	{
		type input struct {
			status, ticketID string
			page             int
		}
		type want struct {
			total, capacity, active int64
			ticketTypeID            int64
			ticketName              string
		}
		run := func(t *testing.T, in input, want want) {
			got, err := q.AdminRegistrations(ctx, 1, in.status, in.ticketID, in.page)
			if err != nil {
				t.Fatal(err)
			}
			if got.Total != want.total || got.Capacity != want.capacity || got.Active != want.active || len(got.Items) != int(want.total) {
				t.Fatalf("AdminRegistrations() = %#v; want total=%d capacity=%d active=%d", got, want.total, want.capacity, want.active)
			}
			if want.ticketTypeID != 0 && (got.Items[0].TicketTypeID != want.ticketTypeID || got.Items[0].TicketName != want.ticketName) {
				t.Fatalf("ticket-filtered items = %#v; want ticket type %d (%s)", got.Items, want.ticketTypeID, want.ticketName)
			}
		}
		testx.NewTable[input, want](
			testx.NewCase("active all tickets", input{status: "active", ticketID: "all", page: 1}, want{total: 2, capacity: 5, active: 2}),
			testx.NewCase("one ticket", input{status: "active", ticketID: "12", page: 1}, want{total: 1, capacity: 5, active: 2, ticketTypeID: 12, ticketName: "Zed"}),
			testx.NewCase("cancelled", input{status: "cancelled", ticketID: "all", page: 1}, want{capacity: 5, active: 2}),
			testx.NewCase("invalid status defaults to active", input{status: "unknown", page: 1}, want{total: 2, capacity: 5, active: 2}),
		).Run(t, run)
	}
	if _, err := db.Exec(`UPDATE ticket_types SET capacity=100 WHERE id=12`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 51; i++ {
		if _, err := db.Exec(`INSERT INTO registrations(ticket_type_id,user_id) VALUES(12,?)`, fmt.Sprintf("pagination_%d", i)); err != nil {
			t.Fatal(err)
		}
	}
	type pageInput struct{ page int }
	type pageWant struct{ items int }
	run := func(t *testing.T, in pageInput, want pageWant) {
		got, err := q.AdminRegistrations(ctx, 1, "active", "all", in.page)
		if err != nil {
			t.Fatal(err)
		}
		if got.Total != 53 || got.Active != 53 || len(got.Items) != want.items {
			t.Fatalf("page %d = total %d, active %d, items %d; want 53, 53, %d", in.page, got.Total, got.Active, len(got.Items), want.items)
		}
	}
	testx.NewTable[pageInput, pageWant](
		testx.NewCase("admin registrations page 1", pageInput{page: 1}, pageWant{items: 50}),
		testx.NewCase("admin registrations page 2", pageInput{page: 2}, pageWant{items: 3}),
		testx.NewCase("admin registrations page 3 is empty", pageInput{page: 3}, pageWant{items: 0}),
	).Run(t, run)
}
