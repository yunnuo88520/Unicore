// Author: yunnuo <ymz@ebox.vip>
package desktop

import (
	"github.com/yunnuo/unicore/internal/bootstrap"
	"github.com/yunnuo/unicore/internal/contracts"
	"testing"
)

func TestBridgeProfileAndError(t *testing.T) {
	bridge := New(bootstrap.Core())
	if response := bridge.Bootstrap(); response.Data.Profile != "desktop" || response.Code != "OK" {
		t.Fatalf("bad desktop metadata: %+v", response)
	}
	if response := bridge.Execute(contracts.ExecuteInput{}); response.Code != "INVALID_INPUT" || response.RequestID == "" {
		t.Fatalf("bad error: %+v", response)
	}
}
