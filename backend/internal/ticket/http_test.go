package ticket_test

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rin2yh/go-tickets/internal/auth"
	"github.com/rin2yh/go-tickets/internal/event"
	"github.com/rin2yh/go-tickets/internal/ticket"
	"github.com/rin2yh/go-tickets/x/test"
)

func TestPublicHandler(t *testing.T) {
	type input struct{ path string }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("events are public", input{path: "/api/events"}, want{status: http.StatusOK}),
		testx.NewCase("event detail is public", input{path: "/api/events/1"}, want{status: http.StatusOK}),
		testx.NewCase("Clerk config is public", input{path: "/api/auth/config"}, want{status: http.StatusOK}),
		testx.NewCase("my registrations", input{path: "/api/registrations"}, want{status: http.StatusOK}),
		testx.NewCase("legacy registrations path is gone", input{path: "/registrations"}, want{status: http.StatusNotFound}),
	).Run(func(t *testing.T, in input, want want) {
		r := httptest.NewRequest(http.MethodGet, in.path, nil)
		r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
		w := httptest.NewRecorder()
		testPublicMux(&fakeStore{}).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
}

func TestRegisterHandler(t *testing.T) {
	type input struct {
		body  string
		store fakeStore
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("ignores body user id", input{body: `{"ticket_type_id":1,"user_id":"user_Attacker"}`}, want{status: http.StatusCreated}),
		testx.NewCase("sold out", input{body: `{"ticket_type_id":1}`, store: fakeStore{registerErr: ticket.ErrSoldOut}}, want{status: http.StatusConflict}),
		testx.NewCase("duplicate", input{body: `{"ticket_type_id":1}`, store: fakeStore{registerErr: ticket.ErrDuplicate}}, want{status: http.StatusConflict}),
	).Run(func(t *testing.T, in input, want want) {
		store := &in.store
		r := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(in.body))
		r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
		w := httptest.NewRecorder()
		testPublicMux(store).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
		if store.registeredUser != "user_Authenticated" {
			t.Fatalf("registered user = %q", store.registeredUser)
		}
	})
}

func TestPublicHandlerInvalidRequestBodies(t *testing.T) {
	type input struct{ path string }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("register", input{path: "/api/registrations"}, want{status: http.StatusBadRequest}),
		testx.NewCase("cancel", input{path: "/api/registrations/cancel"}, want{status: http.StatusBadRequest}),
	).Run(func(t *testing.T, in input, want want) {
		r := httptest.NewRequest(http.MethodPost, in.path, strings.NewReader(`{`))
		r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
		w := httptest.NewRecorder()
		testPublicMux(&fakeStore{}).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d", w.Code, want.status)
		}
		var response map[string]string
		decoder := json.NewDecoder(w.Body)
		if err := decoder.Decode(&response); err != nil {
			t.Fatalf("error response is not JSON: %v", err)
		}
		if response["error"] != "invalid_request" {
			t.Fatalf("error response = %#v", response)
		}
		if err := decoder.Decode(&response); !errors.Is(err, io.EOF) {
			t.Fatalf("error response contains additional data: %v", err)
		}
	})
}

func TestCancelRegistrationHandler(t *testing.T) {
	type input struct {
		store fakeStore
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("uses authenticated user id", input{}, want{status: http.StatusOK}),
		testx.NewCase("not found", input{store: fakeStore{cancelErr: ticket.ErrNotFound}}, want{status: http.StatusNotFound}),
	).Run(func(t *testing.T, in input, want want) {
		store := &in.store
		r := httptest.NewRequest(http.MethodPost, "/api/registrations/cancel", strings.NewReader(`{"ticket_type_id":1,"user_id":"user_Attacker"}`))
		r.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
		w := httptest.NewRecorder()
		testPublicMux(store).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
		if store.cancelledUser != "user_Authenticated" {
			t.Fatalf("cancelled user = %q", store.cancelledUser)
		}
	})
}

