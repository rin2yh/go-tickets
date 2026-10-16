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

type generatedCase struct {
	inputDir   string
	packageDir string
}

func TestAnalyzer(t *testing.T) {
	cases := []testx.Case[string, string]{
		newAnalyzerCase("duplicate"),
		newAnalyzerCase("no_duplicates"),
	}

	templates := loadCaseTemplates(t)
	generated := generateCases(t, templates, cases)
	packagesByInput := loadGeneratedPackages(t, generated)
	testx.NewTable(t, cases...).Run(func(t *testing.T, inputDir, goldenName string) {
		pkg := packagesByInput[inputDir]
		if pkg == nil {
			t.Fatalf("no generated package for input %q", inputDir)
		}
		diagnostics := runAnalyzer(t, pkg)
		compareGolden(t, goldenName, normalizeDiagnostics(t, pkg, diagnostics))
	})
}

func newAnalyzerCase(name string) testx.Case[string, string] {
	inputDir := filepath.Join("testdata", "input", name)
	return testx.NewCase(name, inputDir, name)
}

func loadCaseTemplates(t *testing.T) *template.Template {
	t.Helper()
	templates, err := template.ParseFiles("testdata/input/common/support.go.tmpl")
	if err != nil {
		t.Fatal(err)
	}
	return templates
}

func generateCases(t *testing.T, templates *template.Template, cases []testx.Case[string, string]) []generatedCase {
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
		if !validFileName(tc.Name) || !filepath.IsLocal(tc.Input) {
			t.Fatalf("invalid analyzer case %q with input directory %q", tc.Name, tc.Input)
		}
		caseDir := filepath.Join(inputDir, tc.Name)
		if err := os.MkdirAll(caseDir, 0o755); err != nil {
			t.Fatal(err)
		}
		entries, err := os.ReadDir(tc.Input)
		if err != nil {
			t.Fatalf("read input directory %q: %v", tc.Input, err)
		}
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".go" {
				continue
			}
			filename := entry.Name()
			if !validFileName(filename) {
				t.Fatalf("invalid Go input file name %q", filename)
			}
			source, err := os.ReadFile(filepath.Join(tc.Input, filename))
			if err != nil {
				t.Fatalf("read input %s/%s: %v", tc.Input, filename, err)
			}
			formatted, err := format.Source(source)
			if err != nil {
				t.Fatalf("format input %s/%s: %v", tc.Input, filename, err)
			}
			if err := os.WriteFile(filepath.Join(caseDir, filename), formatted, 0o644); err != nil {
				t.Fatalf("write input %s/%s: %v", tc.Input, filename, err)
			}
		}

		var rendered bytes.Buffer
		if err := templates.ExecuteTemplate(&rendered, "support.go.tmpl", nil); err != nil {
			t.Fatalf("render support for %s: %v", tc.Name, err)
		}
		support, err := format.Source(rendered.Bytes())
		if err != nil {
			t.Fatalf("format support for %s: %v\n%s", tc.Name, err, rendered.String())
		}
		if err := os.WriteFile(filepath.Join(caseDir, "support.go"), support, 0o644); err != nil {
			t.Fatalf("write support for %s: %v", tc.Name, err)
		}
		generated = append(generated, generatedCase{
			inputDir: tc.Input, packageDir: caseDir,
		})
	}
	return generated
}

func loadGeneratedPackages(t *testing.T, cases []generatedCase) map[string]*packages.Package {
	t.Helper()
	mode := packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles | packages.NeedSyntax |
		packages.NeedTypes | packages.NeedTypesInfo | packages.NeedTypesSizes
	loaded, err := packages.Load(&packages.Config{
		Mode: mode, Tests: true,
		Dir: filepath.Dir(cases[0].packageDir),
	}, "./...")
	if err != nil {
		t.Fatalf("load generated test packages: %v", err)
	}

	caseDirs := make(map[string]string, len(cases))
	packagesByInput := make(map[string]*packages.Package, len(cases))
	for _, generated := range cases {
		caseDirs[filepath.Clean(generated.packageDir)] = generated.inputDir
	}
	for _, candidate := range loaded {
		for _, file := range candidate.Syntax {
			dir := filepath.Clean(filepath.Dir(candidate.Fset.Position(file.Pos()).Filename))
			inputDir, ok := caseDirs[dir]
			if !ok {
				continue
			}
			current := packagesByInput[inputDir]
			if current == nil || len(candidate.Syntax) > len(current.Syntax) {
				packagesByInput[inputDir] = candidate
			}
		}
	}
	for _, generated := range cases {
		pkg := packagesByInput[generated.inputDir]
		if pkg == nil {
			t.Errorf("generated test package for input %q was not loaded", generated.inputDir)
			continue
		}
		if len(pkg.Errors) != 0 {
			t.Errorf("type-check generated test package %q: %v", generated.inputDir, pkg.Errors)
		}
	}
	return packagesByInput
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
