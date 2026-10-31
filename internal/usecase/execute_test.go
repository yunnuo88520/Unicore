// Author: yunnuo <ymz@ebox.vip>
package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
)

func TestCancelledExecution(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := New().Execute(ctx, contracts.ExecuteInput{Text: "hello"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation: %v", err)
	}
}
