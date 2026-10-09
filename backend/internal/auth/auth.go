package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/clerk/clerk-sdk-go/v2/jwks"

	httpx "github.com/rin2yh/go-tickets/x/http"
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
	if r.URL.Path == "/health" || r.URL.Path == "/api/auth/config" || r.URL.Path == "/api/events" {
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

// IsAdmin reports whether the Clerk user ID is present in the administrators table.
func IsAdmin(ctx context.Context, db *sql.DB, userID string) (bool, error) {
	var admin bool
	err := db.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM administrators WHERE clerk_user_id = ?)", userID).Scan(&admin)
	return admin, err
}

func unauthorized(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}

// Authenticated requires a user identity established by the Clerk authenticator.
func Authenticated(userID func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID(r) == "" {
				httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AdminOnly requires an authenticated user that is present in the administrators table.
func AdminOnly(userID func(*http.Request) string, isAdmin func(context.Context, string) (bool, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return Authenticated(userID)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			admin, err := isAdmin(r.Context(), userID(r))
			if err != nil {
				httpx.WriteError(w, http.StatusInternalServerError, "database_error")
				return
			}
			if !admin {
				httpx.WriteError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}
