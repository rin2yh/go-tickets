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

func (f *fakeStore) Register(_ context.Context, _ int64, user string) error { f.registeredUser = user; return f.registerErr }
func (f *fakeStore) Cancel(_ context.Context, _ int64, user string) error { f.cancelledUser = user; return f.cancelErr }
func (f *fakeStore) Status(context.Context, int64) (Status, error) { return Status{TicketTypeID: 1, Capacity: 1, Reserved: 1}, f.statusErr }
func (f *fakeStore) IsAdmin(_ context.Context, user string) (bool, error) { f.adminUser = user; return f.admin, f.adminErr }

func TestPublicHandler(t *testing.T) {
	tests := []struct { name, path, body string; store fakeStore; want int }{
		{"register ignores body user id", "/registrations", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusCreated},
		{"sold out", "/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ErrSoldOut}, http.StatusConflict},
		{"duplicate", "/registrations", `{"ticket_type_id":1}`, fakeStore{registerErr: ErrDuplicate}, http.StatusConflict},
		{"bad body", "/registrations", `{`, fakeStore{}, http.StatusBadRequest},
		{"cancel", "/registrations/cancel", `{"ticket_type_id":1,"user_id":"user_Attacker"}`, fakeStore{}, http.StatusOK},
		{"missing", "/registrations/cancel", `{"ticket_type_id":1}`, fakeStore{cancelErr: ErrNotFound}, http.StatusNotFound},
	}
	for _, tc := range tests { t.Run(tc.name, func(t *testing.T) {
		store := &tc.store
		r := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		r.Header.Set(authenticatedUserHeader, "user_Authenticated")
		w := httptest.NewRecorder(); PublicHandler(store).ServeHTTP(w, r)
		if w.Code != tc.want { t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String()) }
		if strings.HasPrefix(tc.name, "register") && store.registeredUser != "user_Authenticated" { t.Fatalf("registered user = %q", store.registeredUser) }
		if tc.name == "cancel" && store.cancelledUser != "user_Authenticated" { t.Fatalf("cancelled user = %q", store.cancelledUser) }
	}) }
	t.Run("unauthenticated", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/registrations", strings.NewReader(`{"ticket_type_id":1,"user_id":"user_Forged"}`))
		w := httptest.NewRecorder(); PublicHandler(&fakeStore{}).ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized { t.Fatalf("status = %d, want 401", w.Code) }
	})
}

func TestAdminHandler(t *testing.T) {
	tests := []struct { name, path string; store fakeStore; want int }{
		{"admin status", "/ticket-types/1/status", fakeStore{admin: true}, http.StatusOK},
		{"invalid type", "/ticket-types/2/status", fakeStore{admin: true}, http.StatusBadRequest},
		{"database error", "/ticket-types/1/status", fakeStore{admin: true, statusErr: errors.New("db")}, http.StatusInternalServerError},
		{"general user", "/ticket-types/1/status", fakeStore{}, http.StatusForbidden},
	}
	for _, tc := range tests { t.Run(tc.name, func(t *testing.T) {
		store := &tc.store
		r := httptest.NewRequest(http.MethodGet, tc.path, nil); r.Header.Set(authenticatedUserHeader, "user_ValidUser")
		w := httptest.NewRecorder(); AdminHandler(store).ServeHTTP(w, r)
		if w.Code != tc.want { t.Fatalf("status = %d, want %d", w.Code, tc.want) }
		if store.adminUser != "user_ValidUser" { t.Fatalf("admin lookup user = %q", store.adminUser) }
		if tc.want == http.StatusOK { var s Status; if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil || s.Reserved != 1 { t.Fatalf("status body: %s: %v", w.Body.String(), err) } }
	}) }
	t.Run("unauthenticated", func(t *testing.T) {
		store := &fakeStore{admin: true}; w := httptest.NewRecorder()
		AdminHandler(store).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ticket-types/1/status", nil))
		if w.Code != http.StatusUnauthorized { t.Fatalf("status = %d, want 401", w.Code) }
		if store.adminUser != "" { t.Fatal("admin lookup ran for unauthenticated request") }
	})
}
