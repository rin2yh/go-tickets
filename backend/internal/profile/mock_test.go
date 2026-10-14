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

func newStore(t *testing.T, handler http.Handler) (*profile.Store, *sql.DB) {
	t.Helper()
	db := store.NewDB(t)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := &http.Client{Transport: clerkTransport{base: server.URL, transport: http.DefaultTransport}}
	return profile.NewStore("sk_test_profile", client, db), db
}
