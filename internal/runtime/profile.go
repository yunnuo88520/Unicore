// Author: yunnuo <ymz@ebox.vip>
// Description: Immutable profile metadata without loading platform modules.
package runtime

import (
	"fmt"

	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/module"
)

const (
	WebPlatform   contracts.Profile = "web-platform"
	WebStandalone contracts.Profile = "web-standalone"
	Desktop       contracts.Profile = "desktop"
	CLI           contracts.Profile = "cli"
)

// DefaultWebProfile is injected per release artifact and remains overridable only at deployment.
var DefaultWebProfile = "web-platform"

func ParseWebProfile(value string) (contracts.Profile, error) {
	if value != string(WebPlatform) && value != string(WebStandalone) {
		return "", fmt.Errorf("invalid web profile %q: use web-platform or web-standalone", value)
	}
	return contracts.Profile(value), nil
}

func Metadata(profile contracts.Profile, deployment string) contracts.Bootstrap {
	features := map[string]bool{}
	for _, item := range module.All() {
		// The CLI assembles no storage or transports, so modules stay off there
		// regardless of their edition tag.
		features[item.Slug] = item.Enabled && profile != CLI
	}
	return contracts.Bootstrap{
		Profile: profile, Version: buildinfo.Version, Commit: buildinfo.Commit,
		BuildTime: buildinfo.BuildTime, Stage: "M1", DeploymentKind: deployment,
		Capabilities: contracts.Capabilities{Execute: true, License: profile != CLI && edition.License, Updater: false, Features: features}, Installed: profile == Desktop || profile == CLI, SiteName: theme.Current.Brand.Name, AdminPath: "/admin",
	}
}
