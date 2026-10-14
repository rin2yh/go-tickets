package event_test

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/x/testx"
)

func TestHandlerListEndpoints(t *testing.T) {
	type input struct {
		admin bool
		query httpQuery
	}
	type want struct {
		status     int
		containsID bool
	}
	testx.Run(t, []testx.Case[input, want]{
		{Name: "public list", Input: input{query: httpQuery{events: []event.Event{{ID: 1, Name: "Published"}}}}, Want: want{status: http.StatusOK, containsID: true}},
		{Name: "public list database error", Input: input{query: httpQuery{err: errors.New("db")}}, Want: want{status: http.StatusInternalServerError}},
		{Name: "admin list includes drafts", Input: input{admin: true, query: httpQuery{events: []event.Event{{ID: 2, PublicationStatus: "draft"}}}}, Want: want{status: http.StatusOK, containsID: true}},
		{Name: "admin list database error", Input: input{admin: true, query: httpQuery{err: errors.New("db")}}, Want: want{status: http.StatusInternalServerError}},
	}, func(t *testing.T, in input, want want) {
		h := event.NewHandler(in.query, httpCommand{})
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/events", nil)
		if in.admin {
			h.AdminEvents(w, r)
		} else {
			h.Events(w, r)
		}
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d", w.Code, want.status)
		}
		if want.containsID && !strings.Contains(w.Body.String(), `"id":`) {
			t.Fatalf("response = %s", w.Body.String())
		}
	})
}

func TestHandlerAdminEvent(t *testing.T) {
	type input struct {
		query httpQuery
		id    string
	}
	type want struct{ status int }
	testx.Run(t, []testx.Case[input, want]{
		{Name: "returns draft", Input: input{query: httpQuery{adminEvent: event.Event{ID: 2, Name: "Draft"}}, id: "2"}, Want: want{status: http.StatusOK}},
		{Name: "not found", Input: input{query: httpQuery{err: sql.ErrNoRows}, id: "2"}, Want: want{status: http.StatusNotFound}},
		{Name: "database failure", Input: input{query: httpQuery{err: errors.New("db")}, id: "2"}, Want: want{status: http.StatusInternalServerError}},
		{Name: "invalid id", Input: input{query: httpQuery{}, id: "bad"}, Want: want{status: http.StatusBadRequest}},
	}, func(t *testing.T, in input, want want) {
		r := httptest.NewRequest(http.MethodGet, "/events/"+in.id, nil)
		r.SetPathValue("id", in.id)
		w := httptest.NewRecorder()
		event.NewHandler(in.query, httpCommand{}).AdminEvent(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
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
