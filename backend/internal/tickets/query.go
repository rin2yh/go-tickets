package tickets

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/stephenafamo/bob"
	sqdialect "github.com/stephenafamo/bob/dialect/sqlite/dialect"
	"github.com/stephenafamo/bob/dialect/sqlite/sm"
)

type eventRow struct {
	id         int64
	name       string
	ticketID   sql.NullInt64
	ticketName sql.NullString
	capacity   sql.NullInt64
	reserved   sql.NullInt64
}

func (s SQLQuery) Status(ctx context.Context, typeID int64) (Status, error) {
	query := selectQuery(sm.Columns("id", "capacity", "reserved"), sm.From("ticket_types"), sm.Where(quote("id").EQ(arg(typeID))))
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

func (s SQLQuery) IsAdmin(ctx context.Context, userID string) (bool, error) {
	var isAdmin bool
	if err := s.DB.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM administrators WHERE clerk_user_id = ?)", userID).Scan(&isAdmin); err != nil {
		return false, fmt.Errorf("admin lookup: %w", err)
	}
	return isAdmin, nil
}

func eventsQuery(eventID *int64) bob.BaseQuery[*sqdialect.SelectQuery] {
	mods := []bob.Mod[*sqdialect.SelectQuery]{
		sm.Columns(quote("e", "id"), quote("e", "name"), quote("t", "id"), quote("t", "name"), quote("t", "capacity"), quote("t", "reserved")),
		sm.From("events").As("e"),
		sm.LeftJoin("ticket_types").As("t").OnEQ(quote("t", "event_id"), quote("e", "id")),
	}
	if eventID != nil {
		mods = append(mods, sm.Where(quote("e", "id").EQ(arg(*eventID))), sm.OrderBy(quote("t", "id")).Asc())
	} else {
		mods = append(mods, sm.OrderBy(quote("e", "id")).Asc(), sm.OrderBy(quote("t", "id")).Asc())
	}
	return selectQuery(mods...)
}

func (s SQLQuery) readEvents(ctx context.Context, query bob.Query) ([]Event, error) {
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

func (s SQLQuery) Events(ctx context.Context) ([]Event, error) {
	result, err := s.readEvents(ctx, eventsQuery(nil))
	if err != nil {
		return nil, fmt.Errorf("events: %w", err)
	}
	return result, nil
}

func (s SQLQuery) Event(ctx context.Context, eventID int64) (Event, error) {
	result, err := s.readEvents(ctx, eventsQuery(&eventID))
	if err != nil {
		return Event{}, fmt.Errorf("event: %w", err)
	}
	if len(result) == 0 {
		return Event{}, sql.ErrNoRows
	}
	return result[0], nil
}

func (s SQLQuery) Registrations(ctx context.Context, userID string) ([]Registration, error) {
	query := selectQuery(
		sm.Columns(quote("r", "ticket_type_id"), quote("e", "name"), quote("t", "name"), quote("r", "status")),
		sm.From("registrations").As("r"),
		sm.InnerJoin("ticket_types").As("t").OnEQ(quote("t", "id"), quote("r", "ticket_type_id")),
		sm.InnerJoin("events").As("e").OnEQ(quote("e", "id"), quote("t", "event_id")),
		sm.Where(quote("r", "user_id").EQ(arg(userID))),
		sm.OrderBy(quote("e", "id")).Asc(), sm.OrderBy(quote("t", "id")).Asc(),
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
