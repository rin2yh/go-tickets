package tickets

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/sqlite"
	sqdialect "github.com/stephenafamo/bob/dialect/sqlite/dialect"
	"github.com/stephenafamo/bob/dialect/sqlite/im"
	"github.com/stephenafamo/bob/dialect/sqlite/sm"
	"github.com/stephenafamo/bob/dialect/sqlite/um"
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

type Store interface {
	Register(context.Context, int64, string) error
	Cancel(context.Context, int64, string) error
	Status(context.Context, int64) (Status, error)
	IsAdmin(context.Context, string) (bool, error)
	Events(context.Context) ([]Event, error)
	Event(context.Context, int64) (Event, error)
	Registrations(context.Context, string) ([]Registration, error)
	CreateEvent(context.Context, string) (int64, error)
	UpdateEvent(context.Context, int64, string) error
	CreateTicketType(context.Context, int64, string, int64) (int64, error)
	UpdateTicketType(context.Context, int64, string, int64) error
}

type SQLStore struct{ DB *sql.DB }

// SQLStore keeps database/sql as the executor so the workers-go D1 Connector
// remains usable. Bob builds each statement and its positional arguments.
func (s SQLStore) exec(ctx context.Context, query bob.Query) (sql.Result, error) {
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return nil, err
	}
	return s.DB.ExecContext(ctx, sqlText, args...)
}

