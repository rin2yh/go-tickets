package ticket_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/auth"
	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/ticket"
)

type fakeStore struct {
	registerErr, cancelErr, statusErr, adminErr error
	admin                                       bool
	registeredUser, cancelledUser, adminUser    string
	statusID                                    int64
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
	return []ticket.Registration{{TicketTypeID: 1, EventName: "event", TicketName: "ticket", Status: "active"}}, nil
}
func (f *fakeStore) AdminRegistrations(context.Context, int64, string, string, int) (ticket.RegistrationPage, error) {
	return ticket.RegistrationPage{Items: []ticket.AdminRegistration{}}, nil
}
func (f *fakeStore) CreateEvent(context.Context, event.EventInput) (int64, error) { return 2, nil }
func (f *fakeStore) UpdateEvent(context.Context, int64, event.EventInput) error   { return nil }
func (f *fakeStore) CreateTicketType(context.Context, int64, ticket.TicketTypeInput) (int64, error) {
	return 2, nil
}
func (f *fakeStore) UpdateTicketType(context.Context, int64, ticket.TicketTypeInput) error {
	return nil
}

func TestPublicHandler(t *testing.T) {
	tests := []struct {
		name, method, path, body string
		store                    fakeStore
		want                     int
	}{
		{"events are public", http.MethodGet, "/api/events", ``, fakeStore{}, http.StatusOK},
		{"event detail is public", http.MethodGet, "/api/events/1", ``, fakeStore{}, http.StatusOK},
		{"Clerk config is public", http.MethodGet, "/api/auth/config", ``, fakeStore{}, http.StatusOK},
		{"my registrations", http.MethodGet, "/api/registrations", ``, fakeStore{}, http.StatusOK},
		{"legacy registrations path is gone", http.MethodGet, "/registrations", ``, fakeStore{}, http.StatusNotFound},
		{"register ignores body user id", http.MethodPost, "/api/registrations", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusCreated},
		{"sold out", http.MethodPost, "/api/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ticket.ErrSoldOut}, http.StatusConflict},
		{"duplicate", http.MethodPost, "/api/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ticket.ErrDuplicate}, http.StatusConflict},
		{"bad register body", http.MethodPost, "/api/registrations", `{`, fakeStore{}, http.StatusBadRequest},
		{"cancel", http.MethodPost, "/api/registrations/cancel", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusOK},
		{"bad cancel body", http.MethodPost, "/api/registrations/cancel", `{`, fakeStore{}, http.StatusBadRequest},
		{"missing", http.MethodPost, "/api/registrations/cancel", `{"ticket_type_id":1}`, fakeStore{cancelErr: ticket.ErrNotFound}, http.StatusNotFound},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &tc.store
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
			w := httptest.NewRecorder()
			testPublicMux(store).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
			if tc.name == "bad register body" || tc.name == "bad cancel body" {
				var response map[string]string
				decoder := json.NewDecoder(w.Body)
				if err := decoder.Decode(&response); err != nil {
					t.Fatalf("error response is not JSON: %v", err)
				}
				if response["error"] != "invalid_request" {
					t.Fatalf("error response = %#v", response)
				}
				if err := decoder.Decode(&response); !errors.Is(err, io.EOF) {
					t.Fatalf("error response contains additional data: %v", err)
				}
			}
			if strings.HasPrefix(tc.name, "register") && store.registeredUser != "user_Authenticated" {
				t.Fatalf("registered user = %q", store.registeredUser)
			}
			if tc.name == "cancel" && store.cancelledUser != "user_Authenticated" {
				t.Fatalf("cancelled user = %q", store.cancelledUser)
			}
		})
	}
	t.Run("unauthenticated", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1,"user_id":"user_Forged"}`))
		w := httptest.NewRecorder()
		testPublicMux(&fakeStore{}).ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})
	t.Run("registration requires a Clerk participant name", func(t *testing.T) {
		h := ticket.NewHandler(&fakeStore{}, &fakeStore{}, testAuthenticatedUserID, fakeParticipantProfile{})
		mux := http.NewServeMux()
		mux.Handle("POST /api/registrations", auth.Authenticated(testAuthenticatedUserID)(http.HandlerFunc(h.Register)))
		req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1}`))
		req.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "participant_name_required") {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})
}

