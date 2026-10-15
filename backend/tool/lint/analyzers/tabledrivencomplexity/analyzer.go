// Package tabledrivencomplexity reports table-driven tests with complex
// case-dependent control flow.
package tabledrivencomplexity

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"path/filepath"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const (
	decisionLimit         = 4
	nestedDecisionLimit   = 2
	testxPackagePath      = "github.com/rin2yh/go-tickets/x/testx"
	caseNameField         = "name"
	caseNameFieldExported = "Name"
)

var Analyzer = &analysis.Analyzer{
	Name: "table_driven_complexity",
	Doc:  "finds table-driven tests with complex case-dependent control flow",
	Run:  run,
}

type caseVariables map[types.Object]struct{}

type complexity struct {
	decisions int
	depth     int
}

func run(pass *analysis.Pass) (any, error) {
	reported := make(map[token.Pos]bool)
	for _, file := range pass.Files {
		if !strings.HasSuffix(filepath.Base(pass.Fset.Position(file.Pos()).Filename), "_test.go") {
			continue
		}

		ast.Inspect(file, func(node ast.Node) bool {
			switch node := node.(type) {
			case *ast.RangeStmt:
				caseVar := rangeValueObject(pass, node)
				if caseVar == nil {
					return true
				}
				cases := caseVariables{caseVar: {}}
				inspectCalls(node.Body, func(call *ast.CallExpr) {
					body, ok := testingSubtest(pass, call)
					if ok {
						reportIfComplex(pass, call, body, cases, reported)
					}
				})
			case *ast.CallExpr:
				body, cases, ok := testxSubtest(pass, node)
				if ok {
					reportIfComplex(pass, node, body, cases, reported)
				}
			}
			return true
		})
	}
	return nil, nil
}

func rangeValueObject(pass *analysis.Pass, loop *ast.RangeStmt) types.Object {
	id, ok := loop.Value.(*ast.Ident)
	if !ok || id.Name == "_" {
		return nil
	}
	if obj := pass.TypesInfo.Defs[id]; obj != nil {
		return obj
	}
	return pass.TypesInfo.Uses[id]
}

func inspectCalls(node ast.Node, visit func(*ast.CallExpr)) {
	ast.Inspect(node, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok {
			visit(call)
		}
		return true
	})
}

func testingSubtest(pass *analysis.Pass, call *ast.CallExpr) (*ast.FuncLit, bool) {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Run" || len(call.Args) != 2 {
		return nil, false
	}
	selection := pass.TypesInfo.Selections[selector]
	if selection == nil || selection.Obj().Pkg() == nil || selection.Obj().Pkg().Path() != "testing" {
		return nil, false
	}
	body, ok := call.Args[1].(*ast.FuncLit)
	if !ok || !hasTestingTParameter(pass, body) {
		return nil, false
	}
	return body, true
}

func testxSubtest(pass *analysis.Pass, call *ast.CallExpr) (*ast.FuncLit, caseVariables, bool) {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Run" || len(call.Args) != 1 {
		return nil, nil, false
	}
	selection := pass.TypesInfo.Selections[selector]
	if selection == nil || selection.Obj().Pkg() == nil || selection.Obj().Pkg().Path() != testxPackagePath {
		return nil, nil, false
	}
	body, ok := call.Args[0].(*ast.FuncLit)
	if !ok || !hasTestingTParameter(pass, body) {
		return nil, nil, false
	}

	cases := make(caseVariables)
	parameterIndex := 0
	for _, field := range body.Type.Params.List {
		if len(field.Names) == 0 {
			parameterIndex++
			continue
		}
		for _, name := range field.Names {
			if parameterIndex > 0 {
				if obj := pass.TypesInfo.Defs[name]; obj != nil {
					cases[obj] = struct{}{}
				}
			}
			parameterIndex++
		}
	}
	if parameterIndex < 3 || len(cases) == 0 {
		return nil, nil, false
	}
	return body, cases, true
}

