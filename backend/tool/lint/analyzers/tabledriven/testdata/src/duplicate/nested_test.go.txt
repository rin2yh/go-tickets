package duplicate

import "testing"

func TestNestedSubtests(t *testing.T) {
	t.Run("left", func(t *testing.T) {
		t.Run("one", func(t *testing.T) {
			if got := add(1); got != 2 {
				t.Fatal(got)
			}
		})
		t.Run("two", func(t *testing.T) {
			if got := add(2); got != 3 {
				t.Fatal(got)
			}
		})
	})
	t.Run("right", func(t *testing.T) {
		ready := true
		_ = ready
		t.Run("three", func(t *testing.T) {
			if got := add(3); got != 4 {
				t.Fatal(got)
			}
		})
		t.Run("four", func(t *testing.T) {
			if got := add(4); got != 5 {
				t.Fatal(got)
			}
		})
	})
}
