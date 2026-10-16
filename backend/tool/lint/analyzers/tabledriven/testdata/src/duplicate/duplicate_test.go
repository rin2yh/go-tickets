package duplicate

import "testing"

var packageInputOne, packageInputTwo int

const packageWantOne = 2
const packageWantTwo = 3

func TestAddOne(t *testing.T) {
	// This note does not change the test structure.
	got := add(1)
	want := 2
	if got != want {
		t.Fatalf("add(1) = %d, want %d", got, want)
	}
}

func TestAddTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	// The wording can differ while the test structure stays the same.
	actual := add(3)
	expected := 4
	if actual != expected {
		t.Fatalf("add(3) = %d, want %d", actual, expected)
	}
}

func TestDifferentBranch(t *testing.T) {
	got := add(5)
	if got < 0 {
		t.Fatalf("add(5) = %d, want a non-negative value", got)
	}
}

func TestDifferentFailureMethod(t *testing.T) {
	got := add(7)
	want := 8
	if got != want {
		t.Errorf("add(7) = %d, want %d", got, want)
	}
}

func TestShortOne(t *testing.T) {
	assertValue(t, 1)
}

func TestShortTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	assertValue(t, 2)
}

func TestSubtests(t *testing.T) {
	t.Run("one", func(t *testing.T) {
		got := add(10)
		want := 11
		if got != want {
			t.Fatalf("add(10) = %d, want %d", got, want)
		}
	})
	t.Run("two", func(t *testing.T) { // want "テーブル駆動テストに統合"
		actual := add(20)
		expected := 21
		if actual != expected {
			t.Fatalf("add(20) = %d, want %d", actual, expected)
		}
	})
	t.Run("different operation", func(t *testing.T) {
		got := multiply(3)
		want := 9
		if got != want {
			t.Fatalf("multiply(3) = %d, want %d", got, want)
		}
	})
}

func TestDifferentParallelBehavior(t *testing.T) {
	t.Run("serial", func(t *testing.T) {
		if got := add(1); got != 2 {
			t.Fatalf("add(1) = %d, want 2", got)
		}
	})
	t.Run("parallel", func(t *testing.T) {
		t.Parallel()
		if got := add(2); got != 3 {
			t.Fatalf("add(2) = %d, want 3", got)
		}
	})
}

func TestExistingTable(t *testing.T) {
	for _, test := range []struct {
		name string
		in   int
		want int
	}{
		{name: "one", in: 1, want: 2},
		{name: "two", in: 2, want: 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := add(test.in); got != test.want {
				t.Fatalf("add(%d) = %d, want %d", test.in, got, test.want)
			}
		})
	}
}

func TestLocalValueNamesOne(t *testing.T) {
	input := 1
	expected := 2
	got := identity(input)
	if !sameValue(any(got), any(expected)) {
		t.Fatalf("identity(%d) = %d, want %d", input, got, expected)
	}
}

func TestLocalValueNamesTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	value := 3
	want := 4
	actual := identity(value)
	if !sameValue(any(actual), any(want)) {
		t.Fatalf("identity(%d) = %d, want %d", value, actual, want)
	}
}

func TestShadowedValuesOne(t *testing.T) {
	value := identity(1)
	{
		value := identity(2)
		if !sameValue(any(value), any(2)) {
			t.Fatal(value)
		}
	}
	if !sameValue(any(value), any(1)) {
		t.Fatal(value)
	}
}

func TestShadowedValuesTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	value := identity(3)
	{
		value := identity(4)
		if !sameValue(any(value), any(4)) {
			t.Fatal(value)
		}
	}
	if !sameValue(any(value), any(3)) {
		t.Fatal(value)
	}
}

func TestPackageStateOne(t *testing.T) {
	got := identity(packageInputOne)
	if !sameValue(any(got), any(packageWantOne)) {
		t.Fatal(got)
	}
}

func TestPackageStateTwo(t *testing.T) {
	got := identity(packageInputTwo)
	if !sameValue(any(got), any(packageWantTwo)) {
		t.Fatal(got)
	}
}

func TestDifferentValueTypesInt(t *testing.T) {
	input := 1
	want := 2
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatal(got)
	}
}

func TestDifferentValueTypesString(t *testing.T) {
	input := "one"
	want := "two"
	got := identity(input)
	if !sameValue(any(got), any(want)) {
		t.Fatal(got)
	}
}

func TestCleanupDifferences(t *testing.T) {
	t.Run("no cleanup", func(t *testing.T) {
		if got := add(1); got != 2 {
			t.Fatal(got)
		}
	})
	t.Run("empty cleanup", func(t *testing.T) {
		t.Cleanup(func() {})
		if got := add(2); got != 3 {
			t.Fatal(got)
		}
	})
	t.Run("different cleanup", func(t *testing.T) {
		t.Cleanup(func() { t.Log("finished") })
		if got := add(3); got != 4 {
			t.Fatal(got)
		}
	})
}

func TestNestedSubtests(t *testing.T) {
	t.Run("left", func(t *testing.T) {
		t.Run("one", func(t *testing.T) {
			if got := add(1); got != 2 {
				t.Fatal(got)
			}
		})
		t.Run("two", func(t *testing.T) { // want "テーブル駆動テストに統合"
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
		t.Run("four", func(t *testing.T) { // want "テーブル駆動テストに統合"
			if got := add(4); got != 5 {
				t.Fatal(got)
			}
		})
	})
}

func TestDifferentAssertions(t *testing.T) {
	t.Run("non-negative", func(t *testing.T) {
		if got := add(1); got < 0 {
			t.Fatal(got)
		}
	})
	t.Run("exact value", func(t *testing.T) {
		if got := add(2); got != 3 {
			t.Fatal(got)
		}
	})
}

func Test_ExampleOne(t *testing.T) {
	assertOther(t, 1)
}

func Test_ExampleTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	assertOther(t, 2)
}

//nolint:govet // The malformed name verifies that the analyzer ignores invalid test names.
func Testexample(t *testing.T) {
	assertOther(t, 3)
}

func add(n int) int               { return n + 1 }
func multiply(n int) int          { return n * n }
func identity[T any](value T) T   { return value }
func sameValue(any, any) bool     { return true }
func assertValue(*testing.T, int) {}
func assertOther(*testing.T, int) {}
