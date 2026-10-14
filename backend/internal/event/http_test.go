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
	testx.NewTable[input, want](t,
		testx.NewCase("public list", input{query: httpQuery{events: []event.Event{{ID: 1, Name: "Published"}}}}, want{status: http.StatusOK, containsID: true}),
		testx.NewCase("public list database error", input{query: httpQuery{err: errors.New("db")}}, want{status: http.StatusInternalServerError}),
		testx.NewCase("admin list includes drafts", input{admin: true, query: httpQuery{events: []event.Event{{ID: 2, PublicationStatus: "draft"}}}}, want{status: http.StatusOK, containsID: true}),
		testx.NewCase("admin list database error", input{admin: true, query: httpQuery{err: errors.New("db")}}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
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
	testx.NewTable[input, want](t,
		testx.NewCase("returns draft", input{query: httpQuery{adminEvent: event.Event{ID: 2, Name: "Draft"}}, id: "2"}, want{status: http.StatusOK}),
		testx.NewCase("not found", input{query: httpQuery{err: sql.ErrNoRows}, id: "2"}, want{status: http.StatusNotFound}),
		testx.NewCase("database failure", input{query: httpQuery{err: errors.New("db")}, id: "2"}, want{status: http.StatusInternalServerError}),
		testx.NewCase("invalid id", input{query: httpQuery{}, id: "bad"}, want{status: http.StatusBadRequest}),
	).Run(func(t *testing.T, in input, want want) {
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
	type input struct {
		body       string
		commandErr error
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("name too long", input{body: `{"name":"` + strings.Repeat("n", 201) + `"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("unknown publication status", input{body: `{"publication_status":"private"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("invalid datetime", input{body: `{"starts_at":"tomorrow"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("non UTC datetime", input{body: `{"starts_at":"2027-01-01T00:00:00+09:00"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("published event without start", input{body: `{"name":"Event","description":"Details","publication_status":"published","ends_at":"2027-01-02T00:00:00Z"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("event incomplete", input{body: `{"name":"Event"}`, commandErr: errors.New("event_incomplete")}, want{status: http.StatusBadRequest}),
		testx.NewCase("registration period missing", input{body: `{"name":"Event"}`, commandErr: errors.New("invalid_registration_period")}, want{status: http.StatusBadRequest}),
		testx.NewCase("unexpected command error", input{body: `{"name":"Event"}`, commandErr: errors.New("db")}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		r := httptest.NewRequest(http.MethodPost, "/events", strings.NewReader(in.body))
		w := httptest.NewRecorder()
		event.NewHandler(httpQuery{}, httpCommand{createErr: in.commandErr}).CreateEvent(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
}

func TestUpdateEventInputErrors(t *testing.T) {
	type input struct {
		id, body   string
		commandErr error
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("valid update", input{id: "4", body: `{"name":"Updated"}`}, want{status: http.StatusOK}),
		testx.NewCase("invalid id", input{id: "-1", body: `{}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("invalid body", input{id: "4", body: `{`}, want{status: http.StatusBadRequest}),
		testx.NewCase("database error", input{id: "4", body: `{"name":"Updated"}`, commandErr: errors.New("db")}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		r := httptest.NewRequest(http.MethodPut, "/events/"+in.id, strings.NewReader(in.body))
		r.SetPathValue("id", in.id)
		w := httptest.NewRecorder()
		event.NewHandler(httpQuery{}, httpCommand{updateErr: in.commandErr}).UpdateEvent(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
}
