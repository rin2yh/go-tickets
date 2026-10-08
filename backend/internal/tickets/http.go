package tickets

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

func Health(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func PublicHandler(store Store, authenticatedUserID func(*http.Request) string) http.Handler {
	mux := http.NewServeMux()
	Health(mux)
	mux.HandleFunc("GET /api/events", func(w http.ResponseWriter, r *http.Request) {
		events, err := store.Events(r.Context())
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
		event, err := store.Event(r.Context(), eventID)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, event)
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	mux.HandleFunc("GET /registrations", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		registrations, err := store.Registrations(r.Context(), userID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
			return
		}
		writeJSON(w, http.StatusOK, registrations)
	})
	mux.HandleFunc("POST /registrations", func(w http.ResponseWriter, r *http.Request) {
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
		err := store.Register(r.Context(), input.TicketTypeID, userID)
		switch {
		case err == nil:
			writeJSON(w, http.StatusCreated, map[string]string{"status": "registered"})
		case errors.Is(err, ErrSoldOut), errors.Is(err, ErrDuplicate):
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	mux.HandleFunc("POST /registrations/cancel", func(w http.ResponseWriter, r *http.Request) {
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
		err := store.Cancel(r.Context(), input.TicketTypeID, userID)
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

func AdminHandler(store Store, authenticatedUserID func(*http.Request) string) http.Handler {
	mux := http.NewServeMux()
	Health(mux)
	mux.HandleFunc("GET /ticket-types/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		userID := authenticatedUserID(r)
		if userID == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		isAdmin, err := store.IsAdmin(r.Context(), userID)
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
		status, err := store.Status(r.Context(), 1)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, status)
		case errors.Is(err, sql.ErrNoRows):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
	})
	return mux
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