func TestRegisterHandlerUnauthenticated(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1,"user_id":"user_Forged"}`))
	w := httptest.NewRecorder()
	testPublicMux(&fakeStore{}).ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestRegisterHandlerRequiresParticipantName(t *testing.T) {
	h := ticket.NewHandler(&fakeStore{}, &fakeStore{}, testAuthenticatedUserID, fakeParticipantProfile{})
	mux := http.NewServeMux()
	mux.Handle("POST /api/registrations", auth.Authenticated(testAuthenticatedUserID)(http.HandlerFunc(h.Register)))
	req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1}`))
	req.Header.Set("X-Test-Authenticated-User", "user_Authenticated")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "participant_name_required") {
		t.Fatalf("response = %d %s", w.Code, w.Body.String())
	}
}

func TestAdminHandler(t *testing.T) {
	type input struct {
		path  string
		store fakeStore
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("admin events are restricted", input{path: "/api/admin/events", store: fakeStore{admin: true}}, want{status: http.StatusOK}),
		testx.NewCase("admin events reject regular users", input{path: "/api/admin/events"}, want{status: http.StatusForbidden}),
		testx.NewCase("invalid ticket type id", input{path: "/api/ticket-types/nope/status", store: fakeStore{admin: true}}, want{status: http.StatusBadRequest}),
		testx.NewCase("database error", input{path: "/api/ticket-types/1/status", store: fakeStore{admin: true, statusErr: errors.New("db")}}, want{status: http.StatusInternalServerError}),
		testx.NewCase("general user", input{path: "/api/ticket-types/1/status"}, want{status: http.StatusForbidden}),
		testx.NewCase("administrator lookup error", input{path: "/api/ticket-types/1/status", store: fakeStore{adminErr: errors.New("db")}}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		store := &in.store
		r := httptest.NewRequest(http.MethodGet, in.path, nil)
		r.Header.Set("X-Test-Authenticated-User", "user_ValidUser")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d", w.Code, want.status)
		}
		if store.adminUser != "user_ValidUser" {
			t.Fatalf("admin lookup user = %q", store.adminUser)
		}
	})

	legacy := httptest.NewRecorder()
	testAdminMux(&fakeStore{admin: true}).ServeHTTP(legacy, httptest.NewRequest(http.MethodGet, "/ticket-types/1/status", nil))
	if legacy.Code != http.StatusNotFound {
		t.Fatalf("legacy status path = %d, want %d", legacy.Code, http.StatusNotFound)
	}

	type statusInput struct {
		path  string
		store fakeStore
	}
	type statusWant struct {
		status   int
		ticketID int64
	}
	testx.NewTable[statusInput, statusWant](t,
		testx.NewCase("admin status", statusInput{path: "/api/ticket-types/1/status", store: fakeStore{admin: true}}, statusWant{status: http.StatusOK, ticketID: 1}),
		testx.NewCase("requested type id", statusInput{path: "/api/ticket-types/2/status", store: fakeStore{admin: true}}, statusWant{status: http.StatusOK, ticketID: 2}),
	).Run(func(t *testing.T, in statusInput, want statusWant) {
		store := &in.store
		r := httptest.NewRequest(http.MethodGet, in.path, nil)
		r.Header.Set("X-Test-Authenticated-User", "user_ValidUser")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, r)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d", w.Code, want.status)
		}
		var status ticket.Status
		if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil || status.Reserved != 1 {
			t.Fatalf("status body: %s: %v", w.Body.String(), err)
		}
		if store.statusID != want.ticketID || status.TicketTypeID != want.ticketID {
			t.Fatalf("status queried id = %d, response id = %d", store.statusID, status.TicketTypeID)
		}
	})
	t.Run("unauthenticated", func(t *testing.T) {
		store := &fakeStore{admin: true}
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/ticket-types/1/status", nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", w.Code)
		}
		if store.adminUser != "" {
			t.Fatal("admin lookup ran for unauthenticated request")
		}
	})
}

