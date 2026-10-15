package tabledrivencomplexity

import (
	"bytes"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"text/template"

	"github.com/rin2yh/go-tickets/x/testx"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/packages"
)

var updateGolden = flag.Bool("update", false, "update table-driven-complexity golden files")

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

type generatedCase struct {
	name     string
	filename string
	source   []byte
}

func newAnalyzerCase(name string, input testCase) testx.Case[testCase, string] {
	return testx.NewCase(name, input, name)
}

func TestAnalyzer(t *testing.T) {
	standardCases := []testx.Case[testCase, string]{
		newAnalyzerCase("standard_nested", testCase{
			Rows:             []inputRow{{Name: "one", Input: 1, Want: 1, WantDouble: true}},
			NestedConditions: []string{"tc.input > 0", "tc.wantDouble"},
			NestedBody:       "t.Log(tc.want)",
		}),
		newAnalyzerCase("standard_independent", testCase{
			Rows: []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{
				{Condition: "tc.input == 1", Count: 1},
				{Condition: "tc.input == 2", Count: 1},
			},
		}),
		newAnalyzerCase("three_branch_boundary", testCase{
			Rows:     []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{{Condition: "tc.input == 1", Count: 3}},
		}),
		newAnalyzerCase("four_branches", testCase{
			Rows:     []inputRow{{Name: "one", Input: 1}},
			Branches: []branch{{Condition: "tc.input == 1", Count: 4}},
		}),
		newAnalyzerCase("switch_cases", testCase{
			Rows:       []inputRow{{Name: "one", Input: 1}},
			SourceFile: "switch_cases.go.txt",
		}),
		newAnalyzerCase("natural_error_branch", testCase{
			Rows:       []inputRow{{Name: "success"}, {Name: "failure", WantErr: true}},
			SourceFile: "natural_error_branch.go.txt",
		}),
		newAnalyzerCase("case_name_only", testCase{
			Rows: []inputRow{{Name: "first", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.name == "first"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}),
		newAnalyzerCase("case_dependency_before_name", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.enabled && tc.name == "special"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}),
		newAnalyzerCase("case_name_before_dependency", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `tc.name == "special" && tc.enabled`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}),
		newAnalyzerCase("nested_case_name_and_value", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true, WantBool: true}},
			Branches: []branch{
				{Condition: `(tc.enabled || tc.name == "special") && tc.wantBool`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}),
		newAnalyzerCase("compound_case_name_only", testCase{
			Rows: []inputRow{{Name: "special", Enabled: true}},
			Branches: []branch{
				{Condition: `(tc.name == "special" || tc.name == "other") && tc.name != "none"`, Count: 1},
				{Condition: "tc.enabled", Count: 3},
			},
		}),
		newAnalyzerCase("standard_alias", testCase{
			Rows:    []inputRow{{Name: "one", Input: 1}},
			Prelude: "isOne := tc.input == 1",
			Branches: []branch{
				{Condition: "isOne", Count: 1},
				{Condition: "tc.input == 2", Count: 1},
				{Condition: "tc.input == 3", Count: 1},
				{Condition: "tc.input == 4", Count: 1},
			},
		}),
		newAnalyzerCase("dependency_cleared_by_constant", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_cleared_by_constant.go.txt",
		}),
		newAnalyzerCase("dependency_added_by_reassignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_added_by_reassignment.go.txt",
		}),
		newAnalyzerCase("shadowed_case_variable", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "shadowed_case_variable.go.txt",
		}),
		newAnalyzerCase("conditional_reassignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "conditional_reassignment.go.txt",
		}),
		newAnalyzerCase("conditional_reset", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "conditional_reset.go.txt",
		}),
		newAnalyzerCase("multiple_assignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "multiple_assignment.go.txt",
		}),
		newAnalyzerCase("dependency_survives_assignment", testCase{
			Rows:       []inputRow{{Name: "one", Enabled: true}},
			SourceFile: "dependency_survives_assignment.go.txt",
		}),
		newAnalyzerCase("unrelated_local_conditions", testCase{
			Rows:       []inputRow{{Name: "one"}},
			SourceFile: "unrelated_local_conditions.go.txt",
		}),
		newAnalyzerCase("unrelated_loop_conditions", testCase{
			Rows:       []inputRow{{Name: "one"}},
			SourceFile: "unrelated_loop_conditions.go.txt",
		}),
	}
	testXCases := []testx.Case[testCase, string]{
		newAnalyzerCase("testx_nested", testCase{
			Params:           "t *testing.T, input int, want bool",
			TestXRows:        []testXRow{{Name: "one", Args: []string{"1", "true"}}},
			NestedConditions: []string{"input > 0", "want"},
			NestedBody:       `t.Log("positive and wanted")`,
		}),
		newAnalyzerCase("testx_independent_boundary", testCase{
			Params:    "t *testing.T, input int, want int",
			TestXRows: []testXRow{{Name: "one", Args: []string{"1", "2"}}},
			Branches: []branch{
				{Condition: "input == 1", Count: 1},
				{Condition: "want == 2", Count: 1},
			},
		}),
		newAnalyzerCase("testx_unnamed_testing_t", testCase{
			Params:           "_ *testing.T, input int, want bool",
			TestXRows:        []testXRow{{Name: "one", Args: []string{"1", "true"}}},
			NestedConditions: []string{"input > 0", "want"},
			NestedBody:       "return",
		}),
	}

	templates := loadCaseTemplates(t)
	cases := append(
		generateCases(t, templates, "standard", standardCases),
		generateCases(t, templates, "testx", testXCases)...,
	)
	packagesByCase := loadGeneratedPackages(t, cases)

	testx.NewTable(t, standardCases...).Run(func(t *testing.T, _ testCase, goldenName string) {
		runAnalyzerCase(t, goldenName, packagesByCase[goldenName])
	})
	testx.NewTable(t, testXCases...).Run(func(t *testing.T, _ testCase, goldenName string) {
		runAnalyzerCase(t, goldenName, packagesByCase[goldenName])
	})
}

