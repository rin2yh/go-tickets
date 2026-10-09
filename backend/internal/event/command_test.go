package event_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/test/store"
)

func TestCreateEvent(t *testing.T) {
	db := store.NewDB(t)
	command := event.SQLCommand{DB: db}
	id, err := command.CreateEvent(context.Background(), event.EventInput{Name: "Draft"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := (event.SQLQuery{DB: db}).AdminEvent(context.Background(), id)
	if err != nil || got.Name != "Draft" || got.PublicationStatus != "draft" {
		t.Fatalf("created draft = %#v, %v", got, err)
	}
}

func TestUpdateEvent(t *testing.T) {
	db := store.NewDB(t)
	command, query := event.SQLCommand{DB: db}, event.SQLQuery{DB: db}
	ctx := context.Background()
	id, err := command.CreateEvent(ctx, event.EventInput{Name: "Draft"})
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	end := time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339)
	input := event.EventInput{Name: "Published", Description: "Details", StartsAt: &start, EndsAt: &end, PublicationStatus: "published"}
	if err := command.UpdateEvent(ctx, id, input); err != nil {
		t.Fatal(err)
	}
	got, err := query.Event(ctx, id)
	if err != nil || got.Name != "Published" || got.Description != "Details" {
		t.Fatalf("updated event = %#v, %v", got, err)
	}
	if err := command.UpdateEvent(ctx, 404, input); !errors.Is(err, event.ErrNotFound) {
		t.Fatalf("missing event update error = %v", err)
	}
}
