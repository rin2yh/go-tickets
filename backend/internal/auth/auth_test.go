package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v3"
	"github.com/rin2yh/go-tickets/internal/test/store"
)

func TestAuthenticator(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	keyID := "auth-test-key"
	jwkSet, err := json.Marshal(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: keyID, Algorithm: string(jose.RS256), Use: "sig"}}})
	if err != nil {
		t.Fatal(err)
	}
	clerkAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/jwks" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk_test_unit" {
			http.Error(w, "missing Clerk API authorization", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(jwkSet)
	}))
	defer clerkAPI.Close()

	validToken := signToken(t, key, keyID, map[string]any{
		"iss": "https://sample.clerk.accounts.dev",
		"sub": "user_Valid123",
		"sid": "sess_test",
		"azp": "http://localhost:8787",
		"iat": time.Now().Unix(),
		"nbf": time.Now().Add(-time.Second).Unix(),
		"exp": time.Now().Add(time.Minute).Unix(),
	})
	tokenParts := strings.Split(validToken, ".")
	signature := []byte(tokenParts[2])
	if signature[0] == 'A' {
		signature[0] = 'B'
	} else {
		signature[0] = 'A'
	}
	tamperedToken := tokenParts[0] + "." + tokenParts[1] + "." + string(signature)

	tests := []struct {
		name  string
		token string
		path  string
		want  int
		user  string
	}{
		{name: "valid", token: validToken, path: "/api/registrations", want: http.StatusNoContent, user: "user_Valid123"},
		{name: "missing token", path: "/api/registrations", want: http.StatusUnauthorized},
		{name: "health is public", path: "/health", want: http.StatusNoContent},
		{name: "event list is public", path: "/api/events", want: http.StatusNoContent},
		{name: "event detail is public", path: "/api/events/1", want: http.StatusNoContent},
		{name: "Clerk config is public", path: "/api/auth/config", want: http.StatusNoContent},
		{name: "invalid signature", token: tamperedToken, path: "/api/registrations", want: http.StatusUnauthorized},
		{name: "wrong party", token: signToken(t, key, keyID, map[string]any{
			"iss": "https://sample.clerk.accounts.dev", "sub": "user_Valid123", "sid": "sess_test", "azp": "https://attacker.example",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
		}), path: "/api/registrations", want: http.StatusUnauthorized},
		{name: "expired", token: signToken(t, key, keyID, map[string]any{
			"iss": "https://sample.clerk.accounts.dev", "sub": "user_Valid123", "sid": "sess_test", "azp": "http://localhost:8787",
			"iat": time.Now().Add(-time.Hour).Unix(), "exp": time.Now().Add(-time.Minute).Unix(),
		}), path: "/api/registrations", want: http.StatusUnauthorized},
		{name: "missing authorized party", token: signToken(t, key, keyID, map[string]any{
			"iss": "https://sample.clerk.accounts.dev", "sub": "user_Valid123", "sid": "sess_test",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
		}), path: "/api/registrations", want: http.StatusUnauthorized},
		{name: "invalid subject", token: signToken(t, key, keyID, map[string]any{
			"iss": "https://sample.clerk.accounts.dev", "sub": "not-a-clerk-user", "sid": "sess_test", "azp": "http://localhost:8787",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
		}), path: "/api/registrations", want: http.StatusUnauthorized},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			authenticator, err := New("sk_test_unit", []string{" http://localhost:8787 "}, http.DefaultClient, clerkAPI.URL+"/v1")
			if err != nil {
				t.Fatal(err)
			}
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if got := UserID(r); got != tc.user {
					t.Errorf("authenticated user = %q, want %q", got, tc.user)
				}
				w.WriteHeader(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			response := httptest.NewRecorder()
			authenticator.Wrap(next).ServeHTTP(response, req)
			if response.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", response.Code, tc.want, response.Body.String())
			}
		})
	}
}

func TestNewRequiresConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, secret string
		parties      []string
		client       *http.Client
	}{
		{name: "missing secret", parties: []string{"http://localhost"}, client: http.DefaultClient},
		{name: "missing party", secret: "sk_test", client: http.DefaultClient},
		{name: "empty party", secret: "sk_test", parties: []string{" "}, client: http.DefaultClient},
		{name: "missing client", secret: "sk_test", parties: []string{"http://localhost"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := New(tc.secret, tc.parties, tc.client, ""); err == nil {
				t.Fatal("New returned nil error for invalid config")
			}
		})
	}
}

func TestIsAdmin(t *testing.T) {
	db := store.NewDB(t)
	store.Seed(t, db)
	for _, tc := range []struct {
		name   string
		userID string
		want   bool
	}{
		{name: "administrator", userID: "admin", want: true},
		{name: "regular user", userID: "user", want: false},
		{name: "unknown user", userID: "missing", want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := IsAdmin(context.Background(), db, tc.userID)
			if err != nil || got != tc.want {
				t.Fatalf("IsAdmin(%q) = %t, %v; want %t", tc.userID, got, err, tc.want)
			}
		})
	}
}

func signToken(t *testing.T, key *rsa.PrivateKey, keyID string, claims map[string]any) string {
	t.Helper()
	options := (&jose.SignerOptions{}).WithType("JWT")
	options.WithHeader("kid", keyID)
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, options)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	signed, err := signer.Sign(payload)
	if err != nil {
		t.Fatal(err)
	}
	compact, err := signed.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(compact, ".") != 2 {
		t.Fatal("invalid compact token")
	}
	return compact
}
