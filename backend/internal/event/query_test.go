package event_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/test/store"
)

func TestEvents(t *testing.T) {
	db := store.NewDB(t)
	store.Seed(t, db)
	ctx := context.Background()
	query := event.SQLQuery{DB: db}
	start, end := "2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z"
	regStart, regEnd := "2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z"
	want := []event.Event{
		{ID: 1, Name: "Later", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{{ID: 11, Name: "Alpha", Capacity: 2, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 12, Name: "Zed", Capacity: 3, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
		{ID: 2, Name: "Earlier", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{{ID: 21, Name: "General", Capacity: 1, Reserved: 1, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}, {ID: 30, Name: "No registrations", Capacity: 0, Reserved: 0, RegistrationStartsAt: &regStart, RegistrationEndsAt: &regEnd}}},
		{ID: 3, Name: "Empty", Description: "Description", StartsAt: &start, EndsAt: &end, PublicationStatus: "published", TicketTypes: []event.TicketType{}},
	}
	t.Run("Events returns published events and ticket types", func(t *testing.T) {
		got, err := query.Events(ctx)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Events() = %#v, %v; want %#v", got, err, want)
		}
	})
	t.Run("Event returns a published event", func(t *testing.T) {
		got, err := query.Event(ctx, 1)
		if err != nil || !reflect.DeepEqual(got, want[0]) {
			t.Fatalf("Event() = %#v, %v; want %#v", got, err, want[0])
		}
	})

	draftID, err := (event.SQLCommand{DB: db}).CreateEvent(ctx, event.EventInput{Name: "Draft"})
	if err != nil {
		t.Fatal(err)
	}
	t.Run("AdminEvents includes drafts", func(t *testing.T) {
		got, err := query.AdminEvents(ctx)
		if err != nil || len(got) != len(want)+1 || got[len(got)-1].ID != draftID {
			t.Fatalf("AdminEvents() = %#v, %v", got, err)
		}
	})
	t.Run("AdminEvent returns drafts", func(t *testing.T) {
		got, err := query.AdminEvent(ctx, draftID)
		if err != nil || got.ID != draftID || got.PublicationStatus != "draft" {
			t.Fatalf("AdminEvent() = %#v, %v", got, err)
		}
	})
	if _, err := query.Event(ctx, draftID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("public draft lookup error = %v", err)
	}
}
