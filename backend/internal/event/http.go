package event

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/rin2yh/go-tickets/internal/ticket"
	httpx "github.com/rin2yh/go-tickets/x/http"
)

// Handler serves event listing and administration endpoints.
type Handler struct {
	queries  ticket.Query
	commands ticket.Command
}

func NewHandler(queries ticket.Query, commands ticket.Command) *Handler {
	return &Handler{queries: queries, commands: commands}
}

func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	items, err := h.queries.Events(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) Event(w http.ResponseWriter, r *http.Request) {
	id, ok := eventID(w, r)
	if !ok {
		return
	}
	item, err := h.queries.Event(r.Context(), id)
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusOK, item)
	case errors.Is(err, sql.ErrNoRows):
		httpx.WriteError(w, http.StatusNotFound, "not_found")
	default:
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
	}
}

func (h *Handler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > 200 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_name")
		return
	}
	id, err := h.commands.CreateEvent(r.Context(), name)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (h *Handler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := eventID(w, r)
	if !ok {
		return
	}
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > 200 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_name")
		return
	}
	if err := h.commands.UpdateEvent(r.Context(), id, name); errors.Is(err, ticket.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found")
	} else if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
	} else {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func eventID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_event_id")
		return 0, false
	}
	return id, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(dst); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_request")
		return false
	}
	return true
}
