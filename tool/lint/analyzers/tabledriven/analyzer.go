package tabledriven

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name: "tabledriven",
	Doc:  "finds structurally duplicate Go tests that should be table-driven",
	Run:  run,
}

type testCase struct {
	name string
	decl *ast.FuncDecl
}

type subtestCase struct {
	name string
	call *ast.CallExpr
	body *ast.FuncLit
}

func run(pass *analysis.Pass) (any, error) {
	var tests []testCase
	for _, file := range pass.Files {
		if !strings.HasSuffix(filepath.Base(pass.Fset.Position(file.Pos()).Filename), "_test.go") {
			continue
		}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if ok && isTestFunc(pass, fn) {
				tests = append(tests, testCase{name: fn.Name.Name, decl: fn})
			}
		}
	}
	sort.Slice(tests, func(i, j int) bool {
		left := pass.Fset.Position(tests[i].decl.Pos())
		right := pass.Fset.Position(tests[j].decl.Pos())
		if left.Filename != right.Filename {
			return left.Filename < right.Filename
		}
		return left.Offset < right.Offset
	})

	duplicateFuncs := make(map[*ast.FuncDecl]bool)
	for i := range tests {
		if containsRange(tests[i].decl.Body) {
			continue
		}
		for j := 0; j < i; j++ {
			if containsRange(tests[j].decl.Body) {
				continue
			}
			if compareFunctions(pass, tests[j].decl, pass, tests[i].decl) {
				reportDuplicate(pass, tests[i].decl.Name, tests[i].name, tests[j].decl.Name, tests[j].name)
				duplicateFuncs[tests[i].decl] = true
				break
			}
		}
	}

	for _, test := range tests {
		if duplicateFuncs[test.decl] {
			continue
		}
		for _, group := range subtestsIn(test.decl.Body, pass) {
			for i := 1; i < len(group); i++ {
				for j := 0; j < i; j++ {
					if compareNodes(pass, group[j].body, pass, group[i].body) {
						name := group[i].name
						if name == "" {
							name = "t.Run"
						}
						origin := group[j].name
						if origin == "" {
							origin = "t.Run"
						}
						reportDuplicate(pass, group[i].call, name, group[j].call, origin)
						break
					}
				}
			}
		}
	}

	return nil, nil
}

func isTestFunc(pass *analysis.Pass, fn *ast.FuncDecl) bool {
	name := fn.Name.Name
	if len(name) <= len("Test") || !strings.HasPrefix(name, "Test") {
		return false
	}
	first, _ := utf8.DecodeRuneInString(name[len("Test"):])
	if !unicode.IsUpper(first) {
		return false
	}
	if fn.Recv != nil || fn.Type.TypeParams != nil {
		return false
	}
	obj, ok := pass.TypesInfo.Defs[fn.Name].(*types.Func)
	if !ok {
		return false
	}
	sig, ok := obj.Type().(*types.Signature)
	if !ok || sig.Params().Len() != 1 || sig.Results().Len() != 0 {
		return false
	}
	return isTestingType(sig.Params().At(0).Type(), "T")
}

func isTestingType(t types.Type, name string) bool {
	ptr, ok := t.(*types.Pointer)
	if !ok {
		return false
	}
	named, ok := types.Unalias(ptr.Elem()).(*types.Named)
	if !ok || named.Obj().Name() != name || named.Obj().Pkg() == nil {
		return false
	}
	return named.Obj().Pkg().Path() == "testing"
}

func containsRange(body *ast.BlockStmt) bool {
	if body == nil {
		return false
	}
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if _, ok := node.(*ast.RangeStmt); ok {
			found = true
			return false
		}
		return !found
	})
	return found
}

func subtestsIn(body *ast.BlockStmt, pass *analysis.Pass) [][]subtestCase {
	var groups [][]subtestCase
	type nodeState struct {
		inRange bool
	}
	var stack []nodeState
	ast.Inspect(body, func(node ast.Node) bool {
		if node == nil {
			stack = stack[:len(stack)-1]
			return false
		}

		inRange := len(stack) > 0 && stack[len(stack)-1].inRange
		if _, ok := node.(*ast.RangeStmt); ok {
			inRange = true
		}
		if block, ok := node.(*ast.BlockStmt); ok && !inRange {
			var group []subtestCase
			for _, stmt := range block.List {
				expr, ok := stmt.(*ast.ExprStmt)
				if !ok {
					continue
				}
				call, ok := expr.X.(*ast.CallExpr)
				if !ok || !isTestingTRun(pass, call) || len(call.Args) != 2 {
					continue
				}
				body, ok := call.Args[1].(*ast.FuncLit)
				if !ok || !isSubtestFunc(pass, body) {
					continue
				}
				group = append(group, subtestCase{name: runName(call), call: call, body: body})
			}
			if len(group) > 1 {
				groups = append(groups, group)
			}
		}
		stack = append(stack, nodeState{inRange: inRange})
		return true
	})
	return groups
}

func isTestingTRun(pass *analysis.Pass, call *ast.CallExpr) bool {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "Run" {
		return false
	}
	selection := pass.TypesInfo.Selections[sel]
	if selection == nil || selection.Obj().Pkg() == nil {
		return false
	}
	return selection.Obj().Name() == "Run" && selection.Obj().Pkg().Path() == "testing"
}

func isSubtestFunc(pass *analysis.Pass, fn *ast.FuncLit) bool {
	if fn.Type.Params == nil || len(fn.Type.Params.List) != 1 || len(fn.Type.Params.List[0].Names) != 1 {
		return false
	}
	return isTestingType(pass.TypesInfo.TypeOf(fn.Type.Params.List[0].Type), "T")
}

func runName(call *ast.CallExpr) string {
	if len(call.Args) == 0 {
		return ""
	}
	lit, ok := call.Args[0].(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return ""
	}
	name, err := strconv.Unquote(lit.Value)
	if err != nil {
		return ""
	}
	return name
}

func reportDuplicate(pass *analysis.Pass, duplicate ast.Node, name string, origin ast.Node, originName string) {
	pass.Report(analysis.Diagnostic{
		Pos:      duplicate.Pos(),
		Category: "table-driven",
		Message:  fmt.Sprintf("%s は %s と同じテスト構造です。テーブル駆動テストに統合してください", name, originName),
		Related: []analysis.RelatedInformation{{
			Pos:     origin.Pos(),
			Message: "重複元のテスト",
		}},
	})
}