func generateCases(t *testing.T, templates *template.Template, templateName string, cases []testx.Case[testCase, string]) []generatedCase {
	t.Helper()
	generated := make([]generatedCase, 0, len(cases))
	for _, tc := range cases {
		if tc.Name == "" || tc.Name == "." || tc.Name == ".." ||
			strings.ContainsAny(tc.Name, `/\\`) || filepath.Base(tc.Name) != tc.Name {
			t.Fatalf("invalid analyzer case name %q", tc.Name)
		}
		filename := tc.Name + "_test.go"
		generated = append(generated, generatedCase{
			name: tc.Name, filename: filename,
			source: generateGoSource(t, templates, templateName, filename, tc.Input),
		})
	}
	return generated
}

func runAnalyzerCase(t *testing.T, caseName string, pkg *packages.Package) {
	t.Helper()
	if pkg == nil {
		t.Fatalf("no generated package for case %q", caseName)
	}
	diagnostics := runAnalyzer(t, pkg)
	compareGolden(t, caseName, normalizeDiagnostics(t, pkg, caseName+"_test.go", diagnostics))
}

func loadCaseTemplates(t *testing.T) *template.Template {
	t.Helper()
	parsed, err := template.New("case.go.tmpl").Funcs(template.FuncMap{
		"repeat": func(count int) []int { return make([]int, count) },
	}).ParseFiles("testdata/case.go.tmpl")
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func generateGoSource(t *testing.T, templates *template.Template, templateName, filename string, tc testCase) []byte {
	t.Helper()
	if tc.SourceFile != "" {
		if filepath.Base(tc.SourceFile) != tc.SourceFile {
			t.Fatalf("source must be a file name: %q", tc.SourceFile)
		}
		source, err := os.ReadFile(filepath.Join("testdata", "source", tc.SourceFile))
		if err != nil {
			t.Fatalf("read source for %s: %v", filename, err)
		}
		tc.Source = string(source)
	}

	var rendered bytes.Buffer
	if err := templates.ExecuteTemplate(&rendered, templateName, tc); err != nil {
		t.Fatalf("render %s: %v", filename, err)
	}
	formatted, err := format.Source(rendered.Bytes())
	if err != nil {
		t.Fatalf("format %s: %v\n%s", filename, err, rendered.String())
	}
	return formatted
}

func loadGeneratedPackages(t *testing.T, cases []generatedCase) map[string]*packages.Package {
	t.Helper()
	inputDir, err := os.MkdirTemp(".", "analyzer-input-")
	if err != nil {
		t.Fatal(err)
	}
	inputDir, err = filepath.Abs(inputDir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(inputDir); err != nil {
			t.Errorf("remove generated input: %v", err)
		}
	})

	overlay := make(map[string][]byte, len(cases))
	caseFiles := make(map[string]string, len(cases))
	for _, generated := range cases {
		if _, duplicate := caseFiles[generated.filename]; duplicate {
			t.Fatalf("duplicate generated test filename %q", generated.filename)
		}
		caseDir := filepath.Join(inputDir, generated.name)
		if err := os.MkdirAll(caseDir, 0o755); err != nil {
			t.Fatal(err)
		}
		placeholderPath := filepath.Join(caseDir, generated.filename)
		if err := os.WriteFile(placeholderPath, []byte("package complexity\n"), 0o644); err != nil {
			t.Fatalf("create overlay placeholder: %v", err)
		}
		if err := os.WriteFile(filepath.Join(caseDir, "support.go"), []byte("package complexity\n\nfunc run() error { return nil }\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		overlay[placeholderPath] = generated.source
		caseFiles[generated.filename] = generated.name
	}

	mode := packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles | packages.NeedSyntax |
		packages.NeedTypes | packages.NeedTypesInfo | packages.NeedTypesSizes
	loaded, err := packages.Load(&packages.Config{
		Mode: mode, Dir: inputDir, Tests: true, Overlay: overlay,
	}, "./...")
	if err != nil {
		t.Fatalf("load generated test packages: %v", err)
	}

	packagesByCase := make(map[string]*packages.Package, len(cases))
	for _, candidate := range loaded {
		for _, file := range candidate.Syntax {
			caseName, ok := caseFiles[filepath.Base(candidate.Fset.Position(file.Pos()).Filename)]
			if !ok {
				continue
			}
			current := packagesByCase[caseName]
			if current == nil || len(candidate.Syntax) > len(current.Syntax) {
				packagesByCase[caseName] = candidate
			}
		}
	}
	for _, generated := range cases {
		pkg := packagesByCase[generated.name]
		if pkg == nil {
			t.Errorf("generated test package %q was not loaded", generated.name)
			continue
		}
		if len(pkg.Errors) != 0 {
			t.Errorf("type-check generated test package %q: %v", generated.name, pkg.Errors)
		}
	}
	return packagesByCase
}

func runAnalyzer(t *testing.T, pkg *packages.Package) []analysis.Diagnostic {
	t.Helper()
	var diagnostics []analysis.Diagnostic
	pass := &analysis.Pass{
		Analyzer: Analyzer, Fset: pkg.Fset, Files: pkg.Syntax, Pkg: pkg.Types,
		TypesInfo: pkg.TypesInfo, TypesSizes: pkg.TypesSizes, ReadFile: os.ReadFile,
		ResultOf: make(map[*analysis.Analyzer]any),
		Report:   func(diagnostic analysis.Diagnostic) { diagnostics = append(diagnostics, diagnostic) },
	}
	if _, err := Analyzer.Run(pass); err != nil {
		t.Fatalf("run analyzer: %v", err)
	}
	return diagnostics
}

func normalizeDiagnostics(t *testing.T, pkg *packages.Package, filename string, diagnostics []analysis.Diagnostic) []byte {
	t.Helper()
	sort.Slice(diagnostics, func(i, j int) bool {
		left, right := pkg.Fset.Position(diagnostics[i].Pos), pkg.Fset.Position(diagnostics[j].Pos)
		leftFile, rightFile := filepath.Base(left.Filename), filepath.Base(right.Filename)
		if leftFile != rightFile {
			return leftFile < rightFile
		}
		if left.Line != right.Line {
			return left.Line < right.Line
		}
		if left.Column != right.Column {
			return left.Column < right.Column
		}
		if diagnostics[i].Category != diagnostics[j].Category {
			return diagnostics[i].Category < diagnostics[j].Category
		}
		return diagnostics[i].Message < diagnostics[j].Message
	})

	var normalized strings.Builder
	for _, diagnostic := range diagnostics {
		position := pkg.Fset.Position(diagnostic.Pos)
		if position.Filename == "" {
			t.Errorf("diagnostic has no source position: %v", diagnostic)
			continue
		}
		diagnosticFile := filepath.Base(position.Filename)
		if diagnosticFile != filename {
			t.Errorf("diagnostic outside generated case: %s", diagnosticFile)
			continue
		}
		fmt.Fprintf(&normalized, "%s:%d:%d [%s] %s\n", diagnosticFile, position.Line, position.Column, diagnostic.Category, diagnostic.Message)
	}
	return []byte(normalized.String())
}

func compareGolden(t *testing.T, caseName string, actual []byte) {
	t.Helper()
	goldenPath := filepath.Join("testdata", "golden", caseName+".golden")
	if *updateGolden {
		if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, actual, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden: %v (run go test -update)", err)
	}
	if !bytes.Equal(actual, want) {
		t.Errorf("diagnostics differ from %s\n--- want ---\n%s\n--- got ---\n%s", goldenPath, want, actual)
	}
}
