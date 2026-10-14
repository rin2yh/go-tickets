package duplicate

import "testing"

const input = 3
const output = 4

func TestAddOne(t *testing.T) {
	got := add(1)
	want := 2
	if got != want {
		t.Fatalf("add(1) = %d, want %d", got, want)
	}
}

func TestAddTwo(t *testing.T) { // want "テーブル駆動テストに統合"
	actual := add(input)
	expected := output
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

func add(n int) int               { return n + 1 }
func multiply(n int) int          { return n * n }
func assertValue(*testing.T, int) {}
