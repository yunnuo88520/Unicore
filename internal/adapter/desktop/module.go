// Author: yunnuo <ymz@ebox.vip>
// Description: Desktop module contributions: bridge capabilities injected by registered modules.
package desktop

import (
	"github.com/yunnuo/unicore/internal/files"
	"sort"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/settings"
	"github.com/yunnuo/unicore/internal/usecase"
)

// BridgeDeps carries what a module's desktop contribution may rely on.
type BridgeDeps struct {
	Files    *files.Service
	Core     usecase.Executor
	Settings *settings.Service
	Store    *sqlstore.Store
}

// BridgeContribution attaches a module's native capabilities to the bridge.
type BridgeContribution func(b *Bridge, deps BridgeDeps)

var bridgeContributions = map[string]BridgeContribution{}

// RegisterBridgeContribution lets a module attach native behaviour; called from
// the module's desktop subpackage init and applied by NewLocal.
func RegisterBridgeContribution(slug string, contribution BridgeContribution) {
	if _, exists := bridgeContributions[slug]; exists {
		panic("desktop contribution for module " + slug + " is already registered")
	}
	bridgeContributions[slug] = contribution
}

func applyBridgeContributions(b *Bridge, deps BridgeDeps) {
	slugs := make([]string, 0, len(bridgeContributions))
	for slug := range bridgeContributions {
		slugs = append(slugs, slug)
	}
	sort.Strings(slugs)
	for _, slug := range slugs {
		bridgeContributions[slug](b, deps)
	}
}
