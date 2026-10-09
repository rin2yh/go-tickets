package event

import (
	"context"
	"database/sql"
	"fmt"
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
	registrationStart sql.NullString
	registrationEnd   sql.NullString
}

func (s SQLQuery) Events(ctx context.Context) ([]Event, error) {
	return s.read(ctx, nil, false)
}

func (s SQLQuery) Event(ctx context.Context, id int64) (Event, error) {
	return s.one(ctx, id, false)
}

func (s SQLQuery) AdminEvents(ctx context.Context) ([]Event, error) {
	return s.read(ctx, nil, true)
}

func (s SQLQuery) AdminEvent(ctx context.Context, id int64) (Event, error) {
	return s.one(ctx, id, true)
}

func (s SQLQuery) one(ctx context.Context, id int64, admin bool) (Event, error) {
	items, err := s.read(ctx, &id, admin)
	if err != nil {
		return Event{}, fmt.Errorf("event query: %w", err)
	}
	if len(items) == 0 {
		return Event{}, sql.ErrNoRows
	}
	return items[0], nil
}

func (s SQLQuery) read(ctx context.Context, id *int64, admin bool) ([]Event, error) {
	query := `SELECT e.id, e.name, e.description, e.starts_at, e.ends_at, e.venue_name, e.venue_address, e.publication_status, t.id, t.name, t.capacity, t.reserved, t.registration_starts_at, t.registration_ends_at FROM events e LEFT JOIN ticket_types t ON t.event_id = e.id`
	args := []any{}
	if id != nil {
		query += ` WHERE e.id = ?`
		args = append(args, *id)
		if !admin {
			query += ` AND e.publication_status = 'published'`
		}
	} else if !admin {
		query += ` WHERE e.publication_status = 'published'`
	}
	query += ` ORDER BY e.id, t.id`
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("events query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := []Event{}
	for rows.Next() {
		var row eventRow
		if err := rows.Scan(&row.id, &row.name, &row.description, &row.startsAt, &row.endsAt, &row.venueName, &row.venueAddress, &row.publicationStatus, &row.ticketID, &row.ticketName, &row.capacity, &row.reserved, &row.registrationStart, &row.registrationEnd); err != nil {
			return nil, fmt.Errorf("events scan: %w", err)
		}
		if len(items) == 0 || items[len(items)-1].ID != row.id {
			items = append(items, Event{ID: row.id, Name: row.name, Description: row.description, StartsAt: nullableString(row.startsAt), EndsAt: nullableString(row.endsAt), VenueName: nullableString(row.venueName), VenueAddress: nullableString(row.venueAddress), PublicationStatus: row.publicationStatus, TicketTypes: []TicketType{}})
		}
		if row.ticketID.Valid {
			items[len(items)-1].TicketTypes = append(items[len(items)-1].TicketTypes, TicketType{ID: row.ticketID.Int64, Name: row.ticketName.String, Capacity: row.capacity.Int64, Reserved: row.reserved.Int64, RegistrationStartsAt: nullableString(row.registrationStart), RegistrationEndsAt: nullableString(row.registrationEnd)})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("events rows: %w", err)
	}
	return items, nil
}

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}
