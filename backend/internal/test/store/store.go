package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	_ "modernc.org/sqlite"
)

func NewDB(t testing.TB) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "ticket.db")+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate store helper")
	}
	migrationsDir := filepath.Join(filepath.Dir(file), "..", "..", "..", "migrations")
	for _, name := range []string{"0001_init.sql", "0002_administrators.sql"} {
		migration, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(migration)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
	}
	return db
}

func Seed(t testing.TB, db *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO events(id, name) VALUES (1, 'Later'), (2, 'Earlier'), (3, 'Empty')`,
		`INSERT INTO ticket_types(id, event_id, name, capacity) VALUES (12, 1, 'Zed', 3), (11, 1, 'Alpha', 2), (21, 2, 'General', 1), (30, 2, 'No registrations', 0)`,
		`INSERT INTO registrations(ticket_type_id, user_id) VALUES (12, 'user'), (21, 'user'), (11, 'other')`,
		`INSERT INTO administrators(clerk_user_id) VALUES ('admin')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed database: %v", err)
		}
	}
}
