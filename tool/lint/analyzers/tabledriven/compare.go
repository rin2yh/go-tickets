package tabledriven

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

type comparer struct {
	leftPass    *analysis.Pass
	rightPass   *analysis.Pass
	leftToRight map[types.Object]types.Object
	rightToLeft map[types.Object]types.Object
}

func compareFunctions(leftPass *analysis.Pass, left *ast.FuncDecl, rightPass *analysis.Pass, right *ast.FuncDecl) bool {
	c := newComparer(leftPass, rightPass)
	return c.funcType(left.Type, right.Type) && c.node(left.Body, right.Body)
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

// node deliberately handles only AST node families used by Go declarations,
// expressions, and statements. New node types fail closed. New fields on
// existing nodes are not considered until they are added to that node's
// comparator.
func (c *comparer) node(left, right ast.Node) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	if leftExpr, ok := left.(ast.Expr); ok {
		rightExpr, ok := right.(ast.Expr)
		return ok && c.expr(leftExpr, rightExpr)
	}
	if leftStmt, ok := left.(ast.Stmt); ok {
		rightStmt, ok := right.(ast.Stmt)
		return ok && c.stmt(leftStmt, rightStmt)
	}

	switch left := left.(type) {
	case *ast.Field:
		return compareTyped(left, right, c.field)
	case *ast.GenDecl:
		return compareTyped(left, right, c.genDecl)
	case *ast.FuncDecl:
		return compareTyped(left, right, c.funcDecl)
	case *ast.ImportSpec:
		return compareTyped(left, right, c.importSpec)
	case *ast.TypeSpec:
		return compareTyped(left, right, c.typeSpec)
	case *ast.ValueSpec:
		return compareTyped(left, right, c.valueSpec)
	default:
		return false
	}
}

func compareTyped[T any](left *T, right any, compare func(*T, *T) bool) bool {
	rightTyped, ok := right.(*T)
	if !ok {
		return false
	}
	if left == nil || rightTyped == nil {
		return left == nil && rightTyped == nil
	}
	return compare(left, rightTyped)
}

func (c *comparer) expr(left, right ast.Expr) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	leftValue, leftOK := c.replaceableExpr(left, c.leftPass)
	rightValue, rightOK := c.replaceableExpr(right, c.rightPass)
	if leftOK || rightOK {
		return leftOK && rightOK && c.compareReplaceable(leftValue, rightValue)
	}

	switch left := left.(type) {
	case *ast.ArrayType:
		return compareTyped(left, right, c.arrayType)
	case *ast.BasicLit:
		return compareTyped(left, right, c.basicLit)
	case *ast.BinaryExpr:
		return compareTyped(left, right, c.binaryExpr)
	case *ast.CallExpr:
		return compareTyped(left, right, c.callExpr)
	case *ast.ChanType:
		return compareTyped(left, right, c.chanType)
	case *ast.CompositeLit:
		return compareTyped(left, right, c.compositeLit)
	case *ast.Ellipsis:
		return compareTyped(left, right, c.ellipsis)
	case *ast.FuncLit:
		return compareTyped(left, right, c.funcLit)
	case *ast.FuncType:
		return compareTyped(left, right, c.funcType)
	case *ast.Ident:
		return compareTyped(left, right, c.ident)
	case *ast.IndexExpr:
		return compareTyped(left, right, c.indexExpr)
	case *ast.IndexListExpr:
		return compareTyped(left, right, c.indexListExpr)
	case *ast.InterfaceType:
		return compareTyped(left, right, c.interfaceType)
	case *ast.KeyValueExpr:
		return compareTyped(left, right, c.keyValueExpr)
	case *ast.MapType:
		return compareTyped(left, right, c.mapType)
	case *ast.ParenExpr:
		return compareTyped(left, right, c.parenExpr)
	case *ast.SelectorExpr:
		return compareTyped(left, right, c.selectorExpr)
	case *ast.SliceExpr:
		return compareTyped(left, right, c.sliceExpr)
	case *ast.StarExpr:
		return compareTyped(left, right, c.starExpr)
	case *ast.StructType:
		return compareTyped(left, right, c.structType)
	case *ast.TypeAssertExpr:
		return compareTyped(left, right, c.typeAssertExpr)
	case *ast.UnaryExpr:
		return compareTyped(left, right, c.unaryExpr)
	default:
		return false
	}
}

