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

type Store interface {
	Register(context.Context, int64, string) error
	Cancel(context.Context, int64, string) error
	Status(context.Context, int64) (Status, error)
	IsAdmin(context.Context, string) (bool, error)
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
