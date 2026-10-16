package profile_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
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

type clerkHandlers struct {
	get   http.HandlerFunc
	patch http.HandlerFunc
}

func newClerkMux(t *testing.T, handlers clerkHandlers) http.Handler {
	t.Helper()
	mux := http.NewServeMux()
	if handlers.get != nil {
		mux.HandleFunc("GET /v1/users/user_1", clerkRequest(t, http.MethodGet, "/v1/users/user_1", handlers.get))
	}
	if handlers.patch != nil {
		mux.HandleFunc("PATCH /v1/users/user_1/metadata", clerkRequest(t, http.MethodPatch, "/v1/users/user_1/metadata", handlers.patch))
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected Clerk request: %s %s", r.Method, r.URL.Path)
		http.NotFound(w, r)
	})
	return mux
}

func clerkRequest(t *testing.T, method, path string, handler http.HandlerFunc) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method || r.URL.Path != path {
			t.Errorf("Clerk request = %s %s, want %s %s", r.Method, r.URL.Path, method, path)
		}
		if r.Header.Get("Authorization") != "Bearer sk_test_profile" {
			t.Errorf("authorization header = %q", r.Header.Get("Authorization"))
		}
		handler(w, r)
	}
}

func newStore(t *testing.T, handler http.Handler) (*profile.Store, *sql.DB) {
	t.Helper()
	db := store.NewDB(t)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := &http.Client{Transport: clerkTransport{base: server.URL, transport: http.DefaultTransport}}
	return profile.NewStore("sk_test_profile", client, db), db
}
