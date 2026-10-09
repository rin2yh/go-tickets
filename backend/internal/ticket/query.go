package ticket

import (
	"context"
	"fmt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/sqlite/sm"
)

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
