package ticket_test

import (
	"context"
	"errors"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/ticket"
)

type fakeStore struct {
	registerErr, cancelErr, statusErr, adminErr, adminRegistrationsErr error
	registrationsErr, createTicketTypeErr, updateTicketTypeErr         error
	admin                                                              bool
	registeredUser, cancelledUser, adminUser                           string
	statusID, registrationsEventID                                     int64
	registrationsStatus, registrationsTicket                           string
	registrationsPage                                                  int
}

type fakeParticipantProfile struct {
	name string
	err  error
}

func (p fakeParticipantProfile) Name(context.Context, string) (string, error) { return p.name, p.err }

func (f *fakeStore) Register(_ context.Context, _ int64, user string) error {
	f.registeredUser = user
	return f.registerErr
}
func (f *fakeStore) Cancel(_ context.Context, _ int64, user string) error {
	f.cancelledUser = user
	return f.cancelErr
}
func (f *fakeStore) Status(_ context.Context, id int64) (ticket.Status, error) {
	f.statusID = id
	return ticket.Status{TicketTypeID: id, Capacity: 1, Reserved: 1}, f.statusErr
}
func (f *fakeStore) IsAdmin(_ context.Context, user string) (bool, error) {
	f.adminUser = user
	return f.admin, f.adminErr
}
func (f *fakeStore) Events(context.Context) ([]event.Event, error) {
	return []event.Event{{ID: 1, Name: "event", TicketTypes: []event.TicketType{{ID: 1, Name: "ticket", Capacity: 1}}}}, nil
}
func (f *fakeStore) AdminEvents(ctx context.Context) ([]event.Event, error) { return f.Events(ctx) }
func (f *fakeStore) Event(_ context.Context, id int64) (event.Event, error) {
	if id != 1 {
		return event.Event{}, errors.New("missing")
	}
	return event.Event{ID: 1, Name: "event", TicketTypes: []event.TicketType{{ID: 1, Name: "ticket", Capacity: 1}}}, nil
}
func (f *fakeStore) AdminEvent(ctx context.Context, id int64) (event.Event, error) {
	return f.Event(ctx, id)
}
func (f *fakeStore) Registrations(_ context.Context, user string) ([]ticket.Registration, error) {
	f.registeredUser = user
	return []ticket.Registration{{TicketTypeID: 1, EventName: "event", TicketName: "ticket", Status: "active"}}, f.registrationsErr
}
func (f *fakeStore) AdminRegistrations(_ context.Context, eventID int64, status, ticketID string, page int) (ticket.RegistrationPage, error) {
	f.registrationsEventID = eventID
	f.registrationsStatus = status
	f.registrationsTicket = ticketID
	f.registrationsPage = page
	return ticket.RegistrationPage{Items: []ticket.AdminRegistration{}}, f.adminRegistrationsErr
}
func (f *fakeStore) CreateEvent(context.Context, event.EventInput) (int64, error) { return 2, nil }
func (f *fakeStore) UpdateEvent(context.Context, int64, event.EventInput) error   { return nil }
func (f *fakeStore) CreateTicketType(context.Context, int64, ticket.TicketTypeInput) (int64, error) {
	return 2, f.createTicketTypeErr
}
func (f *fakeStore) UpdateTicketType(context.Context, int64, ticket.TicketTypeInput) error {
	return f.updateTicketTypeErr
}
