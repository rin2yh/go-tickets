// Package testx provides small helpers for table-driven tests.
package testx

import "testing"

// Case holds the input and expected result for one table-driven test case.
type Case[Input, Want any] struct {
	Name  string
	Input Input
	Want  Want
}

// NewCase creates a named test case from its input and expected result.
func NewCase[Input, Want any](name string, input Input, want Want) Case[Input, Want] {
	return Case[Input, Want]{Name: name, Input: input, Want: want}
}

// Run executes each case as a named subtest.
func Run[Input, Want any](t *testing.T, run func(*testing.T, Input, Want), cases ...Case[Input, Want]) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			run(t, tc.Input, tc.Want)
		})
	}
}
