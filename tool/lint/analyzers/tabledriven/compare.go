package tabledriven

import (
	"bytes"
	"go/ast"
	"go/format"
	"go/scanner"
	"go/token"
	"go/types"
	"reflect"

	"golang.org/x/tools/go/analysis"
)

type comparer struct {
	leftPass    *analysis.Pass
	rightPass   *analysis.Pass
	leftToRight map[types.Object]types.Object
	rightToLeft map[types.Object]types.Object
}

type nodeVisit struct {
	node             ast.Node
	parent           ast.Node
	grandparent      ast.Node
	greatGrandparent ast.Node
	depth            int
}

type syntaxTree struct {
	nodes        []nodeVisit
	tokens       []token.Token
	identCount   int
	literalCount int
}

func compareFunctions(leftPass *analysis.Pass, left *ast.FuncDecl, rightPass *analysis.Pass, right *ast.FuncDecl) bool {
	c := newComparer(leftPass, rightPass)
	return c.node(left.Type, right.Type) && c.node(left.Body, right.Body)
}

func compareNodes(leftPass *analysis.Pass, left ast.Node, rightPass *analysis.Pass, right ast.Node) bool {
	return newComparer(leftPass, rightPass).node(left, right)
}

func newComparer(leftPass, rightPass *analysis.Pass) *comparer {
	return &comparer{
		leftPass:    leftPass,
		rightPass:   rightPass,
		leftToRight: make(map[types.Object]types.Object),
		rightToLeft: make(map[types.Object]types.Object),
	}
}

// node compares AST shape through the standard AST walker and canonical Go
// syntax. Only identifiers, literals, and AST fields that carry semantic flags
// need custom rules. The concrete-node check is intentionally fail-closed.
func (c *comparer) node(left, right ast.Node) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	leftTree, ok := inspectSyntax(c.leftPass, left)
	if !ok {
		return false
	}
	rightTree, ok := inspectSyntax(c.rightPass, right)
	if !ok || len(leftTree.nodes) != len(rightTree.nodes) || len(leftTree.tokens) != len(rightTree.tokens) {
		return false
	}
	for i := range leftTree.nodes {
		leftVisit, rightVisit := leftTree.nodes[i], rightTree.nodes[i]
		// Reflection is used only to reject a different concrete node kind.
		if leftVisit.depth != rightVisit.depth || reflect.TypeOf(leftVisit.node) != reflect.TypeOf(rightVisit.node) ||
			!c.nodeProperties(leftVisit, rightVisit) {
			return false
		}
	}
	if leftTree.identCount != rightTree.identCount || leftTree.literalCount != rightTree.literalCount {
		return false
	}
	for i := range leftTree.tokens {
		if leftTree.tokens[i] != rightTree.tokens[i] {
			return false
		}
	}
	return true
}

func inspectSyntax(pass *analysis.Pass, root ast.Node) (syntaxTree, bool) {
	var tree syntaxTree
	if pass == nil || pass.Fset == nil {
		return tree, false
	}
	var stack []ast.Node
	ast.Inspect(root, func(node ast.Node) bool {
		if node == nil {
			stack = stack[:len(stack)-1]
			return false
		}
		switch node.(type) {
		case *ast.Comment, *ast.CommentGroup:
			return false
		}
		visit := nodeVisit{node: node, depth: len(stack)}
		if len(stack) > 0 {
			visit.parent = stack[len(stack)-1]
		}
		if len(stack) > 1 {
			visit.grandparent = stack[len(stack)-2]
		}
		if len(stack) > 2 {
			visit.greatGrandparent = stack[len(stack)-3]
		}
		tree.nodes = append(tree.nodes, visit)
		switch node.(type) {
		case *ast.Ident:
			tree.identCount++
		case *ast.BasicLit:
			tree.literalCount++
		}
		stack = append(stack, node)
		return true
	})

	var source bytes.Buffer
	if err := format.Node(&source, pass.Fset, root); err != nil {
		return tree, false
	}
	fileSet := token.NewFileSet()
	file := fileSet.AddFile("canonical.go", fileSet.Base(), source.Len())
	var scan scanner.Scanner
	var scanError bool
	scan.Init(file, source.Bytes(), func(token.Position, string) { scanError = true }, scanner.ScanComments)
	for {
		_, tok, _ := scan.Scan()
		if tok == token.EOF {
			break
		}
		if tok != token.COMMENT {
			tree.tokens = append(tree.tokens, tok)
		}
	}
	if scanError || countToken(tree.tokens, token.IDENT) != tree.identCount ||
		countLiteralTokens(tree.tokens) != tree.literalCount {
		return tree, false
	}
	return tree, true
}

func countToken(tokens []token.Token, want token.Token) int {
	count := 0
	for _, tok := range tokens {
		if tok == want {
			count++
		}
	}
	return count
}

