// Package testx provides small helpers for table-driven tests.
package testx

import "testing"

// Case holds the input and expected result for one table-driven test case.
type Case[Input, Want any] struct {
	Name  string
	Input Input
	Want  Want
}

// Run executes each case as a named subtest.
func Run[Input, Want any](t *testing.T, cases []Case[Input, Want], run func(*testing.T, Input, Want)) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			run(t, tc.Input, tc.Want)
		})
	}
}
