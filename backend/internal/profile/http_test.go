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
	"github.com/rin2yh/go-tickets/x/test"
)

func TestStoreNameFromClerkMetadata(t *testing.T) {
	type input struct{ response string }
	type want struct {
		name     string
		hasError bool
	}
	testx.NewTable[input, want](t,
		testx.NewCase("reads and trims Clerk metadata", input{response: `{"id":"user_1","public_metadata":{"participant_name":"  Ada Lovelace  "}}`}, want{name: "Ada Lovelace"}),
		testx.NewCase("missing name is empty", input{response: `{"id":"user_1"}`}, want{}),
		testx.NewCase("non-object metadata is rejected", input{response: `{"id":"user_1","public_metadata":["unexpected"]}`}, want{hasError: true}),
	).Run(func(t *testing.T, in input, want want) {
		s, db := newStore(t, newClerkMux(t, clerkHandlers{
			get: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, in.response)
			},
		}))
		got, err := s.Name(context.Background(), "user_1")
		if (err != nil) != want.hasError || got != want.name {
			t.Fatalf("Name() = %q, %v; want %q, hasError=%t", got, err, want.name, want.hasError)
		}
		if want.name != "" {
			var projected string
			if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&projected); err != nil || projected != want.name {
				t.Fatalf("projection = %q, %v; want %q", projected, err, want.name)
			}
		}
	})
}

func TestStoreNameMigratesLegacyProfile(t *testing.T) {
	const legacyName = "Grace Hopper"
	patched := false
	s, db := newStore(t, newClerkMux(t, clerkHandlers{
		get: func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `{"id":"user_1"}`)
		},
		patch: func(w http.ResponseWriter, r *http.Request) {
			patched = true
			var body struct {
				PublicMetadata map[string]string `json:"public_metadata"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode metadata update: %v", err)
			}
			if body.PublicMetadata["participant_name"] != legacyName {
				t.Errorf("updated metadata = %#v", body.PublicMetadata)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"user_1"}`)
		},
	}))
	if _, err := db.Exec(`INSERT INTO participant_profiles(user_id,name) VALUES('user_1',?)`, legacyName); err != nil {
		t.Fatal(err)
	}

	got, err := s.Name(context.Background(), "user_1")
	if err != nil || got != legacyName {
		t.Fatalf("Name() = %q, %v; want %q", got, err, legacyName)
	}
	if !patched {
		t.Fatal("legacy profile was not migrated to Clerk metadata")
	}
	var projected string
	if err := db.QueryRow(`SELECT name FROM participant_profiles WHERE user_id='user_1'`).Scan(&projected); err != nil || projected != legacyName {
		t.Fatalf("projection = %q, %v; want %q", projected, err, legacyName)
	}
}

func TestStoreNameErrors(t *testing.T) {
	type input struct {
		status    int
		response  string
		dropTable bool
	}
	type want struct{}
	testx.NewTable[input, want](t,
		testx.NewCase("Clerk request failure", input{status: http.StatusServiceUnavailable}, want{}),
		testx.NewCase("legacy profile lookup error", input{status: http.StatusOK, response: `{"id":"user_1"}`, dropTable: true}, want{}),
		testx.NewCase("projection update error", input{status: http.StatusOK, response: `{"id":"user_1","public_metadata":{"participant_name":"Ada"}}`, dropTable: true}, want{}),
	).Run(func(t *testing.T, in input, _ want) {
		s, db := newStore(t, newClerkMux(t, clerkHandlers{
			get: func(w http.ResponseWriter, _ *http.Request) {
				if in.status != http.StatusOK {
					http.Error(w, "unavailable", in.status)
					return
				}
				_, _ = io.WriteString(w, in.response)
			},
		}))
		if in.dropTable {
			if _, err := db.Exec(`DROP TABLE participant_profiles`); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := s.Name(context.Background(), "user_1"); err == nil {
			t.Fatal("Name returned nil error")
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
		s, db := newStore(t, newClerkMux(t, clerkHandlers{
			patch: func(w http.ResponseWriter, r *http.Request) {
				if in.status != http.StatusOK {
					http.Error(w, "failed", in.status)
					return
				}
				body, err := io.ReadAll(r.Body)
				if err != nil || !strings.Contains(string(body), `"participant_name":"Ada"`) {
					t.Errorf("metadata update body = %s, %v", body, err)
				}
				_, _ = io.WriteString(w, `{"id":"user_1"}`)
			},
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
		s, _ := newStore(t, newClerkMux(t, clerkHandlers{
			get: func(w http.ResponseWriter, _ *http.Request) {
				_, _ = io.WriteString(w, `{"id":"user_1","public_metadata":{"participant_name":"Ada"}}`)
			},
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Get(w, httptest.NewRequest(http.MethodGet, "/profile", nil))
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"name":"Ada"`) {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("Save persists and returns a trimmed name", func(t *testing.T) {
		s, db := newStore(t, newClerkMux(t, clerkHandlers{
			patch: func(w http.ResponseWriter, _ *http.Request) {
				_, _ = io.WriteString(w, `{"id":"user_1"}`)
			},
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
		s, _ := newStore(t, newClerkMux(t, clerkHandlers{
			get: func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "unavailable", http.StatusServiceUnavailable)
			},
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
		s, _ := newStore(t, newClerkMux(t, clerkHandlers{}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(in.body)))
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
	t.Run("Save maps Clerk errors to bad gateway", func(t *testing.T) {
		s, _ := newStore(t, newClerkMux(t, clerkHandlers{
			patch: func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "unavailable", http.StatusServiceUnavailable)
			},
		}))
		w := httptest.NewRecorder()
		profile.Handler{Store: s, UserID: func(*http.Request) string { return "user_1" }}.Save(w, httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(`{"name":"Ada"}`)))
		if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "profile_unavailable") {
			t.Fatalf("response = %d %s", w.Code, w.Body.String())
		}
	})
}
