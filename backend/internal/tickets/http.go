package tickets

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

type Handler struct {
	queries             Query
	commands            Command
	authenticatedUserID func(*http.Request) string
}

func NewHandler(queries Query, commands Command, authenticatedUserID func(*http.Request) string) *Handler {
	return &Handler{queries: queries, commands: commands, authenticatedUserID: authenticatedUserID}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) AuthConfig(publishableKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"publishableKey": publishableKey})
	}
}

func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	events, err := h.queries.Events(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error")
		return
	}
	writeJSON(w, http.StatusOK, events)
}

func (h *Handler) Event(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id", "invalid_event_id")
	if !ok {
		return
	}
	event, err := h.queries.Event(r.Context(), id)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, event)
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found")
	default:
		writeError(w, http.StatusInternalServerError, "database_error")
	}
}

func (h *Handler) Registrations(w http.ResponseWriter, r *http.Request) {
	userID := h.authenticatedUserID(r)
	registrations, err := h.queries.Registrations(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error")
		return
	}
	writeJSON(w, http.StatusOK, registrations)
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		TicketTypeID int64 `json:"ticket_type_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.TicketTypeID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	err := h.commands.Register(r.Context(), input.TicketTypeID, h.authenticatedUserID(r))
	switch {
	case err == nil:
		writeJSON(w, http.StatusCreated, map[string]string{"status": "registered"})
	case errors.Is(err, ErrSoldOut), errors.Is(err, ErrDuplicate):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeError(w, http.StatusInternalServerError, "database_error")
	}
}

func (h *Handler) CancelRegistration(w http.ResponseWriter, r *http.Request) {
	var input struct {
		TicketTypeID int64 `json:"ticket_type_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.TicketTypeID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	err := h.commands.Cancel(r.Context(), input.TicketTypeID, h.authenticatedUserID(r))
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
	case errors.Is(err, ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	default:
		writeError(w, http.StatusInternalServerError, "database_error")
	}
}

func (h *Handler) TicketTypeStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id", "invalid_ticket_type")
	if !ok {
		return
	}
	status, err := h.queries.Status(r.Context(), id)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, status)
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found")
	default:
		writeError(w, http.StatusInternalServerError, "database_error")
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
	if !validName(name) {
		writeError(w, http.StatusBadRequest, "invalid_name")
		return
	}
	id, err := h.commands.CreateEvent(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database_error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (h *Handler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id", "invalid_event_id")
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
	if !validName(name) {
		writeError(w, http.StatusBadRequest, "invalid_name")
		return
	}
	writeAdminMutationResult(w, h.commands.UpdateEvent(r.Context(), id, name))
}

func (h *Handler) CreateTicketType(w http.ResponseWriter, r *http.Request) {
	eventID, ok := pathID(w, r, "id", "invalid_event_id")
	if !ok {
		return
	}
	var input struct {
		Name     string `json:"name"`
		Capacity int64  `json:"capacity"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if !validName(name) || input.Capacity < 0 {
		writeError(w, http.StatusBadRequest, "invalid_ticket_type")
		return
	}
	id, err := h.commands.CreateTicketType(r.Context(), eventID, name, input.Capacity)
	if err != nil {
		writeAdminMutationResult(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (h *Handler) UpdateTicketType(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id", "invalid_ticket_type_id")
	if !ok {
		return
	}
	var input struct {
		Name     string `json:"name"`
		Capacity int64  `json:"capacity"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if !validName(name) || input.Capacity < 0 {
		writeError(w, http.StatusBadRequest, "invalid_ticket_type")
		return
	}
	writeAdminMutationResult(w, h.commands.UpdateTicketType(r.Context(), id, name, input.Capacity))
}

func (h *Handler) Authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.authenticatedUserID(r) == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) AdminOnly(next http.Handler) http.Handler {
	return h.Authenticated(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isAdmin, err := h.queries.IsAdmin(r.Context(), h.authenticatedUserID(r))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "database_error")
			return
		}
		if !isAdmin {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func pathID(w http.ResponseWriter, r *http.Request, key, errorCode string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(key), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, errorCode)
		return 0, false
	}
	return id, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return false
	}
	return true
}

func validName(name string) bool { return name != "" && len(name) <= 200 }

func writeAdminMutationResult(w http.ResponseWriter, err error) {
	if err == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if strings.Contains(err.Error(), "CHECK constraint failed") {
		writeError(w, http.StatusConflict, "capacity_below_reserved_or_invalid_event")
		return
	}
	if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		writeError(w, http.StatusNotFound, "event_not_found")
		return
	}
	writeError(w, http.StatusInternalServerError, "database_error")
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
