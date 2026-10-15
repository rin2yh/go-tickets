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

func TestAnalyzer(t *testing.T) {
	templates := loadCaseTemplates(t)

	testx.NewTable(t, standardCases()...).Run(func(t *testing.T, tc testCase, _ struct{}) {
		runAnalyzerCase(t, templates, "standard", tc)
	})
	testx.NewTable(t, testXCases()...).Run(func(t *testing.T, tc testCase, _ struct{}) {
		runAnalyzerCase(t, templates, "testx", tc)
	})
}

func runAnalyzerCase(t *testing.T, templates *template.Template, templateName string, tc testCase) {
	t.Helper()
	caseName := strings.TrimPrefix(t.Name(), "TestAnalyzer/")
	if caseName == t.Name() || strings.ContainsAny(caseName, `/\\`) {
		t.Fatalf("invalid analyzer case name %q", caseName)
	}
	filename := caseName + "_test.go"
	source := generateGoSource(t, templates, templateName, filename, tc)
	pkg := loadGeneratedPackage(t, filename, source)
	diagnostics := runAnalyzer(t, pkg)
	compareGolden(t, caseName, normalizeDiagnostics(t, pkg, filename, diagnostics))
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

func loadGeneratedPackage(t *testing.T, filename string, source []byte) *packages.Package {
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

	placeholderPath := filepath.Join(inputDir, filename)
	if err := os.WriteFile(placeholderPath, []byte("package complexity\n"), 0o644); err != nil {
		t.Fatalf("create overlay placeholder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(inputDir, "support.go"), []byte("package complexity\n\nfunc run() error { return nil }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	mode := packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles | packages.NeedSyntax |
		packages.NeedTypes | packages.NeedTypesInfo | packages.NeedTypesSizes
	loaded, err := packages.Load(&packages.Config{
		Mode: mode, Dir: inputDir, Tests: true,
		Overlay: map[string][]byte{placeholderPath: source},
	}, ".")
	if err != nil {
		t.Fatalf("load generated test package: %v", err)
	}

	var pkg *packages.Package
	loadedCaseFiles := 0
	for _, candidate := range loaded {
		count := 0
		for _, file := range candidate.Syntax {
			if filepath.Base(candidate.Fset.Position(file.Pos()).Filename) == filename {
				count++
			}
		}
		if count > loadedCaseFiles {
			pkg, loadedCaseFiles = candidate, count
		}
	}
	if pkg == nil || loadedCaseFiles != 1 {
		t.Fatalf("generated test was not loaded: %d matching files", loadedCaseFiles)
	}
	if len(pkg.Errors) != 0 {
		t.Fatalf("type-check generated test: %v", pkg.Errors)
	}
	return pkg
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
