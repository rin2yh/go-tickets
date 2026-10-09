package ticket

import (
	"context"
	"fmt"
	"strings"

	"github.com/stephenafamo/bob/dialect/sqlite/im"
)

func (s SQLCommand) CreateEvent(ctx context.Context, input EventInput) (int64, error) {
	if input.PublicationStatus == "" {
		input.PublicationStatus = "draft"
	}
	result, err := s.DB.ExecContext(ctx, `INSERT INTO events(name, description, starts_at, ends_at, venue_name, venue_address, publication_status) VALUES (?, ?, ?, ?, ?, ?, ?)`, input.Name, input.Description, input.StartsAt, input.EndsAt, input.VenueName, input.VenueAddress, input.PublicationStatus)
	if err != nil {
		return 0, fmt.Errorf("create event: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLCommand) UpdateEvent(ctx context.Context, id int64, input EventInput) error {
	if input.PublicationStatus == "" {
		input.PublicationStatus = "draft"
	}
	result, err := s.DB.ExecContext(ctx, `UPDATE events SET name = ?, description = ?, starts_at = ?, ends_at = ?, venue_name = ?, venue_address = ?, publication_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, input.Name, input.Description, input.StartsAt, input.EndsAt, input.VenueName, input.VenueAddress, input.PublicationStatus, id)
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

func (s SQLCommand) CreateTicketType(ctx context.Context, eventID int64, input TicketTypeInput) (int64, error) {
	result, err := s.DB.ExecContext(ctx, `INSERT INTO ticket_types(event_id, name, capacity, registration_starts_at, registration_ends_at) VALUES (?, ?, ?, ?, ?)`, eventID, input.Name, input.Capacity, input.RegistrationStartsAt, input.RegistrationEndsAt)
	if err != nil {
		return 0, fmt.Errorf("create ticket type: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLCommand) UpdateTicketType(ctx context.Context, id int64, input TicketTypeInput) error {
	result, err := s.DB.ExecContext(ctx, `UPDATE ticket_types SET name = ?, capacity = ?, registration_starts_at = ?, registration_ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, input.Name, input.Capacity, input.RegistrationStartsAt, input.RegistrationEndsAt, id)
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

func (s SQLCommand) Register(ctx context.Context, typeID int64, userID string) error {
	// The trigger performs the conditional counter update in the same SQLite statement.
	// RAISE(ABORT) rolls the INSERT back when the UPDATE affects zero rows.
	_, err := exec(ctx, s.DB, insertQuery(im.Into("registrations", "ticket_type_id", "user_id"), im.Values(arg(typeID, userID))))
	if err != nil {
		if strings.Contains(err.Error(), "sold_out") {
			return ErrSoldOut
		}
		if strings.Contains(err.Error(), "event_unpublished") {
			return ErrUnpublished
		}
		if strings.Contains(err.Error(), "registration_not_started") {
			return ErrRegistrationNotStarted
		}
		if strings.Contains(err.Error(), "registration_ended") {
			return ErrRegistrationEnded
		}
		if strings.Contains(err.Error(), "event_ended") {
			return ErrEventEnded
		}
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrDuplicate
		}
		return fmt.Errorf("register: %w", err)
	}
	return nil
}

func (s SQLCommand) Cancel(ctx context.Context, typeID int64, userID string) error {
	result, err := s.DB.ExecContext(ctx, `UPDATE registrations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE ticket_type_id = ? AND user_id = ? AND status = 'active'`, typeID, userID)
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
