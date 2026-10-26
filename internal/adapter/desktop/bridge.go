// Author: yunnuo <ymz@ebox.vip>
// Description: Wails-independent bridge with the same DTOs and errors as HTTP.
package desktop

import (
	"context"

	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/usecase"
)

type Bridge struct{ core usecase.Executor }

func New(core usecase.Executor) *Bridge { return &Bridge{core: core} }

func (b *Bridge) Bootstrap() contracts.BootstrapResponse {
	return contracts.BootstrapResponse{Code: "OK", Data: runtime.Metadata(runtime.Desktop, "native"), RequestID: presenter.RequestID()}
}

func (b *Bridge) Execute(input contracts.ExecuteInput) contracts.ExecuteResponse {
	requestID := presenter.RequestID()
	output, err := b.core.Execute(context.Background(), input)
	if err != nil {
		failure := presenter.Error(err, requestID)
		return contracts.ExecuteResponse{Code: failure.Code, Message: failure.Message, RequestID: requestID}
	}
	return contracts.ExecuteResponse{Code: "OK", Data: output, RequestID: requestID}
}
