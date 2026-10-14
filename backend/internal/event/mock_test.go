package event_test

import (
	"context"

	"github.com/rin2yh/go-tickets/internal/event"
)

type httpQuery struct {
	err        error
	events     []event.Event
	event      event.Event
	adminEvent event.Event
}

func (q httpQuery) Events(context.Context) ([]event.Event, error)      { return q.events, q.err }
func (q httpQuery) AdminEvents(context.Context) ([]event.Event, error) { return q.events, q.err }
func (q httpQuery) Event(context.Context, int64) (event.Event, error)  { return q.event, q.err }
func (q httpQuery) AdminEvent(context.Context, int64) (event.Event, error) {
	return q.adminEvent, q.err
}

type httpCommand struct {
	createErr error
	updateErr error
}

func (c httpCommand) CreateEvent(context.Context, event.EventInput) (int64, error) {
	return 42, c.createErr
}
func (c httpCommand) UpdateEvent(context.Context, int64, event.EventInput) error { return c.updateErr }
