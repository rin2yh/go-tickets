package complexity

import (
	"testing"

	"github.com/rin2yh/go-tickets/x/testx"
)

func TestStandardNestedCases(t *testing.T) {
	for _, tc := range []struct {
		name       string
		input      int
		want       int
		wantDouble bool
	}{
		{name: "one", input: 1, want: 1},
	} {
		t.Run(tc.name, func(t *testing.T) { // want "分岐数: 2、ネスト深度: 2"
			if tc.input > 0 {
				if tc.wantDouble {
					t.Fatalf("unexpected doubled result: %d", tc.want)
				}
			}
		})
	}
}

func TestStandardIndependentCases(t *testing.T) {
	for _, tc := range []struct {
		name  string
		input int
	}{
		{name: "one", input: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.input == 1 {
				t.Log("first")
			}
			if tc.input == 2 {
				t.Log("second")
			}
		})
	}
}

func TestStandardThreeBranchBoundary(t *testing.T) {
	for _, tc := range []struct {
		name  string
		input int
	}{
		{name: "one", input: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.input == 1 {
				t.Log("first")
			}
			if tc.input == 2 {
				t.Log("second")
			}
			if tc.input == 3 {
				t.Log("third")
			}
		})
	}
}

func TestStandardFourBranches(t *testing.T) {
	for _, tc := range []struct {
		name  string
		input int
	}{
		{name: "one", input: 1},
	} {
		t.Run(tc.name, func(t *testing.T) { // want "分岐数: 4、ネスト深度: 1"
			if tc.input == 1 {
				t.Log("first")
			}
			if tc.input == 2 {
				t.Log("second")
			}
			if tc.input == 3 {
				t.Log("third")
			}
			if tc.input == 4 {
				t.Log("fourth")
			}
		})
	}
}

func TestSwitchCases(t *testing.T) {
	for _, tc := range []struct {
		name  string
		input int
	}{
		{name: "one", input: 1},
	} {
		t.Run(tc.name, func(t *testing.T) { // want "分岐数: 4、ネスト深度: 1"
			//nolint:staticcheck // The tagless switch verifies case-expression dependency tracking.
			switch {
			case tc.input == 1:
				t.Log("first")
			case tc.input == 2:
				t.Log("second")
			case tc.input == 3:
				t.Log("third")
			case tc.input == 4:
				t.Log("fourth")
			default:
				t.Log("other")
			}
		})
	}
}

func TestStandardNaturalErrorBranch(t *testing.T) {
	for _, tc := range []struct {
		name    string
		wantErr bool
	}{
		{name: "success"},
		{name: "failure", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.wantErr {
				if err := run(); err == nil {
					t.Fatal("expected an error")
				}
				return
			}
			if err := run(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestStandardCaseNameOnly(t *testing.T) {
	for _, tc := range []struct {
		name string
	}{
		{name: "first"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.name == "first" {
				t.Log("named case")
			}
		})
	}
}

func TestStandardAlias(t *testing.T) {
	for _, tc := range []struct {
		name  string
		input int
	}{
		{name: "one", input: 1},
	} {
		t.Run(tc.name, func(t *testing.T) { // want "分岐数: 4、ネスト深度: 1"
			isOne := tc.input == 1
			if isOne {
				t.Log("first")
			}
			if tc.input == 2 {
				t.Log("second")
			}
			if tc.input == 3 {
				t.Log("third")
			}
			if tc.input == 4 {
				t.Log("fourth")
			}
		})
	}
}

func TestUnrelatedLocalConditions(t *testing.T) {
	for _, tc := range []struct {
		name string
	}{
		{name: "one"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			first, second, third := true, false, true
			if first {
				t.Log("first")
			}
			if second {
				t.Log("second")
			}
			if third {
				t.Log("third")
			}
		})
	}
}

func TestTestxNestedCases(t *testing.T) {
	testx.NewTable(t, // want "分岐数: 2、ネスト深度: 2"
		testx.NewCase("one", 1, true),
	).Run(func(t *testing.T, input int, want bool) {
		if input > 0 {
			if want {
				t.Log("positive and wanted")
			}
		}
	})
}

func TestTestxIndependentBoundary(t *testing.T) {
	testx.NewTable(t,
		testx.NewCase("one", 1, 2),
	).Run(func(t *testing.T, input, want int) {
		if input == 1 {
			t.Log("first")
		}
		if want == 2 {
			t.Log("second")
		}
	})
}

func TestTestxUnnamedTestingT(t *testing.T) {
	testx.NewTable(t, // want "分岐数: 2、ネスト深度: 2"
		testx.NewCase("one", 1, true),
	).Run(func(_ *testing.T, input int, want bool) {
		if input > 0 {
			if want {
				return
			}
		}
	})
}

func TestUnrelatedLoopConditions(t *testing.T) {
	for _, tc := range []struct {
		name string
	}{
		{name: "one"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for i := 0; i < 3; i++ {
				t.Log(i)
			}
		})
	}
}

func run() error { return nil }
