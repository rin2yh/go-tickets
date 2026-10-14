package tabledriven

import (
	"go/ast"
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

func (c *comparer) node(left, right ast.Node) bool {
	if isNilNode(left) || isNilNode(right) {
		return isNilNode(left) && isNilNode(right)
	}
	if reflect.TypeOf(left) != reflect.TypeOf(right) {
		return false
	}

	switch left := left.(type) {
	case *ast.Ident:
		return c.ident(left, right.(*ast.Ident))
	case *ast.BasicLit:
		return left.Kind == right.(*ast.BasicLit).Kind
	case *ast.SelectorExpr:
		right := right.(*ast.SelectorExpr)
		return left.Sel.Name == right.Sel.Name && c.node(left.X, right.X)
	case *ast.CallExpr:
		right := right.(*ast.CallExpr)
		return c.callee(left.Fun, right.Fun) && c.exprs(left.Args, right.Args) && left.Ellipsis.IsValid() == right.Ellipsis.IsValid()
	case *ast.BinaryExpr:
		right := right.(*ast.BinaryExpr)
		return left.Op == right.Op && c.expr(left.X, right.X) && c.expr(left.Y, right.Y)
	case *ast.UnaryExpr:
		right := right.(*ast.UnaryExpr)
		return left.Op == right.Op && c.expr(left.X, right.X)
	case *ast.FuncType:
		return c.funcType(left, right.(*ast.FuncType))
	case *ast.FuncLit:
		right := right.(*ast.FuncLit)
		return c.funcType(left.Type, right.Type) && c.node(left.Body, right.Body)
	case *ast.AssignStmt:
		return c.assignment(left, right.(*ast.AssignStmt))
	case *ast.RangeStmt:
		return c.rangeStmt(left, right.(*ast.RangeStmt))
	case *ast.ValueSpec:
		return c.valueSpec(left, right.(*ast.ValueSpec))
	case *ast.KeyValueExpr:
		right := right.(*ast.KeyValueExpr)
		return c.key(left.Key, right.Key) && c.expr(left.Value, right.Value)
	default:
		return c.value(reflect.ValueOf(left).Elem(), reflect.ValueOf(right).Elem())
	}
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
		rightField := right.List[i]
		if !c.node(leftField.Type, rightField.Type) || !c.value(reflect.ValueOf(leftField.Tag), reflect.ValueOf(rightField.Tag)) || len(leftField.Names) != len(rightField.Names) {
			return false
		}
		for j, leftName := range leftField.Names {
			rightName := rightField.Names[j]
			if bindNames {
				if !c.bindDefinition(leftName, rightName) {
					return false
				}
			} else if leftName.Name != rightName.Name {
				return false
			}
		}
	}
	return true
}

func (c *comparer) assignment(left, right *ast.AssignStmt) bool {
	if left.Tok != right.Tok || len(left.Lhs) != len(right.Lhs) || len(left.Rhs) != len(right.Rhs) {
		return false
	}
	if left.Tok == token.DEFINE {
		for i, leftExpr := range left.Lhs {
			leftIdent, leftOK := leftExpr.(*ast.Ident)
			rightIdent, rightOK := right.Lhs[i].(*ast.Ident)
			if leftOK != rightOK || (leftOK && !c.bindIfDefinitions(leftIdent, rightIdent)) {
				return false
			}
		}
	}
	return c.value(reflect.ValueOf(left.Lhs), reflect.ValueOf(right.Lhs)) && c.exprs(left.Rhs, right.Rhs)
}

