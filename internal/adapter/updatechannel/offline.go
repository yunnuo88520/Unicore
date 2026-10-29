// Author: yunnuo <ymz@ebox.vip>
// Description: Derived applications without an update source retain their embedded history safely.
package updatechannel

import (
	"context"
	"github.com/yunnuo/unicore/internal/updates"
	"io"
)

type Offline struct{}

func (Offline) Name() string { return "未配置更新渠道" }
func (Offline) Releases(context.Context) ([]updates.Release, error) {
	return nil, updates.ErrUnavailable
}
func (Offline) Read(context.Context, string, int64) ([]byte, error) {
	return nil, updates.ErrUnavailable
}
func (Offline) Download(context.Context, string, io.Writer, int64, func(int64)) error {
	return updates.ErrUnavailable
}
