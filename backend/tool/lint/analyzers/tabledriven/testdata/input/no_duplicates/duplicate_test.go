package duplicate

import "testing"

func TestAddBaseline(t *testing.T) {
	input := 1
	want := 2
	got := add(input)
	if got != want {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

func TestDifferentBranch(t *testing.T) {
	input := 5
	got := add(input)
	if got < 0 {
		t.Fatalf("got an unexpected value: %v", got)
	}
}

func TestDifferentFailureMethod(t *testing.T) {
	input := 7
	want := 8
	got := add(input)
	if got != want {
		t.Errorf("got an unexpected value: %v, want %v", got, want)
	}
}

func TestPackageStateOne(t *testing.T) {
	input := packageInputOne
	want := packageWantOne
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

func TestPackageStateTwo(t *testing.T) {
	input := packageInputTwo
	want := packageWantTwo
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

func TestDifferentValueTypesInt(t *testing.T) {
	input := 1
	want := 2
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

func TestDifferentValueTypesString(t *testing.T) {
	input := "one"
	want := "two"
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatalf("got an unexpected value: %v, want %v", got, want)
	}
}

func Testexample(t *testing.T) {
	assertOther(t, 3)
}

func TestDifferentAssertions(t *testing.T) {
	t.Run("non-negative", func(t *testing.T) {
		got := add(1)
		if got < 0 {
			t.Fatalf("got an unexpected value: %v", got)
		}
	})
	t.Run("exact value", func(t *testing.T) {
		got := add(2)
		if got != 3 {
			t.Fatalf("got an unexpected value: %v", got)
		}
	})
}
