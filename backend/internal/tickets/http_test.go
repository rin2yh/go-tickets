package tickets

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeStore struct {
	registerErr, cancelErr, statusErr, adminErr error
	admin                                       bool
	registeredUser, cancelledUser, adminUser    string
}

func (f *fakeStore) Register(_ context.Context, _ int64, user string) error {
	f.registeredUser = user
	return f.registerErr
}
func (f *fakeStore) Cancel(_ context.Context, _ int64, user string) error {
	f.cancelledUser = user
	return f.cancelErr
}
func (f *fakeStore) Status(context.Context, int64) (Status, error) {
	return Status{TicketTypeID: 1, Capacity: 1, Reserved: 1}, f.statusErr
}
func (f *fakeStore) IsAdmin(_ context.Context, user string) (bool, error) {
	f.adminUser = user
	return f.admin, f.adminErr
}
func (f *fakeStore) Events(context.Context) ([]Event, error) {
	return []Event{{ID: 1, Name: "event", TicketTypes: []TicketType{{ID: 1, Name: "ticket", Capacity: 1}}}}, nil
}
func (f *fakeStore) Event(_ context.Context, id int64) (Event, error) {
	if id != 1 {
		return Event{}, errors.New("missing")
	}
	return Event{ID: 1, Name: "event", TicketTypes: []TicketType{{ID: 1, Name: "ticket", Capacity: 1}}}, nil
}
func (f *fakeStore) Registrations(_ context.Context, user string) ([]Registration, error) {
	f.registeredUser = user
	return []Registration{{TicketTypeID: 1, EventName: "event", TicketName: "ticket", Status: "active"}}, nil
}
func (f *fakeStore) CreateEvent(context.Context, string) (int64, error) { return 2, nil }
func (f *fakeStore) UpdateEvent(context.Context, int64, string) error   { return nil }
func (f *fakeStore) CreateTicketType(context.Context, int64, string, int64) (int64, error) {
	return 2, nil
}
func (f *fakeStore) UpdateTicketType(context.Context, int64, string, int64) error { return nil }

func TestPublicHandler(t *testing.T) {
	tests := []struct {
		name, method, path, body string
		store                    fakeStore
		want                     int
	}{
		{"events are public", http.MethodGet, "/api/events", ``, fakeStore{}, http.StatusOK},
		{"event detail is public", http.MethodGet, "/api/events/1", ``, fakeStore{}, http.StatusOK},
		{"my registrations", http.MethodGet, "/registrations", ``, fakeStore{}, http.StatusOK},
		{"register ignores body user id", http.MethodPost, "/registrations", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusCreated},
		{"sold out", http.MethodPost, "/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ErrSoldOut}, http.StatusConflict},
		{"duplicate", http.MethodPost, "/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ErrDuplicate}, http.StatusConflict},
		{"bad body", http.MethodPost, "/registrations", `{`, fakeStore{}, http.StatusBadRequest},
		{"cancel", http.MethodPost, "/registrations/cancel", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusOK},
		{"missing", http.MethodPost, "/registrations/cancel", `{"ticket_type_id":1}`, fakeStore{cancelErr: ErrNotFound}, http.StatusNotFound},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &tc.store
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
			w := httptest.NewRecorder()
			PublicHandler(store, testAuthenticatedUserID).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
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
		r := httptest.NewRequest(http.MethodPost, "/registrations", strings.NewReader(`{"ticket_type_id":1,"user_id":"user_Forged"}`))
		w := httptest.NewRecorder()
		PublicHandler(&fakeStore{}, testAuthenticatedUserID).ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
	})
}

func TestAdminHandler(t *testing.T) {
	tests := []struct {
		name, path string
		store      fakeStore
		want       int
	}{
		{"admin status", "/ticket-types/1/status", fakeStore{admin: true}, http.StatusOK},
		{"invalid type", "/ticket-types/2/status", fakeStore{admin: true}, http.StatusBadRequest},
		{"database error", "/ticket-types/1/status", fakeStore{admin: true, statusErr: errors.New("db")}, http.StatusInternalServerError},
		{"general user", "/ticket-types/1/status", fakeStore{}, http.StatusForbidden},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &tc.store
			r := httptest.NewRequest(http.MethodGet, tc.path, nil)
			r.Header.Set("X-Test-Authenticated-User", "user_ValidUser")
			w := httptest.NewRecorder()
			AdminHandler(store, testAuthenticatedUserID).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
			if store.adminUser != "user_ValidUser" {
				t.Fatalf("admin lookup user = %q", store.adminUser)
			}
			if tc.want == http.StatusOK {
				var s Status
				if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil || s.Reserved != 1 {
					t.Fatalf("status body: %s: %v", w.Body.String(), err)
				}
			}
		})
	}
	t.Run("unauthenticated", func(t *testing.T) {
		store := &fakeStore{admin: true}
		w := httptest.NewRecorder()
		AdminHandler(store, testAuthenticatedUserID).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ticket-types/1/status", nil))
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
		{"reject blank event name", http.MethodPost, "/api/events", `{"name":"  "}`, http.StatusBadRequest},
		{"edit event", http.MethodPut, "/api/events/1", `{"name":"GoConf 2027"}`, http.StatusOK},
		{"create ticket type", http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":20}`, http.StatusCreated},
		{"reject negative capacity", http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":-1}`, http.StatusBadRequest},
		{"edit ticket type", http.MethodPut, "/api/ticket-types/1", `{"name":"General","capacity":20}`, http.StatusOK},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeStore{admin: true}
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("X-Test-Authenticated-User", "user_admin")
			w := httptest.NewRecorder()
			AdminHandler(store, testAuthenticatedUserID).ServeHTTP(w, req)
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
		AdminHandler(store, testAuthenticatedUserID).ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status=%d, want 403", w.Code)
		}
	})
}

func testAuthenticatedUserID(r *http.Request) string {
	return r.Header.Get("X-Test-Authenticated-User")
}