func TestAdminRegistrationsHandler(t *testing.T) {
	type input struct {
		path  string
		store fakeStore
	}
	type want struct {
		status       int
		page         int
		eventID      int64
		filterStatus string
		ticket       string
	}
	testx.NewTable[input, want](t,
		testx.NewCase("defaults page and filters", input{path: "/api/admin/events/7/registrations", store: fakeStore{admin: true}}, want{status: http.StatusOK, page: 1, eventID: 7}),
		testx.NewCase("forwards filters and page", input{path: "/api/admin/events/7/registrations?status=cancelled&ticket=12&page=3", store: fakeStore{admin: true}}, want{status: http.StatusOK, page: 3, eventID: 7, filterStatus: "cancelled", ticket: "12"}),
		testx.NewCase("rejects invalid event id", input{path: "/api/admin/events/0/registrations", store: fakeStore{admin: true}}, want{status: http.StatusBadRequest}),
		testx.NewCase("rejects nonnumeric page", input{path: "/api/admin/events/7/registrations?page=abc", store: fakeStore{admin: true}}, want{status: http.StatusBadRequest}),
		testx.NewCase("rejects page below one", input{path: "/api/admin/events/7/registrations?page=0", store: fakeStore{admin: true}}, want{status: http.StatusBadRequest}),
		testx.NewCase("reports query errors", input{path: "/api/admin/events/7/registrations", store: fakeStore{admin: true, adminRegistrationsErr: errors.New("db")}}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		store := &in.store
		req := httptest.NewRequest(http.MethodGet, in.path, nil)
		req.Header.Set("X-Test-Authenticated-User", "user_admin")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, req)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
		if want.status == http.StatusOK && (store.registrationsEventID != want.eventID || store.registrationsPage != want.page || store.registrationsStatus != want.filterStatus || store.registrationsTicket != want.ticket) {
			t.Fatalf("query args = event %d, status %q, ticket %q, page %d", store.registrationsEventID, store.registrationsStatus, store.registrationsTicket, store.registrationsPage)
		}
	})
}

func TestRegisterCommandErrors(t *testing.T) {
	type input struct{ err error }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("sold out", input{err: ticket.ErrSoldOut}, want{status: http.StatusConflict}),
		testx.NewCase("duplicate", input{err: ticket.ErrDuplicate}, want{status: http.StatusConflict}),
		testx.NewCase("unpublished", input{err: ticket.ErrUnpublished}, want{status: http.StatusConflict}),
		testx.NewCase("registration not started", input{err: ticket.ErrRegistrationNotStarted}, want{status: http.StatusConflict}),
		testx.NewCase("registration ended", input{err: ticket.ErrRegistrationEnded}, want{status: http.StatusConflict}),
		testx.NewCase("event ended", input{err: ticket.ErrEventEnded}, want{status: http.StatusConflict}),
		testx.NewCase("unexpected database error", input{err: errors.New("db")}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		store := &fakeStore{registerErr: in.err}
		req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1}`))
		req.Header.Set("X-Test-Authenticated-User", "user_1")
		w := httptest.NewRecorder()
		testPublicMux(store).ServeHTTP(w, req)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
}

func TestAdminTicketMutationErrors(t *testing.T) {
	type input struct {
		method, path, body string
		store              fakeStore
	}
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("create rejects foreign key", input{method: http.MethodPost, path: "/api/events/1/ticket-types", body: `{"name":"General","capacity":1}`, store: fakeStore{admin: true, createTicketTypeErr: errors.New("FOREIGN KEY constraint failed")}}, want{status: http.StatusNotFound}),
		testx.NewCase("create rejects invalid registration period", input{method: http.MethodPost, path: "/api/events/1/ticket-types", body: `{"name":"General","capacity":1}`, store: fakeStore{admin: true, createTicketTypeErr: errors.New("invalid_registration_period")}}, want{status: http.StatusBadRequest}),
		testx.NewCase("create maps capacity constraint", input{method: http.MethodPost, path: "/api/events/1/ticket-types", body: `{"name":"General","capacity":1}`, store: fakeStore{admin: true, createTicketTypeErr: errors.New("CHECK constraint failed")}}, want{status: http.StatusConflict}),
		testx.NewCase("update maps missing ticket type", input{method: http.MethodPut, path: "/api/ticket-types/1", body: `{"name":"General","capacity":1}`, store: fakeStore{admin: true, updateTicketTypeErr: ticket.ErrNotFound}}, want{status: http.StatusNotFound}),
		testx.NewCase("update reports database failure", input{method: http.MethodPut, path: "/api/ticket-types/1", body: `{"name":"General","capacity":1}`, store: fakeStore{admin: true, updateTicketTypeErr: errors.New("db")}}, want{status: http.StatusInternalServerError}),
	).Run(func(t *testing.T, in input, want want) {
		req := httptest.NewRequest(in.method, in.path, strings.NewReader(in.body))
		req.Header.Set("X-Test-Authenticated-User", "user_admin")
		w := httptest.NewRecorder()
		testAdminMux(&in.store).ServeHTTP(w, req)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
}

func TestRegistrationListDatabaseError(t *testing.T) {
	store := &fakeStore{registrationsErr: errors.New("db")}
	req := httptest.NewRequest(http.MethodGet, "/api/registrations", nil)
	req.Header.Set("X-Test-Authenticated-User", "user_1")
	w := httptest.NewRecorder()
	testPublicMux(store).ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestHealthEndpoint(t *testing.T) {
	w := httptest.NewRecorder()
	testPublicMux(&fakeStore{}).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/health", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"ok"`) {
		t.Fatalf("response = %d %s", w.Code, w.Body.String())
	}
}

