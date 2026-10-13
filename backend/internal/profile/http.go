package profile

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	httpx "github.com/rin2yh/go-tickets/x/http"
)

type Handler struct {
	DB     *sql.DB
	UserID func(*http.Request) string
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	var name string
	err := h.DB.QueryRowContext(r.Context(), `SELECT name FROM participant_profiles WHERE user_id=?`, h.UserID(r)).Scan(&name)
	if err == sql.ErrNoRows {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"name": ""})
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"name": name})
}
func (h Handler) Save(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || len([]rune(name)) > 100 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_name")
		return
	}
	_, err := h.DB.ExecContext(r.Context(), `INSERT INTO participant_profiles(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,updated_at=CURRENT_TIMESTAMP`, h.UserID(r), name)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "database_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"name": name})
}
