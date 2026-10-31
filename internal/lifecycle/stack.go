// Author: yunnuo <ymz@ebox.vip>
// Description: Composition roots release successfully started components in reverse order, preserving errors.
package lifecycle

import (
	"errors"
	"fmt"
)

type cleanup struct {
	name  string
	close func() error
}
type Stack struct{ items []cleanup }

func (stack *Stack) Defer(name string, close func() error) {
	stack.items = append(stack.items, cleanup{name, close})
}
func (stack *Stack) Close() error {
	var result error
	for index := len(stack.items) - 1; index >= 0; index-- {
		item := stack.items[index]
		if err := item.close(); err != nil {
			result = errors.Join(result, fmt.Errorf("close %s: %w", item.name, err))
		}
	}
	stack.items = nil
	return result
}
