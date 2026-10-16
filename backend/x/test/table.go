// Package testx provides small helpers for table-driven tests.
package testx

import "testing"

// Case holds the input and expected result for one table-driven test case.
type Case[Input, Want any] struct {
	Name  string
	Input Input
	Want  Want
}

// Table stores the cases to execute as subtests.
type Table[Input, Want any] struct {
	t     *testing.T
	cases []Case[Input, Want]
}

// NewCase creates a named test case from its input and expected result.
func NewCase[Input, Want any](name string, input Input, want Want) Case[Input, Want] {
	return Case[Input, Want]{Name: name, Input: input, Want: want}
}

// NewTable creates a table containing the provided cases.
func NewTable[Input, Want any](t *testing.T, cases ...Case[Input, Want]) Table[Input, Want] {
	t.Helper()
	return Table[Input, Want]{t: t, cases: cases}
}

// Run executes each case as a named subtest.
func (table Table[Input, Want]) Run(run func(*testing.T, Input, Want)) {
	t := table.t
	t.Helper()
	for _, tc := range table.cases {
		t.Run(tc.Name, func(t *testing.T) {
			run(t, tc.Input, tc.Want)
		})
	}
}
