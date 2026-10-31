// Author: yunnuo <ymz@ebox.vip>
// Description: Shared application service used by HTTP, Wails and CLI adapters.
package usecase

import (
	"context"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
)

// Executor is the common application port. It needs no database or transport.
type Executor interface {
	Execute(context.Context, contracts.ExecuteInput) (contracts.ExecuteOutput, error)
}

type Service struct{}

func New() *Service { return &Service{} }

func (s *Service) Execute(ctx context.Context, input contracts.ExecuteInput) (contracts.ExecuteOutput, error) {
	if err := ctx.Err(); err != nil {
		return contracts.ExecuteOutput{}, err
	}
	result, err := domain.Analyze(input.Text)
	if err != nil {
		return contracts.ExecuteOutput{}, err
	}
	return contracts.ExecuteOutput{
		Characters: result.Characters, Words: result.Words, Lines: result.Lines,
		Bytes: result.Bytes, Sha256: result.SHA256,
	}, nil
}