func TestCancelRegistrationDatabaseError(t *testing.T) {
	store := &fakeStore{cancelErr: errors.New("db")}
	req := httptest.NewRequest(http.MethodPost, "/api/registrations/cancel", strings.NewReader(`{"ticket_type_id":1}`))
	req.Header.Set("X-Test-Authenticated-User", "user_1")
	w := httptest.NewRecorder()
	testPublicMux(store).ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestRegisterProfileRequirements(t *testing.T) {
	type input struct{ profile ticket.ParticipantProfile }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("profile store unavailable", input{profile: nil}, want{status: http.StatusBadGateway}),
		testx.NewCase("profile lookup fails", input{profile: fakeParticipantProfile{err: errors.New("Clerk unavailable")}}, want{status: http.StatusBadGateway}),
		testx.NewCase("participant name missing", input{profile: fakeParticipantProfile{}}, want{status: http.StatusForbidden}),
	).Run(func(t *testing.T, in input, want want) {
		store := &fakeStore{}
		h := ticket.NewHandler(store, store, testAuthenticatedUserID, in.profile)
		req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(`{"ticket_type_id":1}`))
		req.Header.Set("X-Test-Authenticated-User", "user_1")
		w := httptest.NewRecorder()
		h.Register(w, req)
		if w.Code != want.status || store.registeredUser != "" {
			t.Fatalf("status = %d, registered user = %q; want %d and no registration", w.Code, store.registeredUser, want.status)
		}
	})
}

func TestRegistrationInputValidation(t *testing.T) {
	type input struct{ body string }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("malformed JSON", input{body: `{`}, want{status: http.StatusBadRequest}),
		testx.NewCase("zero ticket id", input{body: `{"ticket_type_id":0}`}, want{status: http.StatusBadRequest}),
		testx.NewCase("negative ticket id", input{body: `{"ticket_type_id":-1}`}, want{status: http.StatusBadRequest}),
	).Run(func(t *testing.T, in input, want want) {
		store := &fakeStore{}
		h := ticket.NewHandler(store, store, testAuthenticatedUserID, fakeParticipantProfile{name: "Ada"})
		req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(in.body))
		w := httptest.NewRecorder()
		h.Register(w, req)
		if w.Code != want.status || store.registeredUser != "" {
			t.Fatalf("status = %d, registered user = %q; want status %d", w.Code, store.registeredUser, want.status)
		}
	})
}

