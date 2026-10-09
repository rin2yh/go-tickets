package ticket

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/sqlite/sm"
)

type eventRow struct {
	id                int64
	name              string
	description       string
	startsAt          sql.NullString
	endsAt            sql.NullString
	venueName         sql.NullString
	venueAddress      sql.NullString
	publicationStatus string
	ticketID          sql.NullInt64
	ticketName        sql.NullString
	capacity          sql.NullInt64
	reserved          sql.NullInt64
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

func (s SQLQuery) readEvents(ctx context.Context, eventID *int64, admin bool) ([]Event, error) {
	query := `SELECT e.id, e.name, e.description, e.starts_at, e.ends_at, e.venue_name, e.venue_address, e.publication_status, t.id, t.name, t.capacity, t.reserved, t.registration_starts_at, t.registration_ends_at FROM events e LEFT JOIN ticket_types t ON t.event_id = e.id`
	args := []any{}
	if eventID != nil {
		query += ` WHERE e.id = ?`
		args = append(args, *eventID)
		if !admin {
			query += ` AND e.publication_status = 'published'`
		}
	} else if !admin {
		query += ` WHERE e.publication_status = 'published'`
	}
	query += ` ORDER BY e.id, t.id`
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	events := []Event{}
	for rows.Next() {
		var row eventRow
		var registrationStarts, registrationEnds sql.NullString
		if err := rows.Scan(&row.id, &row.name, &row.description, &row.startsAt, &row.endsAt, &row.venueName, &row.venueAddress, &row.publicationStatus, &row.ticketID, &row.ticketName, &row.capacity, &row.reserved, &registrationStarts, &registrationEnds); err != nil {
			return nil, err
		}
		if len(events) == 0 || events[len(events)-1].ID != row.id {
			events = append(events, Event{ID: row.id, Name: row.name, Description: row.description, StartsAt: nullableString(row.startsAt), EndsAt: nullableString(row.endsAt), VenueName: nullableString(row.venueName), VenueAddress: nullableString(row.venueAddress), PublicationStatus: row.publicationStatus, TicketTypes: []TicketType{}})
		}
		if row.ticketID.Valid {
			events[len(events)-1].TicketTypes = append(events[len(events)-1].TicketTypes, TicketType{ID: row.ticketID.Int64, Name: row.ticketName.String, Capacity: row.capacity.Int64, Reserved: row.reserved.Int64, RegistrationStartsAt: nullableString(registrationStarts), RegistrationEndsAt: nullableString(registrationEnds)})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func (s SQLQuery) Events(ctx context.Context) ([]Event, error) { return s.readPublicEvents(ctx, nil) }
func (s SQLQuery) Event(ctx context.Context, eventID int64) (Event, error) {
	return s.readPublicEvent(ctx, eventID, false)
}
func (s SQLQuery) AdminEvents(ctx context.Context) ([]Event, error) {
	return s.readEvents(ctx, nil, true)
}
func (s SQLQuery) AdminEvent(ctx context.Context, eventID int64) (Event, error) {
	return s.readPublicEvent(ctx, eventID, true)
}
func (s SQLQuery) readPublicEvents(ctx context.Context, id *int64) ([]Event, error) {
	return s.readEvents(ctx, id, false)
}
func (s SQLQuery) readPublicEvent(ctx context.Context, id int64, admin bool) (Event, error) {
	result, err := s.readEvents(ctx, &id, admin)
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
