// Author: yunnuo <ymz@ebox.vip>
// Description: Native update bridge uses the same domain API and response envelopes without loading HTTP identity.
package desktop

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updateport"
)

func (b *Bridge) SetUpdates(api updateport.API) { b.updates = api }
func (b *Bridge) Updates() contracts.UpdateOverviewResponse {
	if b.updates == nil {
		return contracts.UpdateOverviewResponse{Code: "NOT_AVAILABLE", Message: "此版本未启用系统更新", RequestID: presenter.RequestID()}
	}
	return contracts.UpdateOverviewResponse{Code: "OK", Data: b.updates.Overview(context.Background()), RequestID: presenter.RequestID()}
}
func (b *Bridge) CheckUpdate() contracts.UpdateOverviewResponse {
	if b.updates == nil {
		return b.Updates()
	}
	return contracts.UpdateOverviewResponse{Code: "OK", Data: b.updates.Check(context.Background()), RequestID: presenter.RequestID()}
}
func (b *Bridge) ApplyUpdate(input contracts.UpdateApplyInput) contracts.UpdateJobResponse {
	if b.updates == nil {
		return contracts.UpdateJobResponse{Code: "NOT_AVAILABLE", Message: "此版本未启用系统更新", RequestID: presenter.RequestID()}
	}
	job, e := b.updates.Apply(context.Background(), input)
	if e != nil {
		code := "UPDATE_REJECTED"
		if errors.Is(e, updateport.ErrBusy) {
			code = "UPDATE_BUSY"
		}
		return contracts.UpdateJobResponse{Code: code, Message: contracts.ErrorCatalog[code].Message, RequestID: presenter.RequestID()}
	}
	return contracts.UpdateJobResponse{Code: "OK", Data: job, RequestID: presenter.RequestID()}
}
