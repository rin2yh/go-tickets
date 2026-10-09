package event

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

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

func (h *Handler) AdminEvents(w http.ResponseWriter, r *http.Request) {
	items, err := h.queries.AdminEvents(r.Context())
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

func (h *Handler) AdminEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := eventID(w, r)
	if !ok {
		return
	}
	item, err := h.queries.AdminEvent(r.Context(), id)
	if err == nil {
		httpx.WriteJSON(w, http.StatusOK, item)
	} else if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "not_found")
	} else {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
	}
}

func (h *Handler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var body eventBody
	if !decodeJSON(w, r, &body) {
		return
	}
	input, code := body.input()
	if code != "" {
		httpx.WriteError(w, http.StatusBadRequest, code)
		return
	}
	if input.PublicationStatus == "published" && validatePublished(input) != "" {
		httpx.WriteError(w, http.StatusBadRequest, validatePublished(input))
		return
	}
	id, err := h.commands.CreateEvent(r.Context(), input)
	if err != nil {
		writeEventError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (h *Handler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := eventID(w, r)
	if !ok {
		return
	}
	var body eventBody
	if !decodeJSON(w, r, &body) {
		return
	}
	input, code := body.input()
	if code != "" {
		httpx.WriteError(w, http.StatusBadRequest, code)
		return
	}
	if input.PublicationStatus == "published" && validatePublished(input) != "" {
		httpx.WriteError(w, http.StatusBadRequest, validatePublished(input))
		return
	}
	err := h.commands.UpdateEvent(r.Context(), id, input)
	if errors.Is(err, ticket.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found")
	} else if err != nil {
		writeEventError(w, err)
	} else {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

type eventBody struct {
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	StartsAt          *string `json:"starts_at"`
	EndsAt            *string `json:"ends_at"`
	VenueName         *string `json:"venue_name"`
	VenueAddress      *string `json:"venue_address"`
	PublicationStatus string  `json:"publication_status"`
}

func (b eventBody) input() (ticket.EventInput, string) {
	name := strings.TrimSpace(b.Name)
	if len(name) > 200 {
		return ticket.EventInput{}, "invalid_name"
	}
	status := b.PublicationStatus
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "published" {
		return ticket.EventInput{}, "invalid_publication_status"
	}
	if !validTimestamp(b.StartsAt) || !validTimestamp(b.EndsAt) {
		return ticket.EventInput{}, "invalid_datetime"
	}
	if b.StartsAt != nil && b.EndsAt != nil && !before(*b.StartsAt, *b.EndsAt) {
		return ticket.EventInput{}, "invalid_event_period"
	}
	return ticket.EventInput{Name: name, Description: b.Description, StartsAt: b.StartsAt, EndsAt: b.EndsAt, VenueName: b.VenueName, VenueAddress: b.VenueAddress, PublicationStatus: status}, ""
}
func validTimestamp(value *string) bool {
	if value == nil {
		return true
	}
	parsed, err := time.Parse(time.RFC3339, *value)
	return err == nil && parsed.Location() == time.UTC && strings.HasSuffix(*value, "Z")
}
func validatePublished(input ticket.EventInput) string {
	if input.Name == "" {
		return "invalid_name"
	}
	if strings.TrimSpace(input.Description) == "" {
		return "description_required"
	}
	if input.StartsAt == nil || input.EndsAt == nil {
		return "event_datetime_required"
	}
	if !before(*input.StartsAt, *input.EndsAt) {
		return "invalid_event_period"
	}
	return ""
}
func before(left, right string) bool {
	a, _ := time.Parse(time.RFC3339Nano, left)
	b, _ := time.Parse(time.RFC3339Nano, right)
	return a.Before(b)
}
func writeEventError(w http.ResponseWriter, err error) {
	if errors.Is(err, ticket.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found")
		return
	}
	if strings.Contains(err.Error(), "event_incomplete") {
		httpx.WriteError(w, http.StatusBadRequest, "event_incomplete")
		return
	}
	if strings.Contains(err.Error(), "invalid_registration_period") {
		httpx.WriteError(w, http.StatusBadRequest, "ticket_registration_period_required")
		return
	}
	httpx.WriteError(w, http.StatusInternalServerError, "database_error")
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
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1048576)).Decode(dst); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_request")
		return false
	}
	return true
}