func TestAdminHandler(t *testing.T) {
	tests := []struct {
		name, path string
		store      fakeStore
		want       int
	}{
		{"admin events are restricted", "/api/admin/events", fakeStore{admin: true}, http.StatusOK},
		{"admin events reject regular users", "/api/admin/events", fakeStore{}, http.StatusForbidden},
		{"admin status", "/api/ticket-types/1/status", fakeStore{admin: true}, http.StatusOK},
		{"requested type id", "/api/ticket-types/2/status", fakeStore{admin: true}, http.StatusOK},
		{"legacy status path is gone", "/ticket-types/1/status", fakeStore{admin: true}, http.StatusNotFound},
		{"database error", "/api/ticket-types/1/status", fakeStore{admin: true, statusErr: errors.New("db")}, http.StatusInternalServerError},
		{"general user", "/api/ticket-types/1/status", fakeStore{}, http.StatusForbidden},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &tc.store
			r := httptest.NewRequest(http.MethodGet, tc.path, nil)
			r.Header.Set("X-Test-Authenticated-User", "user_ValidUser")
			w := httptest.NewRecorder()
			testAdminMux(store).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
			if tc.name != "legacy status path is gone" && store.adminUser != "user_ValidUser" {
				t.Fatalf("admin lookup user = %q", store.adminUser)
			}
			if tc.name == "admin status" || tc.name == "requested type id" {
				var s ticket.Status
				if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil || s.Reserved != 1 {
					t.Fatalf("status body: %s: %v", w.Body.String(), err)
				}
				if tc.name == "requested type id" && (store.statusID != 2 || s.TicketTypeID != 2) {
					t.Fatalf("status queried id = %d, response id = %d", store.statusID, s.TicketTypeID)
				}
			}
		})
	}
	t.Run("unauthenticated", func(t *testing.T) {
		store := &fakeStore{admin: true}
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/ticket-types/1/status", nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
		if store.adminUser != "" {
			t.Fatal("admin lookup ran for unauthenticated request")
		}
	})
}

func TestAdminEventAndTicketManagementBehavior(t *testing.T) {
	tests := []struct {
		name, method, path, body string
		want                     int
	}{
		{"create event", http.MethodPost, "/api/events", `{"name":" GoConf "}`, http.StatusCreated},
		{"draft may omit event name", http.MethodPost, "/api/events", `{}`, http.StatusCreated},
		{"published event requires details", http.MethodPost, "/api/events", `{"publication_status":"published"}`, http.StatusBadRequest},
		{"reject equal event datetime boundary", http.MethodPost, "/api/events", `{"name":"Event","description":"Details","starts_at":"2027-01-01T00:00:00.000Z","ends_at":"2027-01-01T00:00:00Z","publication_status":"published"}`, http.StatusBadRequest},
		{"edit event", http.MethodPut, "/api/events/1", `{"name":"GoConf 2027"}`, http.StatusOK},
		{"create ticket type", http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":20}`, http.StatusCreated},
		{"reject negative capacity", http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":-1}`, http.StatusBadRequest},
		{"reject equal registration datetime boundary", http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":1,"registration_starts_at":"2027-01-01T00:00:00.000Z","registration_ends_at":"2027-01-01T00:00:00Z"}`, http.StatusBadRequest},
		{"edit ticket type", http.MethodPut, "/api/ticket-types/1", `{"name":"General","capacity":20}`, http.StatusOK},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeStore{admin: true}
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("X-Test-Authenticated-User", "user_admin")
			w := httptest.NewRecorder()
			testAdminMux(store).ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	t.Run("management requires administrator", func(t *testing.T) {
		store := &fakeStore{}
		req := httptest.NewRequest(http.MethodPost, "/api/events", strings.NewReader(`{"name":"GoConf"}`))
		req.Header.Set("X-Test-Authenticated-User", "user_regular")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status=%d, want 403", w.Code)
		}
	})
}

func testPublicMux(store *fakeStore) *http.ServeMux {
	h := ticket.NewHandler(store, store, testAuthenticatedUserID, fakeParticipantProfile{name: "Attendee"})
	events := event.NewHandler(store, store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.Handle("GET /api/auth/config", h.AuthConfig("pk_test_example"))
	mux.HandleFunc("GET /api/events", events.Events)
	mux.HandleFunc("GET /api/events/{id}", events.Event)
	protected := auth.Authenticated(testAuthenticatedUserID)
	mux.Handle("GET /api/registrations", protected(http.HandlerFunc(h.Registrations)))
	mux.Handle("POST /api/registrations", protected(http.HandlerFunc(h.Register)))
	mux.Handle("POST /api/registrations/cancel", protected(http.HandlerFunc(h.CancelRegistration)))
	return mux
}

func testAdminMux(store *fakeStore) *http.ServeMux {
	h := ticket.NewHandler(store, store, testAuthenticatedUserID, nil)
	events := event.NewHandler(store, store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.Handle("GET /api/auth/config", h.AuthConfig("pk_test_example"))
	adminOnly := auth.AdminOnly(testAuthenticatedUserID, store.IsAdmin)
	mux.Handle("GET /api/admin/events", adminOnly(http.HandlerFunc(events.AdminEvents)))
	mux.Handle("GET /api/admin/events/{id}", adminOnly(http.HandlerFunc(events.AdminEvent)))
	mux.Handle("GET /api/admin/events/{id}/registrations", adminOnly(http.HandlerFunc(h.AdminRegistrations)))
	mux.Handle("GET /api/ticket-types/{id}/status", adminOnly(http.HandlerFunc(h.TicketTypeStatus)))
	mux.Handle("POST /api/events", adminOnly(http.HandlerFunc(events.CreateEvent)))
	mux.Handle("PUT /api/events/{id}", adminOnly(http.HandlerFunc(events.UpdateEvent)))
	mux.Handle("POST /api/events/{id}/ticket-types", adminOnly(http.HandlerFunc(h.CreateTicketType)))
	mux.Handle("PUT /api/ticket-types/{id}", adminOnly(http.HandlerFunc(h.UpdateTicketType)))
	return mux
}

func testAuthenticatedUserID(r *http.Request) string {
	return r.Header.Get("X-Test-Authenticated-User")
}
