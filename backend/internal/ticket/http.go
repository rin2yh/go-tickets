package ticket

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/rin2yh/go-tickets/x/http"
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
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) AuthConfig(publishableKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"publishableKey": publishableKey})
	}
}

func (h *Handler) Registrations(w http.ResponseWriter, r *http.Request) {
	userID := h.authenticatedUserID(r)
	registrations, err := h.queries.Registrations(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, registrations)
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		TicketTypeID int64 `json:"ticket_type_id"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.TicketTypeID <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	err := h.commands.Register(r.Context(), input.TicketTypeID, h.authenticatedUserID(r))
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusCreated, map[string]string{"status": "registered"})
	case errors.Is(err, ErrSoldOut), errors.Is(err, ErrDuplicate):
		httpx.WriteJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
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
		httpx.WriteError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	err := h.commands.Cancel(r.Context(), input.TicketTypeID, h.authenticatedUserID(r))
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
	case errors.Is(err, ErrNotFound):
		httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	default:
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
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
		httpx.WriteJSON(w, http.StatusOK, status)
	case errors.Is(err, sql.ErrNoRows):
		httpx.WriteError(w, http.StatusNotFound, "not_found")
	default:
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
	}
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
		httpx.WriteError(w, http.StatusBadRequest, "invalid_ticket_type")
		return
	}
	id, err := h.commands.CreateTicketType(r.Context(), eventID, name, input.Capacity)
	if err != nil {
		writeAdminMutationResult(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]int64{"id": id})
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
		httpx.WriteError(w, http.StatusBadRequest, "invalid_ticket_type")
		return
	}
	writeAdminMutationResult(w, h.commands.UpdateTicketType(r.Context(), id, name, input.Capacity))
}

func pathID(w http.ResponseWriter, r *http.Request, key, errorCode string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(key), 10, 64)
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, errorCode)
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

func validName(name string) bool { return name != "" && len(name) <= 200 }

func writeAdminMutationResult(w http.ResponseWriter, err error) {
	if err == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found")
		return
	}
	if strings.Contains(err.Error(), "CHECK constraint failed") {
		httpx.WriteError(w, http.StatusConflict, "capacity_below_reserved_or_invalid_event")
		return
	}
	if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		httpx.WriteError(w, http.StatusNotFound, "event_not_found")
		return
	}
	httpx.WriteError(w, http.StatusInternalServerError, "database_error")
}