func (c *comparer) stmt(left, right ast.Stmt) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	switch left := left.(type) {
	case *ast.AssignStmt:
		return compareTyped(left, right, c.assignment)
	case *ast.BlockStmt:
		return compareTyped(left, right, c.blockStmt)
	case *ast.BranchStmt:
		return compareTyped(left, right, c.branchStmt)
	case *ast.CaseClause:
		return compareTyped(left, right, c.caseClause)
	case *ast.CommClause:
		return compareTyped(left, right, c.commClause)
	case *ast.DeclStmt:
		return compareTyped(left, right, c.declStmt)
	case *ast.DeferStmt:
		return compareTyped(left, right, c.deferStmt)
	case *ast.EmptyStmt:
		return compareTyped(left, right, c.emptyStmt)
	case *ast.ExprStmt:
		return compareTyped(left, right, c.exprStmt)
	case *ast.ForStmt:
		return compareTyped(left, right, c.forStmt)
	case *ast.GoStmt:
		return compareTyped(left, right, c.goStmt)
	case *ast.IfStmt:
		return compareTyped(left, right, c.ifStmt)
	case *ast.IncDecStmt:
		return compareTyped(left, right, c.incDecStmt)
	case *ast.LabeledStmt:
		return compareTyped(left, right, c.labeledStmt)
	case *ast.RangeStmt:
		return compareTyped(left, right, c.rangeStmt)
	case *ast.ReturnStmt:
		return compareTyped(left, right, c.returnStmt)
	case *ast.SelectStmt:
		return compareTyped(left, right, c.selectStmt)
	case *ast.SendStmt:
		return compareTyped(left, right, c.sendStmt)
	case *ast.SwitchStmt:
		return compareTyped(left, right, c.switchStmt)
	case *ast.TypeSwitchStmt:
		return compareTyped(left, right, c.typeSwitchStmt)
	default:
		return false
	}
}

func (c *comparer) funcDecl(left, right *ast.FuncDecl) bool {
	if left.Name.Name != right.Name.Name || !c.fieldList(left.Recv, right.Recv, false) {
		return false
	}
	return c.funcType(left.Type, right.Type) && c.node(left.Body, right.Body)
}

func (c *comparer) funcType(left, right *ast.FuncType) bool {
	if left == nil || right == nil {
		return left == right
	}
	return c.fieldList(left.TypeParams, right.TypeParams, false) &&
		c.fieldList(left.Params, right.Params, true) &&
		c.fieldList(left.Results, right.Results, true)
}

func (c *comparer) fieldList(left, right *ast.FieldList, bindNames bool) bool {
	if left == nil || right == nil {
		return left == right
	}
	if len(left.List) != len(right.List) {
		return false
	}
	for i, leftField := range left.List {
		if !c.fieldWithBinding(leftField, right.List[i], bindNames) {
			return false
		}
	}
	return true
}

func (c *comparer) field(left, right *ast.Field) bool {
	return c.fieldWithBinding(left, right, false)
}

func (c *comparer) fieldWithBinding(left, right *ast.Field, bindNames bool) bool {
	if left == nil || right == nil {
		return left == right
	}
	if len(left.Names) != len(right.Names) || !c.node(left.Type, right.Type) || !sameStringLiteral(left.Tag, right.Tag) {
		return false
	}
	for i, leftName := range left.Names {
		rightName := right.Names[i]
		if bindNames {
			if !c.bindDefinition(leftName, rightName) {
				return false
			}
		} else if leftName.Name != rightName.Name {
			return false
		}
	}
	return true
}

func sameStringLiteral(left, right *ast.BasicLit) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Kind == token.STRING && right.Kind == token.STRING && left.Value == right.Value
}

func (c *comparer) genDecl(left, right *ast.GenDecl) bool {
	if left.Tok != right.Tok || left.Lparen.IsValid() != right.Lparen.IsValid() || len(left.Specs) != len(right.Specs) {
		return false
	}
	for i, leftSpec := range left.Specs {
		if !c.spec(leftSpec, right.Specs[i]) {
			return false
		}
	}
	return true
}

