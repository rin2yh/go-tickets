package duplicate

import "testing"

func TestShadowedValuesOne(t *testing.T) {
	value := identity(1)
	{
		value := identity(2)
		if !sameValue(any(value), any(2)) {
			t.Fatal(value)
		}
	}
	if !sameValue(any(value), any(1)) {
		t.Fatal(value)
	}
}

func TestShadowedValuesTwo(t *testing.T) {
	value := identity(3)
	{
		value := identity(4)
		if !sameValue(any(value), any(4)) {
			t.Fatal(value)
		}
	}
	if !sameValue(any(value), any(3)) {
		t.Fatal(value)
	}
}
