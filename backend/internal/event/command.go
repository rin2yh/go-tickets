package event

import (
	"context"
	"fmt"
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
