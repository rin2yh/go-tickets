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
	result := controlFlowComplexity(pass, body.Body, initial)
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

func controlFlowComplexity(pass *analysis.Pass, body *ast.BlockStmt, initial caseVariables) complexity {
	dependencies := make(map[ast.Node]bool)
	analyzeStatements(pass, body.List, cloneCaseVariables(initial), dependencies)

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
		if weight, ok := decisionWeight(node); ok && dependencies[node] {
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

func decisionWeight(node ast.Node) (int, bool) {
	switch node := node.(type) {
	case *ast.IfStmt:
		return 1, true
	case *ast.SwitchStmt:
		return switchDecisionCount(node.Body), true
	case *ast.TypeSwitchStmt:
		return switchDecisionCount(node.Body), true
	case *ast.ForStmt:
		return 1, node.Cond != nil
	case *ast.RangeStmt:
		return 1, true
	}
	return 0, false
}

// analyzeStatements follows source order and forks the dependency set at
// conditional statements. At a join, it retains only dependencies present on
// every path; if paths disagree, later checks are treated as unknown.
func analyzeStatements(pass *analysis.Pass, statements []ast.Stmt, cases caseVariables, dependencies map[ast.Node]bool) caseVariables {
	for _, statement := range statements {
		cases = analyzeStatement(pass, statement, cases, dependencies)
	}
	return cases
}

func analyzeStatement(pass *analysis.Pass, statement ast.Stmt, cases caseVariables, dependencies map[ast.Node]bool) caseVariables {
	switch statement := statement.(type) {
	case *ast.BlockStmt:
		return analyzeStatements(pass, statement.List, cloneCaseVariables(cases), dependencies)
	case *ast.AssignStmt:
		assignCaseVariables(pass, statement.Lhs, statement.Rhs, cases)
	case *ast.DeclStmt:
		declaration, ok := statement.Decl.(*ast.GenDecl)
		if !ok || declaration.Tok != token.VAR {
			return cases
		}
		for _, spec := range declaration.Specs {
			if values, ok := spec.(*ast.ValueSpec); ok {
				left := make([]ast.Expr, len(values.Names))
				for i, name := range values.Names {
					left[i] = name
				}
				assignCaseVariables(pass, left, values.Values, cases)
			}
		}
	case *ast.IfStmt:
		if statement.Init != nil {
			cases = analyzeStatement(pass, statement.Init, cases, dependencies)
		}
		dependencies[statement] = dependsOnCases(pass, statement.Cond, cases)
		thenCases := analyzeStatement(pass, statement.Body, cloneCaseVariables(cases), dependencies)
		elseCases := cloneCaseVariables(cases)
		if statement.Else != nil {
			elseCases = analyzeStatement(pass, statement.Else, elseCases, dependencies)
		}
		return intersectCaseVariables(thenCases, elseCases)
	case *ast.SwitchStmt:
		if statement.Init != nil {
			cases = analyzeStatement(pass, statement.Init, cases, dependencies)
		}
		dependent := dependsOnCases(pass, statement.Tag, cases)
		for _, item := range statement.Body.List {
			if clause, ok := item.(*ast.CaseClause); ok {
				for _, expression := range clause.List {
					dependent = dependent || dependsOnCases(pass, expression, cases)
				}
			}
		}
		dependencies[statement] = dependent
		return analyzeCaseClauses(pass, statement.Body.List, cases, dependencies, len(statement.Body.List) > 0 && hasDefaultClause(statement.Body.List))
	case *ast.TypeSwitchStmt:
		if statement.Init != nil {
			cases = analyzeStatement(pass, statement.Init, cases, dependencies)
		}
		dependencies[statement] = dependsOnCases(pass, statement.Assign, cases)
		if assignment, ok := statement.Assign.(*ast.AssignStmt); ok {
			assignCaseVariables(pass, assignment.Lhs, assignment.Rhs, cases)
		}
		return analyzeCaseClauses(pass, statement.Body.List, cases, dependencies, hasDefaultClause(statement.Body.List))
	case *ast.ForStmt:
		if statement.Init != nil {
			cases = analyzeStatement(pass, statement.Init, cases, dependencies)
		}
		dependencies[statement] = dependsOnCases(pass, statement.Cond, cases)
		bodyCases := analyzeStatement(pass, statement.Body, cloneCaseVariables(cases), dependencies)
		if statement.Post != nil {
			bodyCases = analyzeStatement(pass, statement.Post, bodyCases, dependencies)
		}
		return intersectCaseVariables(cases, bodyCases)
	case *ast.RangeStmt:
		dependent := dependsOnCases(pass, statement.X, cases)
		dependencies[statement] = dependent
		for _, expression := range []ast.Expr{statement.Key, statement.Value} {
			id, ok := expression.(*ast.Ident)
			if !ok || id.Name == "_" {
				continue
			}
			setCaseVariable(pass, id, dependent, cases)
		}
		bodyCases := analyzeStatement(pass, statement.Body, cloneCaseVariables(cases), dependencies)
		return intersectCaseVariables(cases, bodyCases)
	case *ast.SelectStmt:
		var branches []caseVariables
		for _, item := range statement.Body.List {
			clause, ok := item.(*ast.CommClause)
			if !ok {
				continue
			}
			branch := cloneCaseVariables(cases)
			if clause.Comm != nil {
				branch = analyzeStatement(pass, clause.Comm, branch, dependencies)
			}
			branches = append(branches, analyzeStatements(pass, clause.Body, branch, dependencies))
		}
		return intersectCaseVariables(branches...)
	case *ast.LabeledStmt:
		return analyzeStatement(pass, statement.Stmt, cases, dependencies)
	}
	return cases
}

func analyzeCaseClauses(pass *analysis.Pass, statements []ast.Stmt, cases caseVariables, dependencies map[ast.Node]bool, hasDefault bool) caseVariables {
	branches := make([]caseVariables, 0, len(statements)+1)
	for _, statement := range statements {
		clause, ok := statement.(*ast.CaseClause)
		if ok {
			branches = append(branches, analyzeStatements(pass, clause.Body, cloneCaseVariables(cases), dependencies))
		}
	}
	if !hasDefault {
		branches = append(branches, cases)
	}
	return intersectCaseVariables(branches...)
}

func hasDefaultClause(statements []ast.Stmt) bool {
	for _, statement := range statements {
		if clause, ok := statement.(*ast.CaseClause); ok && len(clause.List) == 0 {
			return true
		}
	}
	return false
}

func assignCaseVariables(pass *analysis.Pass, left, right []ast.Expr, cases caseVariables) {
	values := make([]bool, len(left))
	if len(left) == len(right) {
		for i, expression := range right {
			values[i] = isSimpleCaseExpression(expression) && dependsOnCases(pass, expression, cases)
		}
	}
	for i, expression := range left {
		id, ok := expression.(*ast.Ident)
		if ok && id.Name != "_" {
			setCaseVariable(pass, id, values[i], cases)
		}
	}
}

func setCaseVariable(pass *analysis.Pass, id *ast.Ident, dependent bool, cases caseVariables) {
	obj := pass.TypesInfo.Defs[id]
	if obj == nil {
		obj = pass.TypesInfo.Uses[id]
	}
	if obj == nil {
		return
	}
	if dependent {
		cases[obj] = struct{}{}
	} else {
		delete(cases, obj)
	}
}

func cloneCaseVariables(cases caseVariables) caseVariables {
	clone := make(caseVariables, len(cases))
	for obj := range cases {
		clone[obj] = struct{}{}
	}
	return clone
}

func intersectCaseVariables(states ...caseVariables) caseVariables {
	if len(states) == 0 {
		return make(caseVariables)
	}
	intersection := cloneCaseVariables(states[0])
	for obj := range intersection {
		for _, state := range states[1:] {
			if _, exists := state[obj]; !exists {
				delete(intersection, obj)
				break
			}
		}
	}
	return intersection
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
					if firstField != caseNameField && firstField != caseNameFieldExported {
						dependent = true
					}
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
