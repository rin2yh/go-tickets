package httpx

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		value  any
		want   string
	}{
		{name: "object", status: 201, value: map[string]int{"id": 7}, want: `{"id":7}` + "\n"},
		{name: "empty list", status: 200, value: []string{}, want: "[]\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			WriteJSON(w, tc.status, tc.value)
			if w.Code != tc.status || w.Header().Get("Content-Type") != "application/json" || w.Body.String() != tc.want {
				t.Fatalf("response = %d %q %q", w.Code, w.Header().Get("Content-Type"), w.Body.String())
			}
			var decoded any
			if err := json.Unmarshal(w.Body.Bytes(), &decoded); err != nil {
				t.Fatalf("invalid JSON: %v", err)
			}
		})
	}
}

func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()
	WriteError(w, 409, "conflict")
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if w.Code != 409 || body["error"] != "conflict" {
		t.Fatalf("response = %d %#v", w.Code, body)
	}
}
