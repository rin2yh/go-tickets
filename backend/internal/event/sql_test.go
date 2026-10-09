package event_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/test/store"
	"github.com/rin2yh/go-tickets/internal/ticket"
)

func TestSQLQuery(t *testing.T) {
	db := store.NewDB(t)
	store.Seed(t, db)
	query := event.SQLQuery{DB: db}
	ctx := context.Background()
	got, err := query.Events(ctx)
	start, end := "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z"
	regStart, regEnd := "2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"
	want := []event.Event{
		{ID: 1, Name: "Later", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
		{ID: 2, Name: "Earlier", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{{ID: 21, Name: "General", Capacity: 1, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 30, Name: "No registrations", Capacity: 0, Reserved: 0, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
		{ID: 3, Name: "Empty", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{}},
	}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Events() = %#v, %v; want %#v", got, err, want)
	}
	if _, err := query.Event(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("Event(missing) error = %v", err)
	}
}

func TestSQLCommand(t *testing.T) {
	db := store.NewDB(t)
	ctx := context.Background()
	commands, queries := event.SQLCommand{DB: db}, event.SQLQuery{DB: db}
	start := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	end := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	input := event.EventInput{Name: "Draft"}
	id, err := commands.CreateEvent(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := queries.Event(ctx, id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("public draft lookup error = %v", err)
	}
	if _, err := queries.AdminEvent(ctx, id); err != nil {
		t.Fatalf("admin draft lookup: %v", err)
	}
	input = event.EventInput{Name: "Published", Description: "Details", StartsAt: &start, EndsAt: &end, PublicationStatus: "published"}
	if err := commands.UpdateEvent(ctx, id, input); err != nil {
		t.Fatal(err)
	}
	ticketID, err := (ticket.SQLCommand{DB: db}).CreateTicketType(ctx, id, ticket.TicketTypeInput{Name: "General", Capacity: 3, RegistrationStartsAt: &start, RegistrationEndsAt: &end})
	if err != nil {
		t.Fatal(err)
	}
	got, err := queries.Event(ctx, id)
	if err != nil || got.Name != "Published" || len(got.TicketTypes) != 1 || got.TicketTypes[0].ID != ticketID {
		t.Fatalf("published event with ticket types = %#v, %v", got, err)
	}
	if err := commands.UpdateEvent(ctx, 404, input); !errors.Is(err, event.ErrNotFound) {
		t.Fatalf("missing event update error = %v", err)
	}
}
