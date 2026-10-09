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
	ErrSoldOut   = errors.New("sold_out")
	ErrDuplicate = errors.New("duplicate_registration")
	ErrNotFound  = errors.New("registration_not_found")
)

type Status struct {
	TicketTypeID int64 `json:"ticket_type_id"`
	Capacity     int64 `json:"capacity"`
	Reserved     int64 `json:"reserved"`
}

type TicketType struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Capacity int64  `json:"capacity"`
	Reserved int64  `json:"reserved"`
}

type Event struct {
	ID          int64        `json:"id"`
	Name        string       `json:"name"`
	TicketTypes []TicketType `json:"ticket_types"`
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
	CreateEvent(context.Context, string) (int64, error)
	UpdateEvent(context.Context, int64, string) error
	CreateTicketType(context.Context, int64, string, int64) (int64, error)
	UpdateTicketType(context.Context, int64, string, int64) error
}

type Query interface {
	Status(context.Context, int64) (Status, error)
	Events(context.Context) ([]Event, error)
	Event(context.Context, int64) (Event, error)
	Registrations(context.Context, string) ([]Registration, error)
}

type SQLCommand struct{ DB *sql.DB }
type SQLQuery struct{ DB *sql.DB }

var sqliteExpr = expr.Builder[sqdialect.Expression, sqdialect.Expression]{}

func arg(values ...any) sqdialect.Expression { return sqliteExpr.Arg(values...) }

func quote(names ...string) sqdialect.Expression { return sqliteExpr.Quote(names...) }

func str(value string) sqdialect.Expression { return sqliteExpr.S(value) }

func and(values ...bob.Expression) sqdialect.Expression { return sqliteExpr.And(values...) }

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

func updateQuery(mods ...bob.Mod[*sqdialect.UpdateQuery]) bob.BaseQuery[*sqdialect.UpdateQuery] {
	q := &sqdialect.UpdateQuery{}
	for _, mod := range mods {
		mod.Apply(q)
	}
	return bob.BaseQuery[*sqdialect.UpdateQuery]{Expression: q, Dialect: sqdialect.Dialect, QueryType: bob.QueryTypeUpdate}
}

func exec(ctx context.Context, db *sql.DB, query bob.Query) (sql.Result, error) {
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return nil, err
	}
	return db.ExecContext(ctx, sqlText, args...)
}
