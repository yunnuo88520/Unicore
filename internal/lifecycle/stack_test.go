// Author: yunnuo <ymz@ebox.vip>
// Description: Startup failure cleanup preserves reverse dependency order and all errors.
package lifecycle

import (
	"errors"
	"slices"
	"testing"
)

func TestStackContinuesCleanup(t *testing.T) {
	var stack Stack
	order := []string{}
	first, second := errors.New("first"), errors.New("second")
	stack.Defer("storage", func() error { order = append(order, "storage"); return first })
	stack.Defer("worker", func() error { order = append(order, "worker"); return second })
	err := stack.Close()
	if !errors.Is(err, first) || !errors.Is(err, second) || !slices.Equal(order, []string{"worker", "storage"}) {
		t.Fatalf("cleanup %v %v", order, err)
	}
	if err := stack.Close(); err != nil || len(order) != 2 {
		t.Fatal("cleanup not idempotent")
	}
}
