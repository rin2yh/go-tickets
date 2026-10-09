package ticket

import (
	"context"
	"database/sql"
	"errors"

	"github.com/stephenafamo/bob"
	sqdialect "github.com/stephenafamo/bob/dialect/sqlite/dialect"
	"github.com/stephenafamo/bob/expr"
)

var (
	ErrSoldOut                = errors.New("sold_out")
	ErrDuplicate              = errors.New("duplicate_registration")
	ErrNotFound               = errors.New("registration_not_found")
	ErrUnpublished            = errors.New("event_unpublished")
	ErrRegistrationNotStarted = errors.New("registration_not_started")
	ErrRegistrationEnded      = errors.New("registration_ended")
	ErrEventEnded             = errors.New("event_ended")
)

type Status struct {
	TicketTypeID int64 `json:"ticket_type_id"`
	Capacity     int64 `json:"capacity"`
	Reserved     int64 `json:"reserved"`
}

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

type TicketTypeInput struct {
	Name                 string
	Capacity             int64
	RegistrationStartsAt *string
	RegistrationEndsAt   *string
}

type Registration struct {
	TicketTypeID int64  `json:"ticket_type_id"`
	EventName    string `json:"event_name"`
	TicketName   string `json:"ticket_name"`
	Status       string `json:"status"`
}

type Command interface {
	Register(context.Context, int64, string) error
	Cancel(context.Context, int64, string) error
	CreateEvent(context.Context, EventInput) (int64, error)
	UpdateEvent(context.Context, int64, EventInput) error
	CreateTicketType(context.Context, int64, TicketTypeInput) (int64, error)
	UpdateTicketType(context.Context, int64, TicketTypeInput) error
}

type Query interface {
	Status(context.Context, int64) (Status, error)
	Events(context.Context) ([]Event, error)
	Event(context.Context, int64) (Event, error)
	AdminEvents(context.Context) ([]Event, error)
	AdminEvent(context.Context, int64) (Event, error)
	Registrations(context.Context, string) ([]Registration, error)
}

type SQLCommand struct{ DB *sql.DB }
type SQLQuery struct{ DB *sql.DB }

var sqliteExpr = expr.Builder[sqdialect.Expression, sqdialect.Expression]{}

func arg(values ...any) sqdialect.Expression { return sqliteExpr.Arg(values...) }

func quote(names ...string) sqdialect.Expression { return sqliteExpr.Quote(names...) }

func selectQuery(mods ...bob.Mod[*sqdialect.SelectQuery]) bob.BaseQuery[*sqdialect.SelectQuery] {
	q := &sqdialect.SelectQuery{}
	for _, mod := range mods {
		mod.Apply(q)
	}
	return bob.BaseQuery[*sqdialect.SelectQuery]{Expression: q, Dialect: sqdialect.Dialect, QueryType: bob.QueryTypeSelect}
}

func insertQuery(mods ...bob.Mod[*sqdialect.InsertQuery]) bob.BaseQuery[*sqdialect.InsertQuery] {
	q := &sqdialect.InsertQuery{}
	for _, mod := range mods {
		mod.Apply(q)
	}
	return bob.BaseQuery[*sqdialect.InsertQuery]{Expression: q, Dialect: sqdialect.Dialect, QueryType: bob.QueryTypeInsert}
}

func exec(ctx context.Context, db *sql.DB, query bob.Query) (sql.Result, error) {
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return nil, err
	}
	return db.ExecContext(ctx, sqlText, args...)
}