func (c *comparer) rangeStmt(left, right *ast.RangeStmt) bool {
	if left.Tok != right.Tok || !c.node(left.X, right.X) {
		return false
	}
	if left.Tok == token.DEFINE {
		if !c.bindOptionalDefinition(left.Key, right.Key) || !c.bindOptionalDefinition(left.Value, right.Value) {
			return false
		}
	}
	return c.node(left.Key, right.Key) && c.node(left.Value, right.Value) && c.node(left.Body, right.Body)
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
	return c.node(left.Type, right.Type) && c.exprs(left.Values, right.Values)
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

func (c *comparer) expr(left, right ast.Expr) bool {
	if isNilNode(left) || isNilNode(right) {
		return isNilNode(left) && isNilNode(right)
	}
	if reflect.TypeOf(left) != reflect.TypeOf(right) {
		if !isReplaceableExpr(c.leftPass.TypesInfo, left) || !isReplaceableExpr(c.rightPass.TypesInfo, right) {
			return false
		}
		leftType := types.Default(c.leftPass.TypesInfo.TypeOf(left))
		rightType := types.Default(c.rightPass.TypesInfo.TypeOf(right))
		return leftType != nil && rightType != nil && types.Identical(leftType, rightType)
	}
	return c.node(left, right)
}

func isReplaceableExpr(info *types.Info, expr ast.Expr) bool {
	switch expr := expr.(type) {
	case *ast.BasicLit:
		return true
	case *ast.Ident:
		return isReplaceableValue(objectOf(info, expr))
	default:
		return false
	}
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
	return !leftOK || c.bindIfDefinitions(leftIdent, rightIdent)
}

func (c *comparer) bindIfDefinitions(left, right *ast.Ident) bool {
	leftObj := c.leftPass.TypesInfo.Defs[left]
	rightObj := c.rightPass.TypesInfo.Defs[right]
	if leftObj == nil || rightObj == nil {
		return leftObj == nil && rightObj == nil && left.Name == right.Name
	}
	return c.pairObjects(leftObj, rightObj)
}

func (c *comparer) bindDefinition(left, right *ast.Ident) bool {
	if left.Name == "_" || right.Name == "_" {
		return left.Name == right.Name
	}
	return c.bindIfDefinitions(left, right)
}

func (c *comparer) key(left, right ast.Expr) bool {
	leftIdent, leftOK := left.(*ast.Ident)
	rightIdent, rightOK := right.(*ast.Ident)
	if leftOK && rightOK {
		leftField := isField(c.leftPass.TypesInfo.Uses[leftIdent])
		rightField := isField(c.rightPass.TypesInfo.Uses[rightIdent])
		if leftField || rightField {
			return leftField && rightField && leftIdent.Name == rightIdent.Name
		}
	}
	return c.node(left, right)
}

func (c *comparer) callee(left, right ast.Expr) bool {
	switch left := left.(type) {
	case *ast.Ident:
		right, ok := right.(*ast.Ident)
		return ok && left.Name == right.Name
	case *ast.SelectorExpr:
		right, ok := right.(*ast.SelectorExpr)
		if !ok || left.Sel.Name != right.Sel.Name {
			return false
		}
		return c.node(left.X, right.X)
	default:
		return c.node(left, right)
	}
}

func (c *comparer) ident(left, right *ast.Ident) bool {
	if left.Name == "_" || right.Name == "_" {
		return left.Name == right.Name
	}
	leftObj := objectOf(c.leftPass.TypesInfo, left)
	rightObj := objectOf(c.rightPass.TypesInfo, right)
	if isReplaceableValue(leftObj) && isReplaceableValue(rightObj) {
		return c.pairObjects(leftObj, rightObj)
	}
	return left.Name == right.Name
}

func (c *comparer) pairObjects(left, right types.Object) bool {
	if !isReplaceableValue(left) || !isReplaceableValue(right) || !types.Identical(left.Type(), right.Type()) {
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

func objectOf(info *types.Info, ident *ast.Ident) types.Object {
	if object := info.Uses[ident]; object != nil {
		return object
	}
	return info.Defs[ident]
}

func isReplaceableValue(object types.Object) bool {
	switch object.(type) {
	case *types.Var, *types.Const:
		return true
	default:
		return false
	}
}

func isField(object types.Object) bool {
	variable, ok := object.(*types.Var)
	return ok && variable.IsField()
}

func isNilNode(node ast.Node) bool {
	if node == nil {
		return true
	}
	value := reflect.ValueOf(node)
	return value.Kind() == reflect.Pointer && value.IsNil()
}

var positionType = reflect.TypeOf(token.Pos(0))

func (c *comparer) value(left, right reflect.Value) bool {
	if !left.IsValid() || !right.IsValid() {
		return left.IsValid() == right.IsValid()
	}
	if left.Type() != right.Type() {
		return false
	}
	if left.Type() == positionType {
		return true
	}

	switch left.Kind() {
	case reflect.Interface:
		if left.IsNil() || right.IsNil() {
			return left.IsNil() == right.IsNil()
		}
		return c.value(left.Elem(), right.Elem())
	case reflect.Pointer:
		if left.IsNil() || right.IsNil() {
			return left.IsNil() == right.IsNil()
		}
		if leftNode, ok := left.Interface().(ast.Node); ok {
			rightNode, ok := right.Interface().(ast.Node)
			return ok && c.node(leftNode, rightNode)
		}
		return c.value(left.Elem(), right.Elem())
	case reflect.Struct:
		for i := 0; i < left.NumField(); i++ {
			field := left.Type().Field(i)
			if ignoredASTField(field.Name) {
				continue
			}
			if !c.value(left.Field(i), right.Field(i)) {
				return false
			}
		}
		return true
	case reflect.Slice, reflect.Array:
		if left.Len() != right.Len() {
			return false
		}
		for i := 0; i < left.Len(); i++ {
			if !c.value(left.Index(i), right.Index(i)) {
				return false
			}
		}
		return true
	default:
		return reflect.DeepEqual(left.Interface(), right.Interface())
	}
}

func ignoredASTField(name string) bool {
	switch name {
	case "Comment", "Comments", "Doc", "Obj", "Scope", "Unresolved":
		return true
	default:
		return false
	}
}
