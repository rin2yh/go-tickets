package duplicate

import "testing"

// This note does not change the test structure.
func TestAddOne(t *testing.T) {
	input := 1
	want := 2
	got := add(input)
	if got != want {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

// The wording can differ while the test structure stays the same.
func TestAddTwo(t *testing.T) {
	value := 3
	expected := 4
	actual := add(value)
	if actual != expected {
		t.Fatalf("got an unexpected value: %v, want %v", actual, expected)
	}
}

func TestShortOne(t *testing.T) {
	assertValue(t, 1)
}

func TestShortTwo(t *testing.T) {
	assertValue(t, 2)
}

func TestLocalValueNamesOne(t *testing.T) {
	input := 1
	expected := 2
	got := identity(input)
	if !sameValue(any(got), any(expected)) {
		t.Fatalf("got an unexpected value: %v, want %v", got, expected)
	}
}

func TestLocalValueNamesTwo(t *testing.T) {
	value := 3
	want := 4
	actual := identity(value)
	if !sameValue(any(actual), any(want)) {
		t.Fatalf("got an unexpected value: %v, want %v", actual, want)
	}
}

func Test_ExampleOne(t *testing.T) {
	assertOther(t, 1)
}

func Test_ExampleTwo(t *testing.T) {
	assertOther(t, 2)
}

func TestSubtests(t *testing.T) {
	t.Run("one", func(t *testing.T) {
		got := add(10)
		want := 11
		if got != want {
			t.Fatalf("got an unexpected value: %v, want %v", got, want)
		}
	})
	t.Run("two", func(t *testing.T) {
		actual := add(20)
		expected := 21
		if actual != expected {
			t.Fatalf("got an unexpected value: %v, want %v", actual, expected)
		}
	})
	t.Run("different operation", func(t *testing.T) {
		got := multiply(3)
		want := 9
		if got != want {
			t.Fatalf("got an unexpected value: %v, want %v", got, want)
		}
	})
}
