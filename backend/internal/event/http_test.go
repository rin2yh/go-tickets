package event_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/event"
)

type httpQuery struct{ err error }

func (q httpQuery) Events(context.Context) ([]event.Event, error)      { return nil, q.err }
func (q httpQuery) AdminEvents(context.Context) ([]event.Event, error) { return nil, q.err }
func (q httpQuery) Event(context.Context, int64) (event.Event, error)  { return event.Event{}, q.err }
func (q httpQuery) AdminEvent(context.Context, int64) (event.Event, error) {
	return event.Event{}, q.err
}

type httpCommand struct {
	createErr error
	updateErr error
}

func (c httpCommand) CreateEvent(context.Context, event.EventInput) (int64, error) {
	return 42, c.createErr
}
func (c httpCommand) UpdateEvent(context.Context, int64, event.EventInput) error { return c.updateErr }

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
