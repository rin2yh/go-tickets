//go:build js && wasm

package main

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/rin2yh/go-tickets/internal/auth"
	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/profile"
	"github.com/rin2yh/go-tickets/internal/ticket"
	"github.com/syumai/workers-go"
	"github.com/syumai/workers-go/cloudflare"
	"github.com/syumai/workers-go/cloudflare/d1"
	"github.com/syumai/workers-go/cloudflare/fetch"
)

func main() {
	connector, err := d1.OpenConnector("DB")
	if err != nil {
		log.Fatal(err)
	}
	db := sql.OpenDB(connector)
	client := fetch.NewClient().HTTPClient(fetch.RedirectModeFollow)
	client.Timeout = 5 * time.Second
	authenticator, err := auth.New(
		cloudflare.Getenv("CLERK_SECRET_KEY"),
		strings.Split(cloudflare.Getenv("CLERK_AUTHORIZED_PARTIES"), ","),
		client,
		"",
	)
	if err != nil {
		log.Fatal(err)
	}
	profiles := profile.NewStore(cloudflare.Getenv("CLERK_SECRET_KEY"), client, db)
	handler := ticket.NewHandler(ticket.SQLQuery{DB: db}, ticket.SQLCommand{DB: db}, auth.UserID, profiles)
	profileHandler := profile.Handler{Store: profiles, UserID: auth.UserID}
	events := event.NewHandler(event.SQLQuery{DB: db}, event.SQLCommand{DB: db})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.Health)
	mux.Handle("GET /api/auth/config", handler.AuthConfig(cloudflare.Getenv("CLERK_PUBLISHABLE_KEY")))
	mux.HandleFunc("GET /api/events", events.Events)
	mux.HandleFunc("GET /api/events/{id}", events.Event)
	protected := auth.Authenticated(auth.UserID)
	mux.Handle("GET /api/registrations", protected(http.HandlerFunc(handler.Registrations)))
	mux.Handle("GET /api/profile", protected(http.HandlerFunc(profileHandler.Get)))
	mux.Handle("PUT /api/profile", protected(http.HandlerFunc(profileHandler.Save)))
	mux.Handle("POST /api/registrations", protected(http.HandlerFunc(handler.Register)))
	mux.Handle("POST /api/registrations/cancel", protected(http.HandlerFunc(handler.CancelRegistration)))
	workers.Serve(authenticator.Wrap(mux))
}
