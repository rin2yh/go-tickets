package profile_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/profile"
	"github.com/rin2yh/go-tickets/internal/test/store"
)

type clerkTransport struct {
	base      string
	transport http.RoundTripper
}

func (t clerkTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	target, err := url.Parse(t.base + request.URL.EscapedPath())
	if err != nil {
		return nil, err
	}
	target.RawQuery = request.URL.RawQuery
	request = request.Clone(request.Context())
	request.URL = target
	request.Host = target.Host
	return t.transport.RoundTrip(request)
}

func newStore(t *testing.T, handler http.Handler) (*profile.Store, *sql.DB) {
	t.Helper()
	db := store.NewDB(t)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := &http.Client{Transport: clerkTransport{base: server.URL, transport: http.DefaultTransport}}
	return profile.NewStore("sk_test_profile", client, db), db
}

func TestStoreName(t *testing.T) {
	for _, tc := range []struct {
		name       string
		metadata   string
		legacyName string
		wantName   string
		wantPatch  bool
		wantError  bool
	}{
		{name: "reads and trims Clerk metadata", metadata: `{"participant_name":"  Ada Lovelace  "}`, wantName: "Ada Lovelace"},
		{name: "migrates legacy projection", legacyName: "Grace Hopper", wantName: "Grace Hopper", wantPatch: true},
		{name: "missing name is empty", wantName: ""},
		{name: "non-object metadata is rejected", metadata: `["unexpected"]`, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var patched bool
			serverHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer sk_test_profile" {
					t.Errorf("authorization header = %q", r.Header.Get("Authorization"))
				}
				switch r.Method {
				case http.MethodGet:
					w.Header().Set("Content-Type", "application/json")
					if tc.metadata == "" {
						_, _ = io.WriteString(w, `{"id":"user_1"}`)
					} else {
						_, _ = io.WriteString(w, `{"id":"user_1","public_metadata":`+tc.metadata+`}`)
					}
				case http.MethodPatch:
					patched = true
					var body struct {
						PublicMetadata map[string]string `json:"public_metadata"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Errorf("decode metadata update: %v", err)
					}
					if body.PublicMetadata["participant_name"] != tc.legacyName {
						t.Errorf("updated metadata = %#v", body.PublicMetadata)
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, `{"id":"user_1"}`)
				default:
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					http.NotFound(w, r)
				}
			})
			s, db := newStore(t, serverHandler)
			if tc.legacyName != "" {
				if _, err := db.Exec(`INSERT INTO participant_profiles(user_id,name) VALUES('user_1',?)`, tc.legacyName); err != nil {
					t.Fatal(err)
				}
			}
			got, err := s.Name(context.Background(), "user_1")
			if (err != nil) != tc.wantError || got != tc.wantName || patched != tc.wantPatch {
				t.Fatalf("Name() = %q, %v, patched=%t", got, err, patched)
			}
			if tc.wantName != "" && !tc.wantError {
				var projected string
				if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&projected); err != nil || projected != tc.wantName {
					t.Fatalf("projection = %q, %v; want %q", projected, err, tc.wantName)
				}
			}
		})
	}
}

func TestStoreNameErrors(t *testing.T) {
	t.Run("Clerk request failure", func(t *testing.T) {
		s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		}))
		if _, err := s.Name(context.Background(), "user_1"); err == nil {
			t.Fatal("Name returned nil error")
		}
	})
	t.Run("legacy profile lookup error", func(t *testing.T) {
		s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"id":"user_1"}`)
		}))
		if _, err := db.Exec(`DROP TABLE participant_profiles`); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Name(context.Background(), "user_1"); err == nil {
			t.Fatal("Name returned nil error")
		}
	})
	t.Run("projection update error", func(t *testing.T) {
		s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"id":"user_1","public_metadata":{"participant_name":"Ada"}}`)
		}))
		if _, err := db.Exec(`DROP TABLE participant_profiles`); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Name(context.Background(), "user_1"); err == nil {
			t.Fatal("Name returned nil error")
		}
	})
}

func TestStoreSave(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		wantError bool
	}{
		{name: "updates metadata and projection", status: http.StatusOK},
		{name: "returns Clerk failure", status: http.StatusBadGateway, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPatch || r.URL.Path != "/v1/users/user_1/metadata" {
					t.Errorf("request = %s %s", r.Method, r.URL.Path)
				}
				if tc.status != http.StatusOK {
					http.Error(w, "failed", tc.status)
					return
				}
				body, err := io.ReadAll(r.Body)
				if err != nil || !strings.Contains(string(body), `"participant_name":"Ada"`) {
					t.Errorf("metadata update body = %s, %v", body, err)
				}
				_, _ = io.WriteString(w, `{"id":"user_1"}`)
			}))
			err := s.Save(context.Background(), "user_1", "Ada")
			if (err != nil) != tc.wantError {
				t.Fatalf("Save() error = %v, wantError=%t", err, tc.wantError)
			}
			if !tc.wantError {
				var name string
				if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&name); err != nil || name != "Ada" {
					t.Fatalf("projection = %q, %v", name, err)
				}
			}
		})
	}
}

func TestProfileHandler(t *testing.T) {
	t.Run("Get returns the profile name", func(t *testing.T) {
		s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"id":"user_1","public_metadata":{"participant_name":"Ada"}}`)
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Get(w, httptest.NewRequest(http.MethodGet, "/profile", nil))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"name":"Ada"`) {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("Save persists and returns a trimmed name", func(t *testing.T) {
		s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPatch {
				t.Errorf("method = %s", r.Method)
			}
			_, _ = io.WriteString(w, `{"id":"user_1"}`)
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(`{"name":"  Ada  "}`)))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"name":"Ada"`) {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
		var name string
		if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&name); err != nil || name != "Ada" {
			t.Fatalf("projection = %q, %v", name, err)
		}
	})
	t.Run("Get maps Clerk errors to bad gateway", func(t *testing.T) {
		s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Get(w, httptest.NewRequest(http.MethodGet, "/profile", nil))
		if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "profile_unavailable") {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})

	for _, tc := range []struct {
		name, body string
		want       int
	}{
		{name: "malformed JSON", body: `{`, want: http.StatusBadRequest},
		{name: "missing name", body: `{"name":"  "}`, want: http.StatusBadRequest},
		{name: "name over 100 characters", body: `{"name":"` + strings.Repeat("a", 101) + `"}`, want: http.StatusBadRequest},
		{name: "body over size limit", body: `{"name":"` + strings.Repeat("a", 4096) + `"}`, want: http.StatusBadRequest},
	} {
		t.Run("Save "+tc.name, func(t *testing.T) {
			s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				t.Error("Clerk should not be called for invalid input")
				http.Error(w, "unexpected", http.StatusInternalServerError)
			}))
			w := httptest.NewRecorder()
			profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(tc.body)))
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	t.Run("Save maps Clerk errors to bad gateway", func(t *testing.T) {
		s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(`{"name":"Ada"}`)))
		if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "profile_unavailable") {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})
}
