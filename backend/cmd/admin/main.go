//go:build js && wasm

package main

import (
	"database/sql"
	"log"

	"github.com/rin2yh/go-tickets/internal/tickets"
	"github.com/syumai/workers-go"
	"github.com/syumai/workers-go/cloudflare/d1"
)

func main() {
	connector, err := d1.OpenConnector("DB")
	if err != nil { log.Fatal(err) }
	db := sql.OpenDB(connector)
	workers.Serve(tickets.AdminHandler(tickets.SQLStore{DB: db}))
}
