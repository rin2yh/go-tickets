package tabledrivencomplexity

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"text/template"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/packages"
)

var updateGolden = flag.Bool("update", false, "update table-driven-complexity golden files")

type testCase struct {
	ID               string     `json:"id"`
	Function         string     `json:"function"`
	Kind             string     `json:"kind"`
	Rows             []inputRow `json:"rows"`
	Branches         []branch   `json:"branches"`
	NestedConditions []string   `json:"nestedConditions"`
	NestedBody       string     `json:"nestedBody"`
	Prelude          string     `json:"prelude"`
	Source           string     `json:"source"`
	Params           string     `json:"params"`
	TestXRows        []testXRow `json:"testxRows"`
}

type inputRow struct {
	Name       string `json:"name"`
	Input      int    `json:"input"`
	Want       int    `json:"want"`
	WantBool   bool   `json:"wantBool"`
	WantDouble bool   `json:"wantDouble"`
	Enabled    bool   `json:"enabled"`
	WantErr    bool   `json:"wantErr"`
}

type branch struct {
	Condition string `json:"condition"`
	Count     int    `json:"count"`
}

type testXRow struct {
	Name string   `json:"name"`
	Args []string `json:"args"`
}

func TestAnalyzer(t *testing.T) {
	data, err := os.ReadFile("testdata/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var suite struct {
		Cases []testCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &suite); err != nil {
		t.Fatalf("decode test cases: %v", err)
	}
	template, err := template.New("case.go.tmpl").Funcs(template.FuncMap{
		"repeat": func(count int) []int { return make([]int, count) },
	}).ParseFiles("testdata/case.go.tmpl")
	if err != nil {
		t.Fatal(err)
	}

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

	overlay := make(map[string][]byte, len(suite.Cases))
	caseFiles := make(map[string]string, len(suite.Cases))
	for _, fixture := range suite.Cases {
		if fixture.ID == "" || filepath.Base(fixture.ID) != fixture.ID || caseFiles[fixture.ID+"_test.go"] != "" {
			t.Fatalf("invalid or duplicate test case id %q", fixture.ID)
		}
		if fixture.Kind != "standard" && fixture.Kind != "testx" {
			t.Fatalf("invalid test case kind %q for %s", fixture.Kind, fixture.ID)
		}
		if fixture.Source != "" {
			if filepath.Base(fixture.Source) != fixture.Source {
				t.Fatalf("source must be a file name: %q", fixture.Source)
			}
			source, err := os.ReadFile(filepath.Join("testdata", "source", fixture.Source))
			if err != nil {
				t.Fatalf("read source for %s: %v", fixture.ID, err)
			}
			fixture.Source = string(source)
		}
		var rendered bytes.Buffer
		if err := template.Execute(&rendered, fixture); err != nil {
			t.Fatalf("render %s: %v", fixture.ID, err)
		}
		formatted, err := format.Source(rendered.Bytes())
		if err != nil {
			t.Fatalf("format %s: %v\n%s", fixture.ID, err, rendered.String())
		}
		filename := fixture.ID + "_test.go"
		path := filepath.Join(inputDir, filename)
		if err := os.WriteFile(path, []byte("package complexity\n"), 0o644); err != nil {
			t.Fatalf("create overlay placeholder: %v", err)
		}
		overlay[path] = formatted
		caseFiles[filename] = fixture.ID
	}
	if err := os.WriteFile(filepath.Join(inputDir, "support.go"), []byte("package complexity\n\nfunc run() error { return nil }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	mode := packages.NeedName | packages.NeedFiles | packages.NeedCompiledGoFiles | packages.NeedSyntax |
		packages.NeedTypes | packages.NeedTypesInfo | packages.NeedTypesSizes
	loaded, err := packages.Load(&packages.Config{Mode: mode, Dir: inputDir, Tests: true, Overlay: overlay}, ".")
	if err != nil {
		t.Fatalf("load generated test package: %v", err)
	}
	var pkg *packages.Package
	loadedCases := 0
	for _, candidate := range loaded {
		count := 0
		for _, file := range candidate.Syntax {
			if _, ok := caseFiles[filepath.Base(candidate.Fset.Position(file.Pos()).Filename)]; ok {
				count++
			}
		}
		if count > loadedCases {
			pkg, loadedCases = candidate, count
		}
	}
	if pkg == nil || loadedCases != len(caseFiles) {
		t.Fatalf("generated tests were not loaded as one package: %d of %d files", loadedCases, len(caseFiles))
	}
	if len(pkg.Errors) != 0 {
		t.Fatalf("type-check generated tests: %v", pkg.Errors)
	}

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
	actual := make(map[string]*strings.Builder, len(caseFiles))
	for filename := range caseFiles {
		actual[filename] = new(strings.Builder)
	}
	for _, diagnostic := range diagnostics {
		position := pkg.Fset.Position(diagnostic.Pos)
		filename := filepath.Base(position.Filename)
		output := actual[filename]
		if output == nil {
			t.Errorf("diagnostic outside generated cases: %s", filename)
			continue
		}
		fmt.Fprintf(output, "%s:%d:%d [%s] %s\n", filename, position.Line, position.Column, diagnostic.Category, diagnostic.Message)
	}

	if *updateGolden {
		if err := os.MkdirAll("testdata/golden", 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, fixture := range suite.Cases {
		fixture := fixture
		filename, id := fixture.ID+"_test.go", fixture.ID
		t.Run(id, func(t *testing.T) {
			goldenPath := filepath.Join("testdata", "golden", id+".golden")
			got := actual[filename].String()
			if *updateGolden {
				if err := os.WriteFile(goldenPath, []byte(got), 0o644); err != nil {
					t.Fatal(err)
				}
				return
			}
			want, err := os.ReadFile(goldenPath)
			if err != nil {
				t.Fatalf("read golden: %v (run go test -update)", err)
			}
			if got != string(want) {
				t.Errorf("diagnostics differ from %s\n--- want ---\n%s\n--- got ---\n%s", goldenPath, want, got)
			}
		})
	}
}
