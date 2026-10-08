package tickets

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func Health(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

func PublicHandler(store Store) http.Handler {
	mux := http.NewServeMux()
	Health(mux)
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

func AdminHandler(store Store) http.Handler {
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

const authenticatedUserHeader = "X-Go-Tickets-Authenticated-User"

// This header is trusted only behind the JavaScript Worker wrapper, which removes
// client-supplied values and sets it after verifying the Clerk session token.
func authenticatedUserID(r *http.Request) string {
	userID := strings.TrimSpace(r.Header.Get(authenticatedUserHeader))
	if len(userID) < 6 || len(userID) > 128 || !strings.HasPrefix(userID, "user_") {
		return ""
	}
	for _, ch := range userID[5:] {
		if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') {
			return ""
		}
	}
	return userID
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