func TestAdminEventAndTicketManagementBehavior(t *testing.T) {
	type input struct{ method, path, body string }
	type want struct{ status int }
	testx.NewTable[input, want](t,
		testx.NewCase("create event", input{http.MethodPost, "/api/events", `{"name":" GoConf "}`}, want{http.StatusCreated}),
		testx.NewCase("draft may omit event name", input{http.MethodPost, "/api/events", `{}`}, want{http.StatusCreated}),
		testx.NewCase("published event requires details", input{http.MethodPost, "/api/events", `{"publication_status":"published"}`}, want{http.StatusBadRequest}),
		testx.NewCase("reject equal event datetime boundary", input{http.MethodPost, "/api/events", `{"name":"Event","description":"Details","starts_at":"2027-01-01T00:00:00.000Z","ends_at":"2027-01-01T00:00:00Z","publication_status":"published"}`}, want{http.StatusBadRequest}),
		testx.NewCase("edit event", input{http.MethodPut, "/api/events/1", `{"name":"GoConf 2027"}`}, want{http.StatusOK}),
		testx.NewCase("create ticket type", input{http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":20}`}, want{http.StatusCreated}),
		testx.NewCase("reject negative capacity", input{http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":-1}`}, want{http.StatusBadRequest}),
		testx.NewCase("reject equal registration datetime boundary", input{http.MethodPost, "/api/events/1/ticket-types", `{"name":"General","capacity":1,"registration_starts_at":"2027-01-01T00:00:00.000Z","registration_ends_at":"2027-01-01T00:00:00Z"}`}, want{http.StatusBadRequest}),
		testx.NewCase("edit ticket type", input{http.MethodPut, "/api/ticket-types/1", `{"name":"General","capacity":20}`}, want{http.StatusOK}),
	).Run(func(t *testing.T, in input, want want) {
		store := &fakeStore{admin: true}
		req := httptest.NewRequest(in.method, in.path, strings.NewReader(in.body))
		req.Header.Set("X-Test-Authenticated-User", "user_admin")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, req)
		if w.Code != want.status {
			t.Fatalf("status = %d, want %d: %s", w.Code, want.status, w.Body.String())
		}
	})
	t.Run("management requires administrator", func(t *testing.T) {
		store := &fakeStore{}
		req := httptest.NewRequest(http.MethodPost, "/api/events", strings.NewReader(`{"name":"GoConf"}`))
		req.Header.Set("X-Test-Authenticated-User", "user_regular")
		w := httptest.NewRecorder()
		testAdminMux(store).ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status=%d, want 403", w.Code)
		}
	})
}

func testPublicMux(store *fakeStore) *http.ServeMux {
	h := ticket.NewHandler(store, store, testAuthenticatedUserID, fakeParticipantProfile{name: "Attendee"})
	events := event.NewHandler(store, store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.Handle("GET /api/auth/config", h.AuthConfig("pk_test_example"))
	mux.HandleFunc("GET /api/events", events.Events)
	mux.HandleFunc("GET /api/events/{id}", events.Event)
	protected := auth.Authenticated(testAuthenticatedUserID)
	mux.Handle("GET /api/registrations", protected(http.HandlerFunc(h.Registrations)))
	mux.Handle("POST /api/registrations", protected(http.HandlerFunc(h.Register)))
	mux.Handle("POST /api/registrations/cancel", protected(http.HandlerFunc(h.CancelRegistration)))
	return mux
}

func testAdminMux(store *fakeStore) *http.ServeMux {
	h := ticket.NewHandler(store, store, testAuthenticatedUserID, nil)
	events := event.NewHandler(store, store)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.Handle("GET /api/auth/config", h.AuthConfig("pk_test_example"))
	adminOnly := auth.AdminOnly(testAuthenticatedUserID, store.IsAdmin)
	mux.Handle("GET /api/admin/events", adminOnly(http.HandlerFunc(events.AdminEvents)))
	mux.Handle("GET /api/admin/events/{id}", adminOnly(http.HandlerFunc(events.AdminEvent)))
	mux.Handle("GET /api/admin/events/{id}/registrations", adminOnly(http.HandlerFunc(h.AdminRegistrations)))
	mux.Handle("GET /api/ticket-types/{id}/status", adminOnly(http.HandlerFunc(h.TicketTypeStatus)))
	mux.Handle("POST /api/events", adminOnly(http.HandlerFunc(events.CreateEvent)))
	mux.Handle("PUT /api/events/{id}", adminOnly(http.HandlerFunc(events.UpdateEvent)))
	mux.Handle("POST /api/events/{id}/ticket-types", adminOnly(http.HandlerFunc(h.CreateTicketType)))
	mux.Handle("PUT /api/ticket-types/{id}", adminOnly(http.HandlerFunc(h.UpdateTicketType)))
	return mux
}

func testAuthenticatedUserID(r *http.Request) string {
	return r.Header.Get("X-Test-Authenticated-User")
}
