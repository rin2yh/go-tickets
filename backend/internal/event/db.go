package event

import (
	"context"
	"database/sql"
	"errors"
)

var ErrNotFound = errors.New("event_not_found")

type TicketType struct {
	ID                   int64   `json:"id"`
	Name                 string  `json:"name"`
	Capacity             int64   `json:"capacity"`
	Reserved             int64   `json:"reserved"`
	RegistrationStartsAt *string `json:"registration_starts_at"`
	RegistrationEndsAt   *string `json:"registration_ends_at"`
}

type Event struct {
	ID                int64        `json:"id"`
	Name              string       `json:"name"`
	Description       string       `json:"description"`
	StartsAt          *string      `json:"starts_at"`
	EndsAt            *string      `json:"ends_at"`
	VenueName         *string      `json:"venue_name"`
	VenueAddress      *string      `json:"venue_address"`
	PublicationStatus string       `json:"publication_status"`
	TicketTypes       []TicketType `json:"ticket_types"`
}

type EventInput struct {
	Name              string
	Description       string
	StartsAt          *string
	EndsAt            *string
	VenueName         *string
	VenueAddress      *string
	PublicationStatus string
}

type Query interface {
	Events(context.Context) ([]Event, error)
	Event(context.Context, int64) (Event, error)
	AdminEvents(context.Context) ([]Event, error)
	AdminEvent(context.Context, int64) (Event, error)
}

type Command interface {
	CreateEvent(context.Context, EventInput) (int64, error)
	UpdateEvent(context.Context, int64, EventInput) error
}

type SQLQuery struct{ DB *sql.DB }
type SQLCommand struct{ DB *sql.DB }
