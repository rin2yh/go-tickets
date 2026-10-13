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

// AdminRegistrations returns one page of registrations and event-level counts.
func (s SQLQuery) AdminRegistrations(ctx context.Context, eventID int64, status, ticketID string, page int) (RegistrationPage, error) {
	var result RegistrationPage
	if err := s.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(capacity),0) FROM ticket_types WHERE event_id = ?`, eventID).Scan(&result.Capacity); err != nil {
		return result, err
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN r.status='active' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN r.status='cancelled' THEN 1 ELSE 0 END),0) FROM registrations r JOIN ticket_types t ON t.id=r.ticket_type_id WHERE t.event_id=?`, eventID).Scan(&result.Total, &result.Active, &result.Cancelled); err != nil {
		return result, err
	}
	if status != "active" && status != "cancelled" {
		status = "active"
	}
	query := `SELECT r.user_id, COALESCE(p.name,''), t.id, t.name, r.created_at FROM registrations r JOIN ticket_types t ON t.id=r.ticket_type_id LEFT JOIN participant_profiles p ON p.user_id=r.user_id WHERE t.event_id=? AND r.status=?`
	args := []any{eventID, status}
	if ticketID != "" && ticketID != "all" {
		query += ` AND t.id=?`
		args = append(args, ticketID)
	}
	var total int64
	if err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM (`+query+`)`, args...).Scan(&total); err != nil {
		return result, err
	}
	result.Total = total
	query += ` ORDER BY r.created_at ASC, r.id ASC LIMIT 50 OFFSET ?`
	args = append(args, (page-1)*50)
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return result, err
	}
	defer func() { _ = rows.Close() }()
	result.Items = []AdminRegistration{}
	for rows.Next() {
		var item AdminRegistration
		if err := rows.Scan(&item.UserID, &item.Name, &item.TicketTypeID, &item.TicketName, &item.CreatedAt); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
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