func (s SQLStore) CreateEvent(ctx context.Context, name string) (int64, error) {
	result, err := s.exec(ctx, sqlite.Insert(im.Into("events", "name"), im.Values(sqlite.Arg(name))))
	if err != nil {
		return 0, fmt.Errorf("create event: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLStore) UpdateEvent(ctx context.Context, id int64, name string) error {
	result, err := s.exec(ctx, sqlite.Update(um.Table("events"), um.Set(um.SetCol("name").ToArg(name)), um.Where(sqlite.Quote("id").EQ(sqlite.Arg(id)))))
	if err != nil {
		return fmt.Errorf("update event: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s SQLStore) CreateTicketType(ctx context.Context, eventID int64, name string, capacity int64) (int64, error) {
	result, err := s.exec(ctx, sqlite.Insert(im.Into("ticket_types", "event_id", "name", "capacity"), im.Values(sqlite.Arg(eventID, name, capacity))))
	if err != nil {
		return 0, fmt.Errorf("create ticket type: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLStore) UpdateTicketType(ctx context.Context, id int64, name string, capacity int64) error {
	result, err := s.exec(ctx, sqlite.Update(um.Table("ticket_types"), um.Set(um.SetCol("name").ToArg(name), um.SetCol("capacity").ToArg(capacity)), um.Where(sqlite.Quote("id").EQ(sqlite.Arg(id)))))
	if err != nil {
		return fmt.Errorf("update ticket type: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s SQLStore) Register(ctx context.Context, typeID int64, userID string) error {
	// The trigger performs the conditional counter update in the same SQLite statement.
	// RAISE(ABORT) rolls the INSERT back when the UPDATE affects zero rows.
	_, err := s.exec(ctx, sqlite.Insert(im.Into("registrations", "ticket_type_id", "user_id"), im.Values(sqlite.Arg(typeID, userID))))
	if err != nil {
		if strings.Contains(err.Error(), "sold_out") {
			return ErrSoldOut
		}
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrDuplicate
		}
		return fmt.Errorf("register: %w", err)
	}
	return nil
}

func (s SQLStore) Cancel(ctx context.Context, typeID int64, userID string) error {
	result, err := s.exec(ctx, sqlite.Update(
		um.Table("registrations"), um.Set(um.SetCol("status").To(sqlite.S("cancelled"))),
		um.Where(sqlite.And(sqlite.Quote("ticket_type_id").EQ(sqlite.Arg(typeID)), sqlite.Quote("user_id").EQ(sqlite.Arg(userID)), sqlite.Quote("status").EQ(sqlite.S("active")))),
	))
	if err != nil {
		return fmt.Errorf("cancel: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cancel rows affected: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s SQLStore) Status(ctx context.Context, typeID int64) (Status, error) {
	query := sqlite.Select(sm.Columns("id", "capacity", "reserved"), sm.From("ticket_types"), sm.Where(sqlite.Quote("id").EQ(sqlite.Arg(typeID))))
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return Status{}, fmt.Errorf("status: %w", err)
	}
	var result Status
	err = s.DB.QueryRowContext(ctx, sqlText, args...).Scan(&result.TicketTypeID, &result.Capacity, &result.Reserved)
	if err != nil {
		return Status{}, fmt.Errorf("status: %w", err)
	}
	return result, nil
}

func (s SQLStore) IsAdmin(ctx context.Context, userID string) (bool, error) {
	query := sqlite.Select(sm.Columns(sqlite.Exists(sqlite.Select(
		sm.Columns("1"),
		sm.From("administrators"),
		sm.Where(sqlite.Quote("clerk_user_id").EQ(sqlite.Arg(userID))),
	))))
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return false, fmt.Errorf("admin lookup: %w", err)
	}
	var isAdmin int
	if err := s.DB.QueryRowContext(ctx, sqlText, args...).Scan(&isAdmin); err != nil {
		return false, fmt.Errorf("admin lookup: %w", err)
	}
	return isAdmin == 1, nil
}

type eventRow struct {
	id         int64
	name       string
	ticketID   sql.NullInt64
	ticketName sql.NullString
	capacity   sql.NullInt64
	reserved   sql.NullInt64
}

func eventsQuery(eventID *int64) bob.BaseQuery[*sqdialect.SelectQuery] {
	mods := []bob.Mod[*sqdialect.SelectQuery]{
		sm.Columns(sqlite.Quote("e", "id"), sqlite.Quote("e", "name"), sqlite.Quote("t", "id"), sqlite.Quote("t", "name"), sqlite.Quote("t", "capacity"), sqlite.Quote("t", "reserved")),
		sm.From("events").As("e"),
		sm.LeftJoin("ticket_types").As("t").OnEQ(sqlite.Quote("t", "event_id"), sqlite.Quote("e", "id")),
	}
	if eventID != nil {
		mods = append(mods, sm.Where(sqlite.Quote("e", "id").EQ(sqlite.Arg(*eventID))), sm.OrderBy(sqlite.Quote("t", "id")).Asc())
	} else {
		mods = append(mods, sm.OrderBy(sqlite.Quote("e", "id")).Asc(), sm.OrderBy(sqlite.Quote("t", "id")).Asc())
	}
	return sqlite.Select(mods...)
}

func (s SQLStore) readEvents(ctx context.Context, query bob.Query) ([]Event, error) {
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	events := []Event{}
	for rows.Next() {
		var row eventRow
		if err := rows.Scan(&row.id, &row.name, &row.ticketID, &row.ticketName, &row.capacity, &row.reserved); err != nil {
			return nil, err
		}
		if len(events) == 0 || events[len(events)-1].ID != row.id {
			events = append(events, Event{ID: row.id, Name: row.name, TicketTypes: []TicketType{}})
		}
		if row.ticketID.Valid {
			events[len(events)-1].TicketTypes = append(events[len(events)-1].TicketTypes, TicketType{ID: row.ticketID.Int64, Name: row.ticketName.String, Capacity: row.capacity.Int64, Reserved: row.reserved.Int64})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func (s SQLStore) Events(ctx context.Context) ([]Event, error) {
	result, err := s.readEvents(ctx, eventsQuery(nil))
	if err != nil {
		return nil, fmt.Errorf("events: %w", err)
	}
	return result, nil
}

func (s SQLStore) Event(ctx context.Context, eventID int64) (Event, error) {
	result, err := s.readEvents(ctx, eventsQuery(&eventID))
	if err != nil {
		return Event{}, fmt.Errorf("event: %w", err)
	}
	if len(result) == 0 {
		return Event{}, sql.ErrNoRows
	}
	return result[0], nil
}

func (s SQLStore) Registrations(ctx context.Context, userID string) ([]Registration, error) {
	query := sqlite.Select(
		sm.Columns(sqlite.Quote("r", "ticket_type_id"), sqlite.Quote("e", "name"), sqlite.Quote("t", "name"), sqlite.Quote("r", "status")),
		sm.From("registrations").As("r"),
		sm.InnerJoin("ticket_types").As("t").OnEQ(sqlite.Quote("t", "id"), sqlite.Quote("r", "ticket_type_id")),
		sm.InnerJoin("events").As("e").OnEQ(sqlite.Quote("e", "id"), sqlite.Quote("t", "event_id")),
		sm.Where(sqlite.Quote("r", "user_id").EQ(sqlite.Arg(userID))),
		sm.OrderBy(sqlite.Quote("e", "id")).Asc(), sm.OrderBy(sqlite.Quote("t", "id")).Asc(),
	)
	sqlText, args, err := bob.Build(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("registrations: %w", err)
	}
	rows, err := s.DB.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, fmt.Errorf("registrations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := []Registration{}
	for rows.Next() {
		var item Registration
		if err := rows.Scan(&item.TicketTypeID, &item.EventName, &item.TicketName, &item.Status); err != nil {
			return nil, fmt.Errorf("registrations scan: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("registrations rows: %w", err)
	}
	return result, nil
}