func countLiteralTokens(tokens []token.Token) int {
	count := 0
	for _, tok := range tokens {
		switch tok {
		case token.INT, token.FLOAT, token.IMAG, token.CHAR, token.STRING:
			count++
		}
	}
	return count
}

func (c *comparer) nodeProperties(left, right nodeVisit) bool {
	switch leftNode := left.node.(type) {
	case *ast.AssignStmt:
		return leftNode.Tok == right.node.(*ast.AssignStmt).Tok
	case *ast.BasicLit:
		return c.basicLit(left, right)
	case *ast.BinaryExpr:
		return leftNode.Op == right.node.(*ast.BinaryExpr).Op
	case *ast.BranchStmt:
		return leftNode.Tok == right.node.(*ast.BranchStmt).Tok
	case *ast.CallExpr:
		return leftNode.Ellipsis.IsValid() == right.node.(*ast.CallExpr).Ellipsis.IsValid()
	case *ast.ChanType:
		return leftNode.Dir == right.node.(*ast.ChanType).Dir
	case *ast.CompositeLit:
		return leftNode.Incomplete == right.node.(*ast.CompositeLit).Incomplete
	case *ast.EmptyStmt:
		return leftNode.Implicit == right.node.(*ast.EmptyStmt).Implicit
	case *ast.GenDecl:
		rightNode := right.node.(*ast.GenDecl)
		return leftNode.Tok == rightNode.Tok && leftNode.Lparen.IsValid() == rightNode.Lparen.IsValid()
	case *ast.Ident:
		return c.identVisit(left, right)
	case *ast.IncDecStmt:
		return leftNode.Tok == right.node.(*ast.IncDecStmt).Tok
	case *ast.RangeStmt:
		return leftNode.Tok == right.node.(*ast.RangeStmt).Tok
	case *ast.SliceExpr:
		return leftNode.Slice3 == right.node.(*ast.SliceExpr).Slice3
	case *ast.StructType:
		return leftNode.Incomplete == right.node.(*ast.StructType).Incomplete
	case *ast.InterfaceType:
		return leftNode.Incomplete == right.node.(*ast.InterfaceType).Incomplete
	case *ast.TypeSpec:
		return leftNode.Assign.IsValid() == right.node.(*ast.TypeSpec).Assign.IsValid()
	case *ast.UnaryExpr:
		return leftNode.Op == right.node.(*ast.UnaryExpr).Op
	case *ast.ArrayType, *ast.BlockStmt, *ast.CaseClause, *ast.CommClause,
		*ast.DeclStmt, *ast.DeferStmt, *ast.Ellipsis, *ast.ExprStmt,
		*ast.Field, *ast.FieldList, *ast.FuncDecl, *ast.FuncLit, *ast.FuncType,
		*ast.GoStmt, *ast.IfStmt, *ast.ImportSpec, *ast.IndexExpr,
		*ast.IndexListExpr, *ast.KeyValueExpr, *ast.LabeledStmt,
		*ast.MapType, *ast.ParenExpr, *ast.ReturnStmt, *ast.SelectStmt,
		*ast.SelectorExpr, *ast.SendStmt, *ast.StarExpr, *ast.SwitchStmt,
		*ast.TypeAssertExpr, *ast.TypeSwitchStmt, *ast.ValueSpec:
		return true
	default:
		return false
	}
}

func (c *comparer) basicLit(left, right nodeVisit) bool {
	leftLit := left.node.(*ast.BasicLit)
	rightLit := right.node.(*ast.BasicLit)
	if leftLit.Kind != rightLit.Kind {
		return false
	}
	if strictLiteral(left) || strictLiteral(right) {
		return strictLiteral(left) && strictLiteral(right) && leftLit.Value == rightLit.Value
	}
	leftType := defaultType(expressionType(c.leftPass, leftLit))
	rightType := defaultType(expressionType(c.rightPass, rightLit))
	return leftType != nil && rightType != nil && types.Identical(leftType, rightType)
}

func strictLiteral(visit nodeVisit) bool {
	switch parent := visit.parent.(type) {
	case *ast.Field:
		return parent.Tag == visit.node
	case *ast.ImportSpec:
		return parent.Path == visit.node
	default:
		return false
	}
}

type identRole uint8

const (
	ordinaryIdent identRole = iota
	exactIdent
	calleeIdent
	parameterIdent
)

func (c *comparer) identVisit(left, right nodeVisit) bool {
	leftIdent := left.node.(*ast.Ident)
	rightIdent := right.node.(*ast.Ident)
	leftRole := roleOfIdent(left)
	rightRole := roleOfIdent(right)
	if leftRole != rightRole {
		return false
	}
	switch leftRole {
	case exactIdent:
		return leftIdent.Name == rightIdent.Name
	case calleeIdent:
		return leftIdent.Name == rightIdent.Name && c.ident(leftIdent, rightIdent)
	case parameterIdent:
		return c.bindDefinition(leftIdent, rightIdent)
	default:
		return c.ident(leftIdent, rightIdent)
	}
}