func (c *comparer) spec(left, right ast.Spec) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	switch left := left.(type) {
	case *ast.ImportSpec:
		return compareTyped(left, right, c.importSpec)
	case *ast.TypeSpec:
		return compareTyped(left, right, c.typeSpec)
	case *ast.ValueSpec:
		return compareTyped(left, right, c.valueSpec)
	default:
		return false
	}
}

func (c *comparer) importSpec(left, right *ast.ImportSpec) bool {
	if left.Path == nil || right.Path == nil || left.Path.Value != right.Path.Value {
		return false
	}
	return sameOptionalIdent(left.Name, right.Name)
}

func (c *comparer) typeSpec(left, right *ast.TypeSpec) bool {
	if left.Name.Name != right.Name.Name || left.Assign.IsValid() != right.Assign.IsValid() {
		return false
	}
	return c.fieldList(left.TypeParams, right.TypeParams, false) && c.expr(left.Type, right.Type)
}

func (c *comparer) valueSpec(left, right *ast.ValueSpec) bool {
	if len(left.Names) != len(right.Names) || len(left.Values) != len(right.Values) {
		return false
	}
	for i, leftName := range left.Names {
		if !c.bindDefinition(leftName, right.Names[i]) {
			return false
		}
	}
	return c.expr(left.Type, right.Type) && c.exprs(left.Values, right.Values)
}

func (c *comparer) arrayType(left, right *ast.ArrayType) bool {
	return c.expr(left.Len, right.Len) && c.expr(left.Elt, right.Elt)
}

func (c *comparer) basicLit(left, right *ast.BasicLit) bool {
	return left.Kind == right.Kind && c.sameExprType(left, right)
}

func (c *comparer) binaryExpr(left, right *ast.BinaryExpr) bool {
	return left.Op == right.Op && c.expr(left.X, right.X) && c.expr(left.Y, right.Y)
}

func (c *comparer) callExpr(left, right *ast.CallExpr) bool {
	return c.callee(left.Fun, right.Fun) &&
		c.exprs(left.Args, right.Args) &&
		left.Ellipsis.IsValid() == right.Ellipsis.IsValid()
}

func (c *comparer) chanType(left, right *ast.ChanType) bool {
	return left.Dir == right.Dir && c.expr(left.Value, right.Value)
}

func (c *comparer) compositeLit(left, right *ast.CompositeLit) bool {
	return left.Incomplete == right.Incomplete && c.expr(left.Type, right.Type) && c.exprs(left.Elts, right.Elts)
}

func (c *comparer) ellipsis(left, right *ast.Ellipsis) bool {
	return c.expr(left.Elt, right.Elt)
}

func (c *comparer) funcLit(left, right *ast.FuncLit) bool {
	return c.funcType(left.Type, right.Type) && c.node(left.Body, right.Body)
}

func (c *comparer) indexExpr(left, right *ast.IndexExpr) bool {
	return c.expr(left.X, right.X) && c.expr(left.Index, right.Index)
}

func (c *comparer) indexListExpr(left, right *ast.IndexListExpr) bool {
	return c.expr(left.X, right.X) && c.exprs(left.Indices, right.Indices)
}

func (c *comparer) interfaceType(left, right *ast.InterfaceType) bool {
	if left.Methods == nil || right.Methods == nil {
		return left.Methods == nil && right.Methods == nil
	}
	return left.Incomplete == right.Incomplete && c.fieldList(left.Methods, right.Methods, false)
}

func (c *comparer) keyValueExpr(left, right *ast.KeyValueExpr) bool {
	return c.expr(left.Key, right.Key) && c.expr(left.Value, right.Value)
}

func (c *comparer) mapType(left, right *ast.MapType) bool {
	return c.expr(left.Key, right.Key) && c.expr(left.Value, right.Value)
}

func (c *comparer) parenExpr(left, right *ast.ParenExpr) bool {
	return c.expr(left.X, right.X)
}

func (c *comparer) selectorExpr(left, right *ast.SelectorExpr) bool {
	return left.Sel.Name == right.Sel.Name && c.expr(left.X, right.X)
}

func (c *comparer) sliceExpr(left, right *ast.SliceExpr) bool {
	return left.Slice3 == right.Slice3 &&
		c.expr(left.X, right.X) &&
		c.expr(left.Low, right.Low) &&
		c.expr(left.High, right.High) &&
		c.expr(left.Max, right.Max)
}

