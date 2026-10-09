//go:build js && wasm

package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/rin2yh/go-tickets/internal/auth"
	"github.com/rin2yh/go-tickets/internal/event"
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
	handler := ticket.NewHandler(ticket.SQLQuery{DB: db}, ticket.SQLCommand{DB: db}, auth.UserID)
	queries, commands := ticket.SQLQuery{DB: db}, ticket.SQLCommand{DB: db}
	events := event.NewHandler(queries, commands)
	adminOnly := auth.AdminOnly(auth.UserID, func(ctx context.Context, userID string) (bool, error) { return auth.IsAdmin(ctx, db, userID) })
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.Health)
	mux.Handle("GET /api/auth/config", handler.AuthConfig(cloudflare.Getenv("CLERK_PUBLISHABLE_KEY")))
	mux.HandleFunc("GET /api/events", events.Events)
	mux.Handle("GET /api/ticket-types/{id}/status", adminOnly(http.HandlerFunc(handler.TicketTypeStatus)))
	mux.Handle("POST /api/events", adminOnly(http.HandlerFunc(events.CreateEvent)))
	mux.Handle("PUT /api/events/{id}", adminOnly(http.HandlerFunc(events.UpdateEvent)))
	mux.Handle("POST /api/events/{id}/ticket-types", adminOnly(http.HandlerFunc(handler.CreateTicketType)))
	mux.Handle("PUT /api/ticket-types/{id}", adminOnly(http.HandlerFunc(handler.UpdateTicketType)))
	workers.Serve(authenticator.Wrap(mux))
}
