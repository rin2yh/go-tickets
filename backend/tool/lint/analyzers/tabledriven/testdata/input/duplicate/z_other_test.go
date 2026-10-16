package duplicate

import "testing"

func TestCrossFile(t *testing.T) {
	value := 8
	expect := 9
	result := add(value)
	if result != expect {
		t.Fatalf("got an unexpected value: %v, want %v", result, expect)
	}
}
