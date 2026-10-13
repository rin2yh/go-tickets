package profile

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkuser "github.com/clerk/clerk-sdk-go/v2/user"
	httpx "github.com/rin2yh/go-tickets/x/http"
)

const metadataKey = "participant_name"

// Store treats Clerk public metadata as the source of truth. The D1 row is a
// query projection so attendee pages can join names without per-row API calls.
type Store struct {
	users *clerkuser.Client
	db    *sql.DB
}

func NewStore(secret string, client *http.Client, db *sql.DB) *Store {
	return &Store{users: clerkuser.NewClient(&clerk.ClientConfig{BackendConfig: clerk.BackendConfig{Key: &secret, HTTPClient: client}}), db: db}
}

func (s *Store) Name(ctx context.Context, userID string) (string, error) {
	user, err := s.users.Get(ctx, userID)
	if err != nil {
		return "", err
	}
	var metadata map[string]any
	if len(user.PublicMetadata) > 0 {
		if err := json.Unmarshal(user.PublicMetadata, &metadata); err != nil {
			return "", err
		}
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	name, _ := metadata[metadataKey].(string)
	name = strings.TrimSpace(name)
	if name != "" {
		return name, s.syncProjection(ctx, userID, name)
	}
	// Migrate names saved by the previous D1-only version into Clerk lazily.
	err = s.db.QueryRowContext(ctx, `SELECT name FROM participant_profiles WHERE user_id=?`, userID).Scan(&name)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	encoded, err := json.Marshal(map[string]string{metadataKey: name})
	if err != nil {
		return "", err
	}
	_, err = s.users.UpdateMetadata(ctx, userID, &clerkuser.UpdateMetadataParams{PublicMetadata: (*json.RawMessage)(&encoded)})
	if err != nil {
		return "", err
	}
	return name, s.syncProjection(ctx, userID, name)
}

func (s *Store) Save(ctx context.Context, userID, name string) error {
	metadata, err := json.Marshal(map[string]string{metadataKey: name})
	if err != nil {
		return err
	}
	_, err = s.users.UpdateMetadata(ctx, userID, &clerkuser.UpdateMetadataParams{PublicMetadata: (*json.RawMessage)(&metadata)})
	if err != nil {
		return err
	}
	return s.syncProjection(ctx, userID, name)
}

func (s *Store) syncProjection(ctx context.Context, userID, name string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO participant_profiles(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,updated_at=CURRENT_TIMESTAMP`, userID, name)
	return err
}

type Handler struct {
	Store  *Store
	UserID func(*http.Request) string
}

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	name, err := h.Store.Name(r.Context(), h.UserID(r))
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "profile_unavailable")
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
	if err := h.Store.Save(r.Context(), h.UserID(r), name); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "profile_unavailable")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"name": name})
}
