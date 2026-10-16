package duplicate

import "testing"

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
