package ticket

import (
	"context"
	"fmt"
	"strings"

	"github.com/stephenafamo/bob/dialect/sqlite/im"
	"github.com/stephenafamo/bob/dialect/sqlite/um"
)

func (s SQLCommand) CreateEvent(ctx context.Context, name string) (int64, error) {
	result, err := exec(ctx, s.DB, insertQuery(im.Into("events", "name"), im.Values(arg(name))))
	if err != nil {
		return 0, fmt.Errorf("create event: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLCommand) UpdateEvent(ctx context.Context, id int64, name string) error {
	result, err := exec(ctx, s.DB, updateQuery(um.Table("events"), um.Set(um.SetCol("name").ToArg(name)), um.Where(quote("id").EQ(arg(id)))))
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

func (s SQLCommand) CreateTicketType(ctx context.Context, eventID int64, name string, capacity int64) (int64, error) {
	result, err := exec(ctx, s.DB, insertQuery(im.Into("ticket_types", "event_id", "name", "capacity"), im.Values(arg(eventID, name, capacity))))
	if err != nil {
		return 0, fmt.Errorf("create ticket type: %w", err)
	}
	return result.LastInsertId()
}

func (s SQLCommand) UpdateTicketType(ctx context.Context, id int64, name string, capacity int64) error {
	result, err := exec(ctx, s.DB, updateQuery(um.Table("ticket_types"), um.Set(um.SetCol("name").ToArg(name), um.SetCol("capacity").ToArg(capacity)), um.Where(quote("id").EQ(arg(id)))))
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
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return ErrDuplicate
		}
		return fmt.Errorf("register: %w", err)
	}
	return nil
}

func (s SQLCommand) Cancel(ctx context.Context, typeID int64, userID string) error {
	result, err := exec(ctx, s.DB, updateQuery(
		um.Table("registrations"), um.Set(um.SetCol("status").To(str("cancelled"))),
		um.Where(and(quote("ticket_type_id").EQ(arg(typeID)), quote("user_id").EQ(arg(userID)), quote("status").EQ(str("active")))),
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
