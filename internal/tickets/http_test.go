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

type fakeStore struct { registerErr, cancelErr, statusErr error }
func (f fakeStore) Register(context.Context, int64, string) error { return f.registerErr }
func (f fakeStore) Cancel(context.Context, int64, string) error { return f.cancelErr }
func (f fakeStore) Status(context.Context, int64) (Status, error) { return Status{TicketTypeID:1, Capacity:1, Reserved:1}, f.statusErr }

func TestPublicHandler(t *testing.T) {
	tests := []struct { name, path, body string; store fakeStore; want int }{
		{"register", "/registrations", `{"ticket_type_id":1,"user_id":"a"}`, fakeStore{}, 201},
		{"sold out", "/registrations", `{"ticket_type_id":1,"user_id":"a"}`, fakeStore{registerErr:ErrSoldOut}, 409},
		{"duplicate", "/registrations", `{"ticket_type_id":1,"user_id":"a"}`, fakeStore{registerErr:ErrDuplicate}, 409},
		{"bad body", "/registrations", `{`, fakeStore{}, 400},
		{"cancel", "/registrations/cancel", `{"ticket_type_id":1,"user_id":"a"}`, fakeStore{}, 200},
		{"missing", "/registrations/cancel", `{"ticket_type_id":1,"user_id":"a"}`, fakeStore{cancelErr:ErrNotFound}, 404},
	}
	for _, tc := range tests { t.Run(tc.name, func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		w := httptest.NewRecorder()
		PublicHandler(tc.store).ServeHTTP(w, r)
		if w.Code != tc.want { t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String()) }
	}) }
}

func TestAdminHandler(t *testing.T) {
	tests := []struct { name, path string; store fakeStore; want int }{
		{"status", "/ticket-types/1/status", fakeStore{}, 200},
		{"invalid type", "/ticket-types/2/status", fakeStore{}, 400},
		{"database error", "/ticket-types/1/status", fakeStore{statusErr:errors.New("db")}, 500},
	}
	for _, tc := range tests { t.Run(tc.name, func(t *testing.T) {
		w := httptest.NewRecorder()
		AdminHandler(tc.store).ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if w.Code != tc.want { t.Fatalf("status = %d, want %d", w.Code, tc.want) }
		if tc.want == 200 { var s Status; if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil || s.Reserved != 1 { t.Fatalf("status body: %s: %v", w.Body.String(), err) } }
	}) }
}
