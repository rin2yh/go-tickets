package tabledriven

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

var updateGolden = flag.Bool("update", false, "update table-driven golden files")

type analyzerInput struct {
	files []testFile
}

type testFile struct {
	Name       string
	SourceFile string
	Functions  []testFunction
	Subtests   []subtestGroup
}

type testFunction struct {
	Name       string
	Comment    string
	InputName  string
	Input      string
	WantName   string
	Want       string
	GotName    string
	Call       string
	Condition  string
	Failure    string
	Invocation string
}

type subtestGroup struct {
	Name string
	Rows []subtest
}

type subtest struct {
	Name      string
	Input     string
	WantName  string
	Want      string
	GotName   string
	Call      string
	Condition string
}

type generatedCase struct {
	name string
	dir  string
}

func TestAnalyzer(t *testing.T) {
	templates := loadCaseTemplates(t)
	cases := []testx.Case[analyzerInput, string]{
		newAnalyzerCase("duplicate", analyzerInput{
			files: []testFile{
				{
					Name: "duplicate_test.go",
					Functions: []testFunction{
						{
							Name: "TestAddOne", Comment: "\t// This note does not change the test structure.",
							InputName: "input", Input: "1", WantName: "want", Want: "2",
							GotName: "got", Call: "add", Condition: "got != want", Failure: "Fatalf",
						},
						{
							Name: "TestAddTwo", Comment: "\t// The wording can differ while the test structure stays the same.",
							InputName: "value", Input: "3", WantName: "expected", Want: "4",
							GotName: "actual", Call: "add", Condition: "actual != expected", Failure: "Fatalf",
						},
						{
							Name: "TestShortOne", Invocation: "assertValue(t, 1)",
						},
						{
							Name: "TestShortTwo", Invocation: "assertValue(t, 2)",
						},
						{
							Name:      "TestLocalValueNamesOne",
							InputName: "input", Input: "1", WantName: "expected", Want: "2",
							GotName: "got", Call: "identity", Condition: "!sameValue(any(got), any(expected))", Failure: "Fatalf",
						},
						{
							Name:      "TestLocalValueNamesTwo",
							InputName: "value", Input: "3", WantName: "want", Want: "4",
							GotName: "actual", Call: "identity", Condition: "!sameValue(any(actual), any(want))", Failure: "Fatalf",
						},
						{Name: "Test_ExampleOne", Invocation: "assertOther(t, 1)"},
						{Name: "Test_ExampleTwo", Invocation: "assertOther(t, 2)"},
					},
					Subtests: []subtestGroup{
						{
							Name: "TestSubtests",
							Rows: []subtest{
								{Name: "one", Input: "10", WantName: "want", Want: "11", GotName: "got", Call: "add", Condition: "got != want"},
								{Name: "two", Input: "20", WantName: "expected", Want: "21", GotName: "actual", Call: "add", Condition: "actual != expected"},
								{Name: "different operation", Input: "3", WantName: "want", Want: "9", GotName: "got", Call: "multiply", Condition: "got != want"},
							},
						},
					},
				},
				{Name: "scopes_test.go", SourceFile: "scopes_test.go.txt"},
				{Name: "nested_test.go", SourceFile: "nested_test.go.txt"},
				{
					Name: "z_other_test.go",
					Functions: []testFunction{{
						Name:      "TestCrossFile",
						InputName: "value", Input: "8", WantName: "expect", Want: "9",
						GotName: "result", Call: "add", Condition: "result != expect", Failure: "Fatalf",
					}},
				},
			},
		}),
		newAnalyzerCase("no_duplicates", analyzerInput{
			files: []testFile{
				{
					Name: "duplicate_test.go",
					Functions: []testFunction{
						{
							Name:      "TestAddBaseline",
							InputName: "input", Input: "1", WantName: "want", Want: "2",
							GotName: "got", Call: "add", Condition: "got != want", Failure: "Fatalf",
						},
						{
							Name:      "TestDifferentBranch",
							InputName: "input", Input: "5", GotName: "got", Call: "add",
							Condition: "got < 0", Failure: "Fatalf",
						},
						{
							Name:      "TestDifferentFailureMethod",
							InputName: "input", Input: "7", WantName: "want", Want: "8",
							GotName: "got", Call: "add", Condition: "got != want", Failure: "Errorf",
						},
						{
							Name:      "TestPackageStateOne",
							InputName: "input", Input: "packageInputOne", WantName: "want", Want: "packageWantOne",
							GotName: "got", Call: "identity", Condition: "!sameValue(any(got), any(want))", Failure: "Fatalf",
						},
						{
							Name:      "TestPackageStateTwo",
							InputName: "input", Input: "packageInputTwo", WantName: "want", Want: "packageWantTwo",
							GotName: "got", Call: "identity", Condition: "!sameValue(any(got), any(want))", Failure: "Fatalf",
						},
						{
							Name:      "TestDifferentValueTypesInt",
							InputName: "input", Input: "1", WantName: "want", Want: "2",
							GotName: "got", Call: "identity", Condition: "!sameValue(any(got), any(want))", Failure: "Fatalf",
						},
						{
							Name:      "TestDifferentValueTypesString",
							InputName: "input", Input: `"one"`, WantName: "want", Want: `"two"`,
							GotName: "got", Call: "identity", Condition: "!sameValue(any(got), any(want))", Failure: "Fatalf",
						},
						{Name: "Testexample", Invocation: "assertOther(t, 3)"},
					},
					Subtests: []subtestGroup{
						{
							Name: "TestDifferentAssertions",
							Rows: []subtest{
								{Name: "non-negative", Input: "1", GotName: "got", Call: "add", Condition: "got < 0"},
								{Name: "exact value", Input: "2", GotName: "got", Call: "add", Condition: "got != 3"},
							},
						},
					},
				},
				{Name: "exceptions_test.go", SourceFile: "exceptions_test.go.txt"},
			},
		}),
	}

	generated := generateCases(t, templates, cases)
	packagesByCase := loadGeneratedPackages(t, generated)
	testx.NewTable(t, cases...).Run(func(t *testing.T, _ analyzerInput, goldenName string) {
		pkg := packagesByCase[goldenName]
		if pkg == nil {
			t.Fatalf("no generated package for case %q", goldenName)
		}
		diagnostics := runAnalyzer(t, pkg)
		actual := normalizeDiagnostics(t, pkg, diagnostics)
		compareGolden(t, goldenName, actual)
	})
}