func hasTestingTParameter(pass *analysis.Pass, body *ast.FuncLit) bool {
	if body.Type.Params == nil || len(body.Type.Params.List) == 0 || len(body.Type.Params.List[0].Names) > 1 {
		return false
	}
	return isTestingType(pass.TypesInfo.TypeOf(body.Type.Params.List[0].Type), "T")
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

func reportIfComplex(pass *analysis.Pass, location ast.Node, body *ast.FuncLit, initial caseVariables, reported map[token.Pos]bool) {
	if reported[location.Pos()] {
		return
	}
	cases := derivedCaseVariables(pass, body, initial)
	result := controlFlowComplexity(pass, body.Body, cases)
	tooManyDecisions := result.decisions >= decisionLimit
	nestedDecisions := result.decisions >= nestedDecisionLimit && result.depth >= nestedDecisionLimit
	if !tooManyDecisions && !nestedDecisions {
		return
	}
	reported[location.Pos()] = true
	pass.Report(analysis.Diagnostic{
		Pos:      location.Pos(),
		Category: "table-driven-complexity",
		Message: fmt.Sprintf(
			"テーブル駆動テスト内のケース依存分岐が複雑です（分岐数: %d、ネスト深度: %d）。ケースごとの処理を分割してください",
			result.decisions,
			result.depth,
		),
	})
}

func derivedCaseVariables(pass *analysis.Pass, body *ast.FuncLit, initial caseVariables) caseVariables {
	cases := make(caseVariables, len(initial))
	for obj := range initial {
		cases[obj] = struct{}{}
	}
	ast.Inspect(body.Body, func(node ast.Node) bool {
		var left []ast.Expr
		var right []ast.Expr
		switch node := node.(type) {
		case *ast.AssignStmt:
			left, right = node.Lhs, node.Rhs
		case *ast.ValueSpec:
			for _, name := range node.Names {
				left = append(left, name)
			}
			right = node.Values
		default:
			return true
		}

		if len(left) != len(right) {
			return true
		}
		for i, expr := range right {
			if !isSimpleCaseExpression(expr) || !dependsOnCases(pass, expr, cases) {
				continue
			}
			id, ok := left[i].(*ast.Ident)
			if !ok || id.Name == "_" {
				continue
			}
			obj := pass.TypesInfo.Defs[id]
			if obj == nil {
				obj = pass.TypesInfo.Uses[id]
			}
			if obj != nil {
				cases[obj] = struct{}{}
			}
		}
		return true
	})
	return cases
}

func isSimpleCaseExpression(expr ast.Expr) bool {
	simple := true
	ast.Inspect(expr, func(node ast.Node) bool {
		switch node.(type) {
		case *ast.CallExpr, *ast.FuncLit, *ast.CompositeLit:
			simple = false
			return false
		}
		return simple
	})
	return simple
}

func controlFlowComplexity(pass *analysis.Pass, body *ast.BlockStmt, cases caseVariables) complexity {
	var result complexity
	var depthStack []int
	ast.Inspect(body, func(node ast.Node) bool {
		if node == nil {
			depthStack = depthStack[:len(depthStack)-1]
			return false
		}

		depth := 0
		if len(depthStack) != 0 {
			depth = depthStack[len(depthStack)-1]
		}
		if weight, dependent, ok := decisionComplexity(pass, node, cases); ok && dependent {
			result.decisions += weight
			depth++
			if depth > result.depth {
				result.depth = depth
			}
		}
		depthStack = append(depthStack, depth)
		return true
	})
	return result
}

func decisionComplexity(pass *analysis.Pass, node ast.Node, cases caseVariables) (int, bool, bool) {
	switch node := node.(type) {
	case *ast.IfStmt:
		return 1, dependsOnCases(pass, node.Cond, cases), true
	case *ast.SwitchStmt:
		dependent := dependsOnCases(pass, node.Tag, cases)
		for _, stmt := range node.Body.List {
			clause, ok := stmt.(*ast.CaseClause)
			if !ok {
				continue
			}
			for _, expr := range clause.List {
				dependent = dependent || dependsOnCases(pass, expr, cases)
			}
		}
		return switchDecisionCount(node.Body), dependent, true
	case *ast.TypeSwitchStmt:
		return switchDecisionCount(node.Body), dependsOnCases(pass, node.Assign, cases), true
	case *ast.ForStmt:
		if node.Cond != nil {
			return 1, dependsOnCases(pass, node.Cond, cases), true
		}
	case *ast.RangeStmt:
		return 1, dependsOnCases(pass, node.X, cases), true
	}
	return 0, false, false
}

func switchDecisionCount(body *ast.BlockStmt) int {
	cases := len(body.List)
	hasDefault := false
	for _, stmt := range body.List {
		clause, ok := stmt.(*ast.CaseClause)
		if ok && len(clause.List) == 0 {
			hasDefault = true
		}
	}
	if hasDefault {
		cases--
	}
	if cases < 1 {
		return 1
	}
	return cases
}

func dependsOnCases(pass *analysis.Pass, expr ast.Node, cases caseVariables) bool {
	if expr == nil {
		return false
	}
	dependent := false
	ast.Inspect(expr, func(node ast.Node) bool {
		if selector, ok := node.(*ast.SelectorExpr); ok {
			obj, firstField, found := selectorRoot(pass, selector)
			if found {
				if _, tracked := cases[obj]; tracked {
					dependent = firstField != caseNameField && firstField != caseNameFieldExported
					return false
				}
			}
		}
		if id, ok := node.(*ast.Ident); ok {
			obj := pass.TypesInfo.Uses[id]
			if obj == nil {
				obj = pass.TypesInfo.Defs[id]
			}
			if _, tracked := cases[obj]; tracked && obj != nil {
				dependent = true
				return false
			}
		}
		return !dependent
	})
	return dependent
}

func selectorRoot(pass *analysis.Pass, expr ast.Expr) (types.Object, string, bool) {
	switch expr := expr.(type) {
	case *ast.Ident:
		obj := pass.TypesInfo.Uses[expr]
		if obj == nil {
			obj = pass.TypesInfo.Defs[expr]
		}
		return obj, "", obj != nil
	case *ast.SelectorExpr:
		obj, firstField, found := selectorRoot(pass, expr.X)
		if !found {
			return nil, "", false
		}
		if firstField == "" {
			firstField = expr.Sel.Name
		}
		return obj, firstField, true
	case *ast.ParenExpr:
		return selectorRoot(pass, expr.X)
	default:
		return nil, "", false
	}
}
