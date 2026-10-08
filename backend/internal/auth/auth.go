package auth

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/clerk/clerk-sdk-go/v2/jwks"
)

type userIDKey struct{}

var validUserID = regexp.MustCompile(`^user_[A-Za-z0-9]{1,123}$`)

// Authenticator verifies Clerk session tokens and stores the verified user ID
// in the request context.
type Authenticator struct {
	verify          func(http.Handler) http.Handler
	authorizedParty map[string]struct{}
}

// New creates an authenticator that uses Clerk's JWKS endpoint to verify tokens.
func New(secretKey string, authorizedParties []string, client *http.Client, clerkAPIURL string) (*Authenticator, error) {
	if strings.TrimSpace(secretKey) == "" {
		return nil, errors.New("clerk secret key is required")
	}
	parties := make(map[string]struct{}, len(authorizedParties))
	partyList := make([]string, 0, len(authorizedParties))
	for _, party := range authorizedParties {
		if party = strings.TrimSpace(party); party != "" {
			if _, exists := parties[party]; !exists {
				parties[party] = struct{}{}
				partyList = append(partyList, party)
			}
		}
	}
	if len(parties) == 0 {
		return nil, errors.New("at least one Clerk authorized party is required")
	}
	if client == nil {
		return nil, errors.New("clerk JWKS HTTP client is required")
	}

	key := secretKey
	backend := clerk.BackendConfig{Key: &key, HTTPClient: client}
	if clerkAPIURL != "" {
		backend.URL = &clerkAPIURL
	}
	config := &clerk.ClientConfig{BackendConfig: backend}
	jwksClient := jwks.NewClient(config)
	verify := clerkhttp.WithHeaderAuthorization(
		clerkhttp.JWKSClient(jwksClient),
		clerkhttp.AuthorizedPartyMatches(partyList...),
		clerkhttp.AuthorizationFailureHandler(http.HandlerFunc(unauthorized)),
	)
	return &Authenticator{verify: verify, authorizedParty: parties}, nil
}

// Wrap protects API requests while leaving the health endpoint public.
func (a *Authenticator) Wrap(next http.Handler) http.Handler {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicRead(r) {
			next.ServeHTTP(w, r)
			return
		}
		claims, ok := clerk.SessionClaimsFromContext(r.Context())
		if !ok || claims == nil || !validUserID.MatchString(claims.Subject) || !a.hasAuthorizedParty(claims.AuthorizedParty) {
			unauthorized(w, r)
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey{}, claims.Subject)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
	return a.verify(handler)
}

func isPublicRead(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	if r.URL.Path == "/health" || r.URL.Path == "/api/events" {
		return true
	}
	if !strings.HasPrefix(r.URL.Path, "/api/events/") {
		return false
	}
	segment := strings.TrimPrefix(r.URL.Path, "/api/events/")
	return segment != "" && !strings.Contains(segment, "/")
}

func (a *Authenticator) hasAuthorizedParty(party string) bool {
	_, ok := a.authorizedParty[party]
	return ok
}

// UserID returns the authenticated Clerk user ID stored by Wrap.
func UserID(r *http.Request) string {
	userID, _ := r.Context().Value(userIDKey{}).(string)
	return userID
}

func unauthorized(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
