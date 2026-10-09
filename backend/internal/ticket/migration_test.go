package ticket_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	_ "modernc.org/sqlite"
)

func TestEventMigrationPreservesLegacyRecords(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "legacy.db")+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Join(filepath.Dir(file), "..", "..")
	for _, name := range []string{"0001_init.sql"} {
		migration, readErr := os.ReadFile(filepath.Join(root, "migrations", name))
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, err = db.Exec(string(migration)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Exec(`INSERT INTO events(id, name) VALUES (1, 'Legacy event'); INSERT INTO ticket_types(id, event_id, name, capacity) VALUES (2, 1, 'Legacy ticket', 3); INSERT INTO registrations(id, ticket_type_id, user_id) VALUES (4, 2, 'user_legacy')`); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile(filepath.Join(root, "migrations", "0003_event_details_and_registration_periods.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(migration)); err != nil {
		t.Fatalf("apply migration to populated database: %v", err)
	}
	var eventName, publicationStatus, registrationStatus string
	var capacity, reserved int64
	var createdAt string
	if err := db.QueryRow(`SELECT e.name, e.publication_status, e.created_at, t.capacity, t.reserved, r.status FROM events e JOIN ticket_types t ON t.event_id=e.id JOIN registrations r ON r.ticket_type_id=t.id WHERE e.id=1`).Scan(&eventName, &publicationStatus, &createdAt, &capacity, &reserved, &registrationStatus); err != nil {
		t.Fatal(err)
	}
	if eventName != "Legacy event" || publicationStatus != "draft" || capacity != 3 || reserved != 1 || registrationStatus != "active" || createdAt == "" {
		t.Fatalf("migrated legacy record: event=%q status=%q created=%q capacity=%d reserved=%d registration=%q", eventName, publicationStatus, createdAt, capacity, reserved, registrationStatus)
	}
}
