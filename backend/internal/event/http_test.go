package event_test

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/event"
)

type httpQuery struct {
	err        error
	events     []event.Event
	event      event.Event
	adminEvent event.Event
}

func (q httpQuery) Events(context.Context) ([]event.Event, error)      { return q.events, q.err }
func (q httpQuery) AdminEvents(context.Context) ([]event.Event, error) { return q.events, q.err }
func (q httpQuery) Event(context.Context, int64) (event.Event, error)  { return q.event, q.err }
func (q httpQuery) AdminEvent(context.Context, int64) (event.Event, error) {
	return q.adminEvent, q.err
}

type httpCommand struct {
	createErr error
	updateErr error
}

func (c httpCommand) CreateEvent(context.Context, event.EventInput) (int64, error) {
	return 42, c.createErr
}
func (c httpCommand) UpdateEvent(context.Context, int64, event.EventInput) error { return c.updateErr }

func TestHandlerListEndpoints(t *testing.T) {
	for _, tc := range []struct {
		name  string
		admin bool
		query httpQuery
		want  int
	}{
		{name: "public list", query: httpQuery{events: []event.Event{{ID: 1, Name: "Published"}}}, want: http.StatusOK},
		{name: "public list database error", query: httpQuery{err: errors.New("db")}, want: http.StatusInternalServerError},
		{name: "admin list includes drafts", admin: true, query: httpQuery{events: []event.Event{{ID: 2, PublicationStatus: "draft"}}}, want: http.StatusOK},
		{name: "admin list database error", admin: true, query: httpQuery{err: errors.New("db")}, want: http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := event.NewHandler(tc.query, httpCommand{})
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, "/events", nil)
			if tc.admin {
				h.AdminEvents(w, r)
			} else {
				h.Events(w, r)
			}
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
			if tc.want == http.StatusOK && !strings.Contains(w.Body.String(), `"id":`) {
				t.Fatalf("response = %s", w.Body.String())
			}
		})
	}
}

func TestHandlerAdminEvent(t *testing.T) {
	for _, tc := range []struct {
		name  string
		query httpQuery
		id    string
		want  int
	}{
		{name: "returns draft", query: httpQuery{adminEvent: event.Event{ID: 2, Name: "Draft"}}, id: "2", want: http.StatusOK},
		{name: "not found", query: httpQuery{err: sql.ErrNoRows}, id: "2", want: http.StatusNotFound},
		{name: "database failure", query: httpQuery{err: errors.New("db")}, id: "2", want: http.StatusInternalServerError},
		{name: "invalid id", query: httpQuery{}, id: "bad", want: http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/events/"+tc.id, nil)
			r.SetPathValue("id", tc.id)
			w := httptest.NewRecorder()
			event.NewHandler(tc.query, httpCommand{}).AdminEvent(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestHandlerEventEndpoints(t *testing.T) {
	h := event.NewHandler(httpQuery{}, httpCommand{})
	t.Run("invalid id", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/events/0", nil)
		r.SetPathValue("id", "0")
		w := httptest.NewRecorder()
		h.Event(w, r)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d", w.Code)
		}
	})
	t.Run("not found", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/events/1", nil)
		r.SetPathValue("id", "1")
		w := httptest.NewRecorder()
		event.NewHandler(httpQuery{err: errors.New("missing")}, httpCommand{}).Event(w, r)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d", w.Code)
		}
	})
	t.Run("admin draft creation", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/events", strings.NewReader(`{"name":"Draft"}`))
		w := httptest.NewRecorder()
		h.CreateEvent(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("status = %d, body = %s", w.Code, w.Body)
		}
	})
	t.Run("published event requires description", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/events", strings.NewReader(`{"name":"Event","publication_status":"published"}`))
		w := httptest.NewRecorder()
		h.CreateEvent(w, r)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d", w.Code)
		}
	})
	t.Run("malformed body", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/events", strings.NewReader(`{`))
		w := httptest.NewRecorder()
		h.CreateEvent(w, r)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d", w.Code)
		}
	})
}

func TestHandlerUpdateEventErrors(t *testing.T) {
	r := httptest.NewRequest(http.MethodPut, "/events/1", strings.NewReader(`{"name":"Draft"}`))
	r.SetPathValue("id", "1")
	w := httptest.NewRecorder()
	event.NewHandler(httpQuery{}, httpCommand{updateErr: event.ErrNotFound}).UpdateEvent(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestCreateEventValidationAndErrors(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		commandErr error
		want       int
	}{
		{name: "name too long", body: `{"name":"` + strings.Repeat("n", 201) + `"}`, want: http.StatusBadRequest},
		{name: "unknown publication status", body: `{"publication_status":"private"}`, want: http.StatusBadRequest},
		{name: "invalid datetime", body: `{"starts_at":"tomorrow"}`, want: http.StatusBadRequest},
		{name: "non UTC datetime", body: `{"starts_at":"2027-01-01T00:00:00+09:00"}`, want: http.StatusBadRequest},
		{name: "published event without start", body: `{"name":"Event","description":"Details","publication_status":"published","ends_at":"2027-01-02T00:00:00Z"}`, want: http.StatusBadRequest},
		{name: "event incomplete", body: `{"name":"Event"}`, commandErr: errors.New("event_incomplete"), want: http.StatusBadRequest},
		{name: "registration period missing", body: `{"name":"Event"}`, commandErr: errors.New("invalid_registration_period"), want: http.StatusBadRequest},
		{name: "unexpected command error", body: `{"name":"Event"}`, commandErr: errors.New("db"), want: http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/events", strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			event.NewHandler(httpQuery{}, httpCommand{createErr: tc.commandErr}).CreateEvent(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestUpdateEventInputErrors(t *testing.T) {
	for _, tc := range []struct {
		name, id, body string
		commandErr     error
		want           int
	}{
		{name: "valid update", id: "4", body: `{"name":"Updated"}`, want: http.StatusOK},
		{name: "invalid id", id: "-1", body: `{}`, want: http.StatusBadRequest},
		{name: "invalid body", id: "4", body: `{`, want: http.StatusBadRequest},
		{name: "database error", id: "4", body: `{"name":"Updated"}`, commandErr: errors.New("db"), want: http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPut, "/events/"+tc.id, strings.NewReader(tc.body))
			r.SetPathValue("id", tc.id)
			w := httptest.NewRecorder()
			event.NewHandler(httpQuery{}, httpCommand{updateErr: tc.commandErr}).UpdateEvent(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}
