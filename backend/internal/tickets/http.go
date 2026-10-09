package tickets

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

func Health(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func PublicHandler(queries Query, commands Command, authenticatedUserID func(*http.Request) string, publishableKey string) http.Handler {
	mux := http.NewServeMux()
	Health(mux)
	AuthConfig(mux, publishableKey)
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		events, err := queries.Events(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		writeJSON(w, http.StatusOK, events)
	})
	mux.HandleFunc("GET /api/events/{id}", func(w http.ResponseWriter, r *http.Request) {
		eventID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || eventID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_event_id"})
			return
		}
		event, err := queries.Event(r.Context(), eventID)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, event)
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	mux.HandleFunc("GET /api/registrations", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		registrations, err := queries.Registrations(r.Context(), userID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		writeJSON(w, http.StatusOK, registrations)
	})
	mux.HandleFunc("POST /api/registrations", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		var input struct {
			TicketTypeID int64 `json:"ticket_type_id"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil || input.TicketTypeID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
			return
		}
		err := commands.Register(r.Context(), input.TicketTypeID, userID)
		switch {
		case err == nil:
			writeJSON(w, http.StatusCreated, map[string]string{"status": "registered"})
		case errors.Is(err, ErrSoldOut), errors.Is(err, ErrDuplicate):
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	mux.HandleFunc("POST /api/registrations/cancel", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		var input struct {
			TicketTypeID int64 `json:"ticket_type_id"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil || input.TicketTypeID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
			return
		}
		err := commands.Cancel(r.Context(), input.TicketTypeID, userID)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
		case errors.Is(err, ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	return mux
}

func AdminHandler(queries Query, commands Command, authenticatedUserID func(*http.Request) string, publishableKey string) http.Handler {
	mux := http.NewServeMux()
	Health(mux)
	AuthConfig(mux, publishableKey)
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		events, err := queries.Events(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		writeJSON(w, http.StatusOK, events)
	})
	mux.HandleFunc("GET /api/ticket-types/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		isAdmin, err := queries.IsAdmin(r.Context(), userID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		if !isAdmin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		if r.PathValue("id") != "1" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ticket_type"})
			return
		}
		status, err := queries.Status(r.Context(), 1)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, status)
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	admin := func(w http.ResponseWriter, r *http.Request) bool {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return false
		}
		ok, err := queries.IsAdmin(r.Context(), userID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return false
		}
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return false
		}
		return true
	}
	decode := func(w http.ResponseWriter, r *http.Request, dst any) bool {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(dst); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
			return false
		}
		return true
	}
	validName := func(name string) bool { return strings.TrimSpace(name) != "" && len(strings.TrimSpace(name)) <= 200 }
	mux.HandleFunc("POST /api/events", func(w http.ResponseWriter, r *http.Request) {
		if !admin(w, r) {
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &in) {
			return
		}
		if !validName(in.Name) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_name"})
			return
		}
		id, err := commands.CreateEvent(r.Context(), strings.TrimSpace(in.Name))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
	})
	mux.HandleFunc("PUT /api/events/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !admin(w, r) {
			return
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_event_id"})
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &in) {
			return
		}
		if !validName(in.Name) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_name"})
			return
		}
		err = commands.UpdateEvent(r.Context(), id, strings.TrimSpace(in.Name))
		writeAdminMutationResult(w, err)
	})
	mux.HandleFunc("POST /api/events/{id}/ticket-types", func(w http.ResponseWriter, r *http.Request) {
		if !admin(w, r) {
			return
		}
		eventID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || eventID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_event_id"})
			return
		}
		var in struct {
			Name     string `json:"name"`
			Capacity int64  `json:"capacity"`
		}
		if !decode(w, r, &in) {
			return
		}
		if !validName(in.Name) || in.Capacity < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ticket_type"})
			return
		}
		id, err := commands.CreateTicketType(r.Context(), eventID, strings.TrimSpace(in.Name), in.Capacity)
		if err != nil {
			writeAdminMutationResult(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
	})
	mux.HandleFunc("PUT /api/ticket-types/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !admin(w, r) {
			return
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ticket_type_id"})
			return
		}
		var in struct {
			Name     string `json:"name"`
			Capacity int64  `json:"capacity"`
		}
		if !decode(w, r, &in) {
			return
		}
		if !validName(in.Name) || in.Capacity < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ticket_type"})
			return
		}
		err = commands.UpdateTicketType(r.Context(), id, strings.TrimSpace(in.Name), in.Capacity)
		writeAdminMutationResult(w, err)
	})
	return mux
}

func AuthConfig(mux *http.ServeMux, publishableKey string) {
	mux.HandleFunc("GET /api/auth/config", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"publishableKey": publishableKey})
	})
}

func writeAdminMutationResult(w http.ResponseWriter, err error) {
	if err == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if strings.Contains(err.Error(), "CHECK constraint failed") {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "capacity_below_reserved_or_invalid_event"})
		return
	}
	if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "event_not_found"})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