func (c *comparer) starExpr(left, right *ast.StarExpr) bool {
	return c.expr(left.X, right.X)
}

func (c *comparer) structType(left, right *ast.StructType) bool {
	return left.Incomplete == right.Incomplete && c.fieldList(left.Fields, right.Fields, false)
}

func (c *comparer) typeAssertExpr(left, right *ast.TypeAssertExpr) bool {
	return c.expr(left.X, right.X) && c.expr(left.Type, right.Type)
}

func (c *comparer) unaryExpr(left, right *ast.UnaryExpr) bool {
	return left.Op == right.Op && c.expr(left.X, right.X)
}

func (c *comparer) assignment(left, right *ast.AssignStmt) bool {
	if left.Tok != right.Tok || len(left.Lhs) != len(right.Lhs) || len(left.Rhs) != len(right.Rhs) {
		return false
	}
	if left.Tok == token.DEFINE {
		for i, leftExpr := range left.Lhs {
			leftIdent, leftOK := leftExpr.(*ast.Ident)
			rightIdent, rightOK := right.Lhs[i].(*ast.Ident)
			if leftOK != rightOK {
				return false
			}
			if leftOK && !c.bindNewDefinition(leftIdent, rightIdent) {
				return false
			}
		}
	}
	return c.exprs(left.Lhs, right.Lhs) && c.exprs(left.Rhs, right.Rhs)
}

func (c *comparer) blockStmt(left, right *ast.BlockStmt) bool {
	return c.stmts(left.List, right.List)
}

func (c *comparer) branchStmt(left, right *ast.BranchStmt) bool {
	return left.Tok == right.Tok && sameOptionalIdent(left.Label, right.Label)
}

func (c *comparer) caseClause(left, right *ast.CaseClause) bool {
	return c.exprs(left.List, right.List) && c.stmts(left.Body, right.Body)
}

func (c *comparer) commClause(left, right *ast.CommClause) bool {
	return c.stmt(left.Comm, right.Comm) && c.stmts(left.Body, right.Body)
}

func (c *comparer) declStmt(left, right *ast.DeclStmt) bool {
	return c.decl(left.Decl, right.Decl)
}

func (c *comparer) deferStmt(left, right *ast.DeferStmt) bool {
	return c.callExpr(left.Call, right.Call)
}

func (c *comparer) emptyStmt(left, right *ast.EmptyStmt) bool {
	return left.Implicit == right.Implicit
}

func (c *comparer) exprStmt(left, right *ast.ExprStmt) bool {
	return c.expr(left.X, right.X)
}

func (c *comparer) forStmt(left, right *ast.ForStmt) bool {
	return c.stmt(left.Init, right.Init) &&
		c.expr(left.Cond, right.Cond) &&
		c.stmt(left.Post, right.Post) &&
		c.node(left.Body, right.Body)
}

func (c *comparer) goStmt(left, right *ast.GoStmt) bool {
	return c.callExpr(left.Call, right.Call)
}

func (c *comparer) ifStmt(left, right *ast.IfStmt) bool {
	return c.stmt(left.Init, right.Init) &&
		c.expr(left.Cond, right.Cond) &&
		c.node(left.Body, right.Body) &&
		c.stmt(left.Else, right.Else)
}

func (c *comparer) incDecStmt(left, right *ast.IncDecStmt) bool {
	return left.Tok == right.Tok && c.expr(left.X, right.X)
}

func (c *comparer) labeledStmt(left, right *ast.LabeledStmt) bool {
	return left.Label.Name == right.Label.Name && c.stmt(left.Stmt, right.Stmt)
}

func (c *comparer) rangeStmt(left, right *ast.RangeStmt) bool {
	if left.Tok != right.Tok || !c.expr(left.X, right.X) {
		return false
	}
	if left.Tok == token.DEFINE {
		if !c.bindOptionalDefinition(left.Key, right.Key) || !c.bindOptionalDefinition(left.Value, right.Value) {
			return false
		}
	}
	return c.expr(left.Key, right.Key) &&
		c.expr(left.Value, right.Value) &&
		c.node(left.Body, right.Body)
}

func (c *comparer) returnStmt(left, right *ast.ReturnStmt) bool {
	return c.exprs(left.Results, right.Results)
}

