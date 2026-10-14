package profile_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/profile"
	"github.com/rin2yh/go-tickets/x/testx"
)

func TestStoreName(t *testing.T) {
	type input struct {
		metadata, legacyName string
	}
	type want struct {
		name            string
		patch, hasError bool
	}
	testx.NewTable[input, want](t,
		testx.NewCase("reads and trims Clerk metadata", input{metadata: `{"participant_name":"  Ada Lovelace  "}`}, want{name: "Ada Lovelace"}),
		testx.NewCase("migrates legacy projection", input{legacyName: "Grace Hopper"}, want{name: "Grace Hopper", patch: true}),
		testx.NewCase("missing name is empty", input{}, want{}),
		testx.NewCase("non-object metadata is rejected", input{metadata: `["unexpected"]`}, want{hasError: true}),
	).Run(func(t *testing.T, in input, want want) {
		var patched bool
		serverHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer sk_test_profile" {
				t.Errorf("authorization header = %q", r.Header.Get("Authorization"))
			}
			switch r.Method {
			case http.MethodGet:
				w.Header().Set("Content-Type", "application/json")
				if in.metadata == "" {
					_, _ = io.WriteString(w, `{"id":"user_1"}`)
				} else {
					_, _ = io.WriteString(w, `{"id":"user_1","public_metadata":`+in.metadata+`}`)
				}
			case http.MethodPatch:
				patched = true
				var body struct {
					PublicMetadata map[string]string `json:"public_metadata"`
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Errorf("decode metadata update: %v", err)
				}
				if body.PublicMetadata["participant_name"] != in.legacyName {
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
		if in.legacyName != "" {
			if _, err := db.Exec(`INSERT INTO participant_profiles(user_id,name) VALUES('user_1',?)`, in.legacyName); err != nil {
				t.Fatal(err)
			}
		}
		got, err := s.Name(context.Background(), "user_1")
		if (err != nil) != want.hasError || got != want.name || patched != want.patch {
			t.Fatalf("Name() = %q, %v, patched=%t", got, err, patched)
		}
		if want.name != "" && !want.hasError {
			var projected string
			if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&projected); err != nil || projected != want.name {
				t.Fatalf("projection = %q, %v; want %q", projected, err, want.name)
			}
		}
	})
}

func TestStoreNameErrors(t *testing.T) {
	type input struct {
		status    int
		response  string
		dropTable bool
	}
	type want struct{ hasError bool }
	testx.NewTable[input, want](t,
		testx.NewCase("Clerk request failure", input{status: http.StatusServiceUnavailable}, want{hasError: true}),
		testx.NewCase("legacy profile lookup error", input{status: http.StatusOK, response: `{"id":"user_1"}`, dropTable: true}, want{hasError: true}),
		testx.NewCase("projection update error", input{status: http.StatusOK, response: `{"id":"user_1","public_metadata":{"participant_name":"Ada"}}`, dropTable: true}, want{hasError: true}),
	).Run(func(t *testing.T, in input, want want) {
		s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			if in.status != http.StatusOK {
				http.Error(w, "unavailable", in.status)
				return
			}
			_, _ = io.WriteString(w, in.response)
		}))
		if in.dropTable {
			if _, err := db.Exec(`DROP TABLE participant_profiles`); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := s.Name(context.Background(), "user_1"); (err != nil) != want.hasError {
			t.Fatalf("Name() error = %v, wantError=%t", err, want.hasError)
		}
	})
}

func TestStoreSave(t *testing.T) {
	type input struct{ status int }
	type want struct{ hasError bool }
	testx.NewTable[input, want](t,
		testx.NewCase("updates metadata and projection", input{status: http.StatusOK}, want{}),
		testx.NewCase("returns Clerk failure", input{status: http.StatusBadGateway}, want{hasError: true}),
	).Run(func(t *testing.T, in input, want want) {
		s, db := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPatch || r.URL.Path != "/v1/users/user_1/metadata" {
				t.Errorf("request = %s %s", r.Method, r.URL.Path)
			}
			if in.status != http.StatusOK {
				http.Error(w, "failed", in.status)
				return
			}
			body, err := io.ReadAll(r.Body)
			if err != nil || !strings.Contains(string(body), `"participant_name":"Ada"`) {
				t.Errorf("metadata update body = %s, %v", body, err)
			}
			_, _ = io.WriteString(w, `{"id":"user_1"}`)
		}))
		err := s.Save(context.Background(), "user_1", "Ada")
		if (err != nil) != want.hasError {
			t.Fatalf("Save() error = %v, wantError=%t", err, want.hasError)
		}
		if !want.hasError {
			var name string
			if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&name); err != nil || name != "Ada" {
				t.Fatalf("projection = %q, %v", name, err)
			}
		}
	})
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

	type input struct{ body string }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("Save malformed JSON", input{body: `{`}, want{status: http.StatusBadRequest}),
		testx.NewCase("Save missing name", input{body: `{"name":"  "}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("Save name over 100 characters", input{body: `{"name":"` + strings.Repeat("a", 101) + `"}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("Save body over size limit", input{body: `{"name":"` + strings.Repeat("a", 4096) + `"}`}, want{status: http.StatusBadRequest}),
	).Run(func(t *testing.T, in input, want want) {
		s, _ := newStore(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			t.Error("Clerk should not be called for invalid input")
			http.Error(w, "unexpected", http.StatusInternalServerError)
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(in.body)))
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
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
