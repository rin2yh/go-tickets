package testx

import "testing"

type Case[Input, Want any] struct{}

type Table[Input, Want any] struct{}

func NewCase[Input, Want any](string, Input, Want) Case[Input, Want] { return Case[Input, Want]{} }

func NewTable[Input, Want any](*testing.T, ...Case[Input, Want]) Table[Input, Want] {
	return Table[Input, Want]{}
}

func (Table[Input, Want]) Run(func(*testing.T, Input, Want)) {}
