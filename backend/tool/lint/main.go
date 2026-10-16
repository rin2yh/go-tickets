package main

import (
	"github.com/rin2yh/go-tickets/tool/lint/analyzers/tabledriven"
	"github.com/rin2yh/go-tickets/tool/lint/analyzers/tabledrivencomplexity"
	"golang.org/x/tools/go/analysis/multichecker"
)

func main() {
	multichecker.Main(tabledriven.Analyzer, tabledrivencomplexity.Analyzer)
}
