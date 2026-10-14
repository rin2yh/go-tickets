package main

import (
	"fmt"
	"os"

	"github.com/rin2yh/go-tickets/tool/lint/analyzers/tabledriven"
	"golang.org/x/tools/go/analysis/multichecker"
)

func main() {
	dir, args, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := os.Chdir(dir); err != nil {
		fmt.Fprintf(os.Stderr, "change working directory to %q: %v\n", dir, err)
		os.Exit(2)
	}
	if len(args) == 0 {
		args = []string{"./..."}
	}
	os.Args = append([]string{os.Args[0]}, args...)
	multichecker.Main(tabledriven.Analyzer)
}

func parseArgs(args []string) (dir string, remaining []string, err error) {
	dir = "."
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--dir" || arg == "-dir":
			if i+1 == len(args) {
				return "", nil, fmt.Errorf("%s requires a directory", arg)
			}
			i++
			dir = args[i]
		case len(arg) > len("--dir=") && arg[:len("--dir=")] == "--dir=":
			dir = arg[len("--dir="):]
		case len(arg) > len("-dir=") && arg[:len("-dir=")] == "-dir=":
			dir = arg[len("-dir="):]
		default:
			remaining = append(remaining, arg)
		}
	}
	return dir, remaining, nil
}
