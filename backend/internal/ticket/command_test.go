package ticket_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/test/store"
	"github.com/rin2yh/go-tickets/internal/ticket"
)

func TestSQLCommand(t *testing.T) {
	ctx := context.Background()
	t.Run("updates missing rows", func(t *testing.T) {
		db := store.NewDB(t)
		c := ticket.SQLCommand{DB: db}
		if err := c.UpdateTicketType(ctx, 404, ticketInput("missing", 1)); !errors.Is(err, ticket.ErrNotFound) {
			t.Errorf("ticket update error = %v", err)
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
				if _, err := c.CreateTicketType(ctx, tc.eventID, ticket.TicketTypeInput{Name: "Invalid", Capacity: tc.capacity}); err == nil {
					t.Fatal("expected SQLite constraint violation")
				}
			})
		}
	})
	t.Run("register inserts active row and cancel updates it", func(t *testing.T) {
		db := store.NewDB(t)
		c := ticket.SQLCommand{DB: db}
		eventID, err := (event.SQLCommand{DB: db}).CreateEvent(ctx, eventInput("Conference"))
		if err != nil {
			t.Fatal(err)
		}
		typeID, err := c.CreateTicketType(ctx, eventID, ticketInput("General", 5))
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
	t.Run("drafts and registration boundaries are enforced by the database", func(t *testing.T) {
		db := store.NewDB(t)
		eq, ec, c := event.SQLQuery{DB: db}, event.SQLCommand{DB: db}, ticket.SQLCommand{DB: db}
		eventID, err := ec.CreateEvent(ctx, event.EventInput{Name: "Draft"})
		if err != nil {
			t.Fatal(err)
		}
		typeID, err := c.CreateTicketType(ctx, eventID, ticket.TicketTypeInput{Name: "Ticket", Capacity: 2})
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, typeID, "user"); !errors.Is(err, ticket.ErrUnpublished) {
			t.Fatalf("draft registration error = %v", err)
		}
		if _, err := eq.Event(ctx, eventID); !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("public draft lookup error = %v", err)
		}
		if _, err := eq.AdminEvent(ctx, eventID); err != nil {
			t.Fatalf("admin draft lookup: %v", err)
		}
		publicEvents, err := eq.Events(ctx)
		if err != nil || len(publicEvents) != 0 {
			t.Fatalf("public events include draft: %#v, %v", publicEvents, err)
		}
		adminEvents, err := eq.AdminEvents(ctx)
		if err != nil || len(adminEvents) != 1 {
			t.Fatalf("admin events omit draft: %#v, %v", adminEvents, err)
		}
		start := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
		end := time.Now().UTC().Add(3 * time.Hour).Format(time.RFC3339)
		input := event.EventInput{Name: "Published", Description: "Details", StartsAt: new(time.Now().UTC().Add(4 * time.Hour).Format(time.RFC3339)), EndsAt: new(time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)), PublicationStatus: "published"}
		publishedID, err := ec.CreateEvent(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		periodID, err := c.CreateTicketType(ctx, publishedID, ticket.TicketTypeInput{Name: "Timed", Capacity: 1, RegistrationStartsAt: &start, RegistrationEndsAt: &end})
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, periodID, "early"); !errors.Is(err, ticket.ErrRegistrationNotStarted) {
			t.Fatalf("early registration error = %v", err)
		}
		start = time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
		if err := c.UpdateTicketType(ctx, periodID, ticket.TicketTypeInput{Name: "Timed", Capacity: 1, RegistrationStartsAt: &start, RegistrationEndsAt: &end}); err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, periodID, "first"); err != nil {
			t.Fatalf("in-window registration: %v", err)
		}
		if err := c.Register(ctx, periodID, "first"); !errors.Is(err, ticket.ErrDuplicate) {
			t.Fatalf("duplicate registration error = %v", err)
		}
		if err := c.Register(ctx, periodID, "second"); !errors.Is(err, ticket.ErrSoldOut) {
			t.Fatalf("full registration error = %v; want sold out", err)
		}
		pastStart := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
		atEnd := time.Now().UTC().Format(time.RFC3339)
		endedWindowID, err := c.CreateTicketType(ctx, publishedID, ticket.TicketTypeInput{Name: "Ended window", Capacity: 1, RegistrationStartsAt: &pastStart, RegistrationEndsAt: &atEnd})
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, endedWindowID, "late"); !errors.Is(err, ticket.ErrRegistrationEnded) {
			t.Fatalf("registration at end boundary error = %v", err)
		}
		finishedEvent := event.EventInput{Name: "Finished", Description: "Details", StartsAt: new(time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)), EndsAt: new(time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)), PublicationStatus: "published"}
		finishedID, err := ec.CreateEvent(ctx, finishedEvent)
		if err != nil {
			t.Fatal(err)
		}
		finishedType, err := c.CreateTicketType(ctx, finishedID, ticketInput("Finished ticket", 1))
		if err != nil {
			t.Fatal(err)
		}
		if err := c.Register(ctx, finishedType, "after-event"); !errors.Is(err, ticket.ErrEventEnded) {
			t.Fatalf("post-event registration error = %v", err)
		}
	})
}

//go:fix inline
func ptr(value string) *string { return new(value) }

func eventInput(name string) event.EventInput {
	start := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	end := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	return event.EventInput{Name: name, Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published"}
}
func ticketInput(name string, capacity int64) ticket.TicketTypeInput {
	start := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	end := time.Now().UTC().Add(12 * time.Hour).Format(time.RFC3339)
	return ticket.TicketTypeInput{Name: name, Capacity: capacity, RegistrationStartsAt: &start, RegistrationEndsAt: &end}
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
