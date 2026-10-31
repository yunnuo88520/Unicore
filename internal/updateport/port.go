// Author: yunnuo <ymz@ebox.vip>
// Description: Transport-facing update capability, without provider or installer dependencies.
package updateport

import (
	"context"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
)

type API interface {
	Overview(context.Context) contracts.UpdateOverview
	Check(context.Context) contracts.UpdateOverview
	Apply(context.Context, contracts.UpdateApplyInput) (contracts.UpdateJob, error)
}

var ErrBusy = errors.New("update in progress")
var ErrRejected = errors.New("update rejected")
var ErrUnavailable = errors.New("update source unavailable")
