package duplicate

import "testing"

func TestCrossFile(t *testing.T) { // want "テーブル駆動テストに統合"
	result := add(8)
	expect := 9
	if result != expect {
		t.Fatalf("add(8) = %d, want %d", result, expect)
	}
}