func roleOfIdent(visit nodeVisit) identRole {
	ident := visit.node.(*ast.Ident)
	switch parent := visit.parent.(type) {
	case *ast.CallExpr:
		if parent.Fun == ident {
			return calleeIdent
		}
	case *ast.SelectorExpr:
		if parent.Sel == ident {
			return exactIdent
		}
	case *ast.Field:
		for _, name := range parent.Names {
			if name != ident {
				continue
			}
			fieldList, ok := visit.grandparent.(*ast.FieldList)
			if ok {
				functionType, ok := visit.greatGrandparent.(*ast.FuncType)
				if ok && (functionType.Params == fieldList || functionType.Results == fieldList) {
					return parameterIdent
				}
			}
			return exactIdent
		}
	case *ast.BranchStmt:
		if parent.Label == ident {
			return exactIdent
		}
	case *ast.FuncDecl:
		if parent.Name == ident {
			return exactIdent
		}
	case *ast.ImportSpec:
		if parent.Name == ident {
			return exactIdent
		}
	case *ast.LabeledStmt:
		if parent.Label == ident {
			return exactIdent
		}
	case *ast.TypeSpec:
		if parent.Name == ident {
			return exactIdent
		}
	}
	return ordinaryIdent
}

func expressionType(pass *analysis.Pass, expr ast.Expr) types.Type {
	if pass == nil || pass.TypesInfo == nil {
		return nil
	}
	return pass.TypesInfo.TypeOf(expr)
}

func defaultType(t types.Type) types.Type {
	if t == nil {
		return nil
	}
	if defaulted := types.Default(t); defaulted != nil {
		return defaulted
	}
	return t
}

func (c *comparer) ident(left, right *ast.Ident) bool {
	if left.Name == "_" || right.Name == "_" {
		return left.Name == right.Name
	}
	leftObject := objectOf(c.leftPass.TypesInfo, left)
	rightObject := objectOf(c.rightPass.TypesInfo, right)
	leftLocal := isLocalValue(c.leftPass, leftObject)
	rightLocal := isLocalValue(c.rightPass, rightObject)
	if leftLocal || rightLocal {
		return leftLocal && rightLocal && c.pairObjects(leftObject, rightObject)
	}
	if leftObject == nil || rightObject == nil {
		return leftObject == nil && rightObject == nil && left.Name == right.Name
	}
	return sameExternalObject(leftObject, rightObject)
}

func objectOf(info *types.Info, ident *ast.Ident) types.Object {
	if info == nil {
		return nil
	}
	if object := info.Uses[ident]; object != nil {
		return object
	}
	return info.Defs[ident]
}

func sameExternalObject(left, right types.Object) bool {
	if left == right {
		return true
	}
	leftPackage, ok := left.(*types.PkgName)
	if !ok {
		return false
	}
	rightPackage, ok := right.(*types.PkgName)
	return ok && leftPackage.Imported().Path() == rightPackage.Imported().Path()
}

func isLocalValue(pass *analysis.Pass, object types.Object) bool {
	if pass == nil || pass.Pkg == nil || object == nil || object.Pkg() != pass.Pkg || object.Parent() == nil || object.Parent() == pass.Pkg.Scope() {
		return false
	}
	switch object := object.(type) {
	case *types.Var:
		return !object.IsField()
	case *types.Const:
		return true
	default:
		return false
	}
}

func (c *comparer) bindDefinition(left, right *ast.Ident) bool {
	if left.Name == "_" || right.Name == "_" {
		return left.Name == right.Name
	}
	leftObject := objectOf(c.leftPass.TypesInfo, left)
	rightObject := objectOf(c.rightPass.TypesInfo, right)
	if leftObject == nil || rightObject == nil {
		return leftObject == nil && rightObject == nil && left.Name == right.Name
	}
	return c.pairObjects(leftObject, rightObject)
}

func (c *comparer) pairObjects(left, right types.Object) bool {
	if !isLocalValue(c.leftPass, left) || !isLocalValue(c.rightPass, right) ||
		!sameObjectKind(left, right) || !types.Identical(left.Type(), right.Type()) {
		return false
	}
	if paired, ok := c.leftToRight[left]; ok {
		return paired == right
	}
	if paired, ok := c.rightToLeft[right]; ok {
		return paired == left
	}
	c.leftToRight[left] = right
	c.rightToLeft[right] = left
	return true
}

func sameObjectKind(left, right types.Object) bool {
	switch left.(type) {
	case *types.Var:
		_, ok := right.(*types.Var)
		return ok
	case *types.Const:
		_, ok := right.(*types.Const)
		return ok
	default:
		return false
	}
}
