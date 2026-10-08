package tickets

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
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
}

type SQLStore struct{ DB *sql.DB }

func (s SQLStore) Register(ctx context.Context, typeID int64, userID string) error {
	// The trigger performs the conditional counter update in the same SQLite statement.
	// RAISE(ABORT) rolls the INSERT back when the UPDATE affects zero rows.
	_, err := s.DB.ExecContext(ctx, `INSERT INTO registrations(ticket_type_id, user_id) VALUES (?, ?)`, typeID, userID)
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
	result, err := s.DB.ExecContext(ctx, `UPDATE registrations SET status = 'cancelled' WHERE ticket_type_id = ? AND user_id = ? AND status = 'active'`, typeID, userID)
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
	var result Status
	err := s.DB.QueryRowContext(ctx, `SELECT id, capacity, reserved FROM ticket_types WHERE id = ?`, typeID).Scan(&result.TicketTypeID, &result.Capacity, &result.Reserved)
	if err != nil {
		return Status{}, fmt.Errorf("status: %w", err)
	}
	return result, nil
}

func (s SQLStore) IsAdmin(ctx context.Context, userID string) (bool, error) {
	var isAdmin int
	err := s.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM administrators WHERE clerk_user_id = ?)`, userID).Scan(&isAdmin)
	if err != nil {
		return false, fmt.Errorf("admin lookup: %w", err)
	}
	return isAdmin == 1, nil
}

func (s SQLStore) Events(ctx context.Context) ([]Event, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT e.id, e.name, t.id, t.name, t.capacity, t.reserved
		FROM events e LEFT JOIN ticket_types t ON t.event_id = e.id ORDER BY e.id, t.id`)
	if err != nil {
		return nil, fmt.Errorf("events: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var events []Event
	for rows.Next() {
		var event Event
		var ticketID sql.NullInt64
		var ticketName sql.NullString
		var capacity, reserved sql.NullInt64
		if err := rows.Scan(&event.ID, &event.Name, &ticketID, &ticketName, &capacity, &reserved); err != nil {
			return nil, fmt.Errorf("events scan: %w", err)
		}
		if len(events) == 0 || events[len(events)-1].ID != event.ID {
			events = append(events, Event{ID: event.ID, Name: event.Name, TicketTypes: []TicketType{}})
		}
		if ticketID.Valid {
			events[len(events)-1].TicketTypes = append(events[len(events)-1].TicketTypes, TicketType{ID: ticketID.Int64, Name: ticketName.String, Capacity: capacity.Int64, Reserved: reserved.Int64})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("events rows: %w", err)
	}
	if events == nil {
		events = []Event{}
	}
	return events, nil
}

func (s SQLStore) Event(ctx context.Context, eventID int64) (Event, error) {
	var event Event
	event.TicketTypes = []TicketType{}
	rows, err := s.DB.QueryContext(ctx, `SELECT e.id, e.name, t.id, t.name, t.capacity, t.reserved
		FROM events e LEFT JOIN ticket_types t ON t.event_id = e.id WHERE e.id = ? ORDER BY t.id`, eventID)
	if err != nil {
		return Event{}, fmt.Errorf("event: %w", err)
	}
	defer func() { _ = rows.Close() }()
	found := false
	for rows.Next() {
		var ticketID sql.NullInt64
		var ticketName sql.NullString
		var capacity, reserved sql.NullInt64
		if err := rows.Scan(&event.ID, &event.Name, &ticketID, &ticketName, &capacity, &reserved); err != nil {
			return Event{}, fmt.Errorf("event scan: %w", err)
		}
		found = true
		if ticketID.Valid {
			event.TicketTypes = append(event.TicketTypes, TicketType{ID: ticketID.Int64, Name: ticketName.String, Capacity: capacity.Int64, Reserved: reserved.Int64})
		}
	}
	if err := rows.Err(); err != nil {
		return Event{}, fmt.Errorf("event rows: %w", err)
	}
	if !found {
		return Event{}, sql.ErrNoRows
	}
	return event, nil
}

func (s SQLStore) Registrations(ctx context.Context, userID string) ([]Registration, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT r.ticket_type_id, e.name, t.name, r.status
		FROM registrations r JOIN ticket_types t ON t.id = r.ticket_type_id JOIN events e ON e.id = t.event_id
		WHERE r.user_id = ? ORDER BY e.id, t.id`, userID)
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
