// Author: yunnuo <ymz@ebox.vip>
// Description: Temporary probe: per-call cost of the host source to explain the bench vs HTTP gap.
package monitor

import (
	"context"
	"testing"
	"time"
)

func TestHostPerCallTimingProbe(t *testing.T) {
	source := DefaultHost(func() string { return t.TempDir() })
	ctx := context.Background()
	for i := 0; i < 8; i++ {
		start := time.Now()
		stats := source(ctx)
		t.Logf("call %d: %v (sampled_at delta from wall: %v)", i, time.Since(start), time.Since(time.Unix(stats.SampledAt, 0)))
	}
}
