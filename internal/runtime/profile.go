// Author: yunnuo <ymz@ebox.vip>
// Description: Immutable profile metadata without loading platform modules.
package runtime

import (
	"fmt"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/contracts"
)

const (
	WebPlatform   contracts.Profile = "web-platform"
	WebStandalone contracts.Profile = "web-standalone"
	Desktop       contracts.Profile = "desktop"
	CLI           contracts.Profile = "cli"
)

// DefaultWebProfile is injected per release artifact and remains overridable only at deployment.
var DefaultWebProfile = "web-standalone"

func ParseWebProfile(value string) (contracts.Profile, error) {
	if value != string(WebPlatform) && value != string(WebStandalone) {
		return "", fmt.Errorf("invalid web profile %q: use web-platform or web-standalone", value)
	}
	return contracts.Profile(value), nil
}

func Metadata(profile contracts.Profile, deployment string) contracts.Bootstrap {
	return contracts.Bootstrap{
		Profile: profile, Version: buildinfo.Version, Commit: buildinfo.Commit,
		BuildTime: buildinfo.BuildTime, Stage: "M1", DeploymentKind: deployment,
		Capabilities: contracts.Capabilities{Execute: true},
	}
}