func newAnalyzerCase(name string, input analyzerInput) testx.Case[analyzerInput, string] {
	return testx.NewCase(name, input, name)
}

func loadCaseTemplates(t *testing.T) *template.Template {
	t.Helper()
	templates, err := template.New("case.go.tmpl").ParseFiles("testdata/case.go.tmpl")
	if err != nil {
		t.Fatal(err)
	}
	return templates
}

func generateCases(t *testing.T, templates *template.Template, cases []testx.Case[analyzerInput, string]) []generatedCase {
	t.Helper()
	generated := make([]generatedCase, 0, len(cases))
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

	for _, tc := range cases {
		if !validFileName(tc.Name) {
			t.Fatalf("invalid analyzer case name %q", tc.Name)
		}
		caseDir := filepath.Join(inputDir, tc.Name)
		if err := os.MkdirAll(caseDir, 0o755); err != nil {
			t.Fatal(err)
		}
		generatedTC := generatedCase{name: tc.Name, dir: caseDir}
		seenFiles := make(map[string]struct{}, len(tc.Input.files)+1)
		for _, input := range tc.Input.files {
			if !validFileName(input.Name) || filepath.Ext(input.Name) != ".go" {
				t.Fatalf("invalid generated Go file name %q", input.Name)
			}
			if _, duplicate := seenFiles[input.Name]; duplicate {
				t.Fatalf("duplicate generated Go file %q in case %q", input.Name, tc.Name)
			}
			seenFiles[input.Name] = struct{}{}

			source, err := generateGoSource(templates, input)
			if err != nil {
				t.Fatalf("generate %s/%s: %v", tc.Name, input.Name, err)
			}
			if err := os.WriteFile(filepath.Join(caseDir, input.Name), source, 0o644); err != nil {
				t.Fatalf("write generated source %s/%s: %v", tc.Name, input.Name, err)
			}
		}

		supportSource := []byte(`package duplicate

import "testing"

var packageInputOne, packageInputTwo int

const packageWantOne = 2
const packageWantTwo = 3

func add(n int) int             { return n + 1 }
func multiply(n int) int        { return n * n }
func identity[T any](value T) T { return value }
func sameValue(any, any) bool   { return true }
func assertValue(*testing.T, int) {}
func assertOther(*testing.T, int) {}
`)
		if err := os.WriteFile(filepath.Join(caseDir, "support.go"), supportSource, 0o644); err != nil {
			t.Fatalf("write support source for %s: %v", tc.Name, err)
		}
		generated = append(generated, generatedTC)
	}
	return generated
}

func generateGoSource(templates *template.Template, input testFile) ([]byte, error) {
	if input.SourceFile != "" {
		if !validFileName(input.SourceFile) {
			return nil, fmt.Errorf("source fixture must be a file name: %q", input.SourceFile)
		}
		source, err := os.ReadFile(filepath.Join("testdata", "src", "duplicate", input.SourceFile))
		if err != nil {
			return nil, fmt.Errorf("read source fixture: %w", err)
		}
		formatted, err := format.Source(source)
		if err != nil {
			return nil, fmt.Errorf("format source fixture: %w", err)
		}
		return formatted, nil
	}

	var rendered bytes.Buffer
	if err := templates.ExecuteTemplate(&rendered, "file", input); err != nil {
		return nil, fmt.Errorf("render template: %w", err)
	}
	formatted, err := format.Source(rendered.Bytes())
	if err != nil {
		return nil, fmt.Errorf("format generated source: %w\n%s", err, rendered.String())
	}
	return formatted, nil
}

func loadGeneratedPackages(t *testing.T, cases []generatedCase) map[string]*packages.Package {
	t.Helper()
	mode := packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles | packages.NeedSyntax |
		packages.NeedTypes | packages.NeedTypesInfo | packages.NeedTypesSizes
	loaded, err := packages.Load(&packages.Config{
		Mode: mode, Tests: true,
		Dir: filepath.Dir(cases[0].dir),
	}, "./...")
	if err != nil {
		t.Fatalf("load generated test packages: %v", err)
	}

	caseDirs := make(map[string]string, len(cases))
	for _, generated := range cases {
		caseDirs[filepath.Clean(generated.dir)] = generated.name
	}
	packagesByCase := make(map[string]*packages.Package, len(cases))
	for _, candidate := range loaded {
		for _, file := range candidate.Syntax {
			dir := filepath.Clean(filepath.Dir(candidate.Fset.Position(file.Pos()).Filename))
			caseName, ok := caseDirs[dir]
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

func normalizeDiagnostics(t *testing.T, pkg *packages.Package, diagnostics []analysis.Diagnostic) []byte {
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
		fmt.Fprintf(&normalized, "%s:%d:%d [%s] %s\n", filepath.Base(position.Filename), position.Line, position.Column, diagnostic.Category, diagnostic.Message)
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

func validFileName(name string) bool {
	return name != "" && name != "." && name != ".." &&
		!strings.ContainsAny(name, `/\\`) && filepath.Base(name) == name
}