func (c *comparer) selectStmt(left, right *ast.SelectStmt) bool {
	return c.node(left.Body, right.Body)
}

func (c *comparer) sendStmt(left, right *ast.SendStmt) bool {
	return c.expr(left.Chan, right.Chan) && c.expr(left.Value, right.Value)
}

func (c *comparer) switchStmt(left, right *ast.SwitchStmt) bool {
	return c.stmt(left.Init, right.Init) && c.expr(left.Tag, right.Tag) && c.node(left.Body, right.Body)
}

func (c *comparer) typeSwitchStmt(left, right *ast.TypeSwitchStmt) bool {
	return c.stmt(left.Init, right.Init) && c.stmt(left.Assign, right.Assign) && c.node(left.Body, right.Body)
}

func (c *comparer) decl(left, right ast.Decl) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	switch left := left.(type) {
	case *ast.FuncDecl:
		return compareTyped(left, right, c.funcDecl)
	case *ast.GenDecl:
		return compareTyped(left, right, c.genDecl)
	default:
		return false
	}
}

func (c *comparer) stmts(left, right []ast.Stmt) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if !c.stmt(left[i], right[i]) {
			return false
		}
	}
	return true
}

func (c *comparer) exprs(left, right []ast.Expr) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if !c.expr(left[i], right[i]) {
			return false
		}
	}
	return true
}

func (c *comparer) callee(left, right ast.Expr) bool {
	switch left := left.(type) {
	case *ast.Ident:
		right, ok := right.(*ast.Ident)
		return ok && left.Name == right.Name && c.ident(left, right)
	case *ast.SelectorExpr:
		right, ok := right.(*ast.SelectorExpr)
		return ok && left.Sel.Name == right.Sel.Name && c.expr(left.X, right.X)
	default:
		return c.expr(left, right)
	}
}

type replaceableValue struct {
	object      types.Object
	literalKind token.Token
	literal     bool
	typ         types.Type
}

func (c *comparer) replaceableExpr(expr ast.Expr, pass *analysis.Pass) (replaceableValue, bool) {
	switch expr := expr.(type) {
	case *ast.BasicLit:
		typ := expressionType(pass, expr)
		return replaceableValue{literalKind: expr.Kind, literal: true, typ: typ}, typ != nil
	case *ast.Ident:
		object := objectOf(pass.TypesInfo, expr)
		if !isLocalValue(pass, object) {
			return replaceableValue{}, false
		}
		return replaceableValue{object: object, typ: object.Type()}, true
	default:
		return replaceableValue{}, false
	}
}

func (c *comparer) compareReplaceable(left, right replaceableValue) bool {
	if left.typ == nil || right.typ == nil || !types.Identical(defaultType(left.typ), defaultType(right.typ)) {
		return false
	}
	if left.literal && right.literal {
		return left.literalKind == right.literalKind
	}
	if left.literal || right.literal {
		return true
	}
	return c.pairObjects(left.object, right.object)
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

func (c *comparer) sameExprType(left, right ast.Expr) bool {
	leftType := defaultType(expressionType(c.leftPass, left))
	rightType := defaultType(expressionType(c.rightPass, right))
	return leftType != nil && rightType != nil && types.Identical(leftType, rightType)
}

func (c *comparer) bindOptionalDefinition(left, right ast.Expr) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	leftIdent, leftOK := left.(*ast.Ident)
	rightIdent, rightOK := right.(*ast.Ident)
	if leftOK != rightOK {
		return false
	}
	return !leftOK || c.bindNewDefinition(leftIdent, rightIdent)
}

func (c *comparer) bindNewDefinition(left, right *ast.Ident) bool {
	leftObject := c.leftPass.TypesInfo.Defs[left]
	rightObject := c.rightPass.TypesInfo.Defs[right]
	if leftObject == nil || rightObject == nil {
		return leftObject == nil && rightObject == nil
	}
	return c.pairObjects(leftObject, rightObject)
}

func (c *comparer) bindDefinition(left, right *ast.Ident) bool {
	if left.Name == "_" || right.Name == "_" {
		return left.Name == right.Name
	}
	return c.bindNewDefinition(left, right)
}

func sameOptionalIdent(left, right *ast.Ident) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.Name == right.Name
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
