package tabledrivencomplexity

import "github.com/rin2yh/go-tickets/x/testx"

type testCase struct {
	Rows             []inputRow
	Branches         []branch
	NestedConditions []string
	NestedBody       string
	Prelude          string
	SourceFile       string
	Source           string
	Params           string
	TestXRows        []testXRow
}

type inputRow struct {
	Name       string
	Input      int
	Want       int
	WantBool   bool
	WantDouble bool
	Enabled    bool
	WantErr    bool
}

type branch struct {
	Condition string
	Count     int
}

type testXRow struct {
	Name string
	Args []string
}

func standardCases() []testx.Case[testCase, struct{}] {
	return []testx.Case[testCase, struct{}]{
		testx.NewCase("standard_nested", testCase{
			Rows:             []inputRow{{Name: "one", Input: 1, Want: 1, WantDouble: true}},
			NestedConditions: []string{"tc.input > 0", "tc.wantDouble"},
			NestedBody:       "t.Log(tc.want)",
		}, struct{}{}),
		testx.NewCase("standard_independent", testCase{
			Rows: []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{
				{Condition: "tc.input == 1", Count: 1},
				{Condition: "tc.input == 2", Count: 1},
			},
		}, struct{}{}),
		testx.NewCase("three_branch_boundary", testCase{
			Rows:     []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{{Condition: "tc.input == 1", Count: 3}},
		}, struct{}{}),
		testx.NewCase("four_branches", testCase{
			Rows:     []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{{Condition: "tc.input == 1", Count: 4}},
		}, struct{}{}),
		testx.NewCase("switch_cases", testCase{
			Rows:       []inputRow{{Name: "one", Input: 1}},
			SourceFile: "switch_cases.go.txt",
		}, struct{}{}),
		testx.NewCase("natural_error_branch", testCase{
			Rows:       []inputRow{{Name: "success"}, {Name: "failure", WantErr: true}},
			SourceFile: "natural_error_branch.go.txt",
		}, struct{}{}),
		testx.NewCase("case_name_only", testCase{
			Rows: []inputRow{{Name: "first", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.name == "first"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}, struct{}{}),
		testx.NewCase("case_dependency_before_name", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.enabled && tc.name == "special"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}, struct{}{}),
		testx.NewCase("case_name_before_dependency", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.name == "special" && tc.enabled`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}, struct{}{}),
		testx.NewCase("nested_case_name_and_value", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true, WantBool: true}},
			Branches: []branch{
				{Condition: `(tc.enabled || tc.name == "special") && tc.wantBool`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}, struct{}{}),
		testx.NewCase("compound_case_name_only", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `(tc.name == "special" || tc.name == "other") && tc.name != "none"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}, struct{}{}),
		testx.NewCase("standard_alias", testCase{
			Rows:    []inputRow{{Name: "one", Input: 1}},
			Prelude: "isOne := tc.input == 1",
			Branches: []branch{
				{Condition: "isOne", Count: 1},
				{Condition: "tc.input == 2", Count: 1},
				{Condition: "tc.input == 3", Count: 1},
				{Condition: "tc.input == 4", Count: 1},
			},
		}, struct{}{}),
		testx.NewCase("dependency_cleared_by_constant", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_cleared_by_constant.go.txt",
		}, struct{}{}),
		testx.NewCase("dependency_added_by_reassignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_added_by_reassignment.go.txt",
		}, struct{}{}),
		testx.NewCase("shadowed_case_variable", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "shadowed_case_variable.go.txt",
		}, struct{}{}),
		testx.NewCase("conditional_reassignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "conditional_reassignment.go.txt",
		}, struct{}{}),
		testx.NewCase("conditional_reset", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "conditional_reset.go.txt",
		}, struct{}{}),
		testx.NewCase("multiple_assignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "multiple_assignment.go.txt",
		}, struct{}{}),
		testx.NewCase("dependency_survives_assignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_survives_assignment.go.txt",
		}, struct{}{}),
		testx.NewCase("unrelated_local_conditions", testCase{
			Rows:       []inputRow{{Name: "one"}},
			SourceFile: "unrelated_local_conditions.go.txt",
		}, struct{}{}),
		testx.NewCase("unrelated_loop_conditions", testCase{
			Rows:       []inputRow{{Name: "one"}},
			SourceFile: "unrelated_loop_conditions.go.txt",
		}, struct{}{}),
	}
}

func testXCases() []testx.Case[testCase, struct{}] {
	return []testx.Case[testCase, struct{}]{
		testx.NewCase("testx_nested", testCase{
			Params:           "t *testing.T, input int, want bool",
			TestXRows:        []testXRow{{Name: "one", Args: []string{"1", "true"}}},
			NestedConditions: []string{"input > 0", "want"},
			NestedBody:       `t.Log("positive and wanted")`,
		}, struct{}{}),
		testx.NewCase("testx_independent_boundary", testCase{
			Params:    "t *testing.T, input int, want int",
			TestXRows: []testXRow{{Name: "one", Args: []string{"1", "2"}}},
			Branches: []branch{
				{Condition: "input == 1", Count: 1},
				{Condition: "want == 2", Count: 1},
			},
		}, struct{}{}),
		testx.NewCase("testx_unnamed_testing_t", testCase{
			Params:           "_ *testing.T, input int, want bool",
			TestXRows:        []testXRow{{Name: "one", Args: []string{"1", "true"}}},
			NestedConditions: []string{"input > 0", "want"},
			NestedBody:       "return",
		}, struct{}{}),
	}
}
