//go:build js && wasm

package main

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/rin2yh/go-tickets/internal/auth"
	"github.com/rin2yh/go-tickets/internal/tickets"
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
	handler := tickets.NewHandler(tickets.SQLQuery{DB: db}, tickets.SQLCommand{DB: db}, auth.UserID)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.Health)
	mux.Handle("GET /api/auth/config", handler.AuthConfig(cloudflare.Getenv("CLERK_PUBLISHABLE_KEY")))
	mux.HandleFunc("GET /api/events", handler.Events)
	mux.HandleFunc("GET /api/events/{id}", handler.Event)
	mux.Handle("GET /api/registrations", handler.Authenticated(http.HandlerFunc(handler.Registrations)))
	mux.Handle("POST /api/registrations", handler.Authenticated(http.HandlerFunc(handler.Register)))
	mux.Handle("POST /api/registrations/cancel", handler.Authenticated(http.HandlerFunc(handler.CancelRegistration)))
	workers.Serve(authenticator.Wrap(mux))
}
