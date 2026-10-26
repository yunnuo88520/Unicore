// Author: yunnuo <ymz@ebox.vip>
// Description: Canonical brand bitmap for embedded email images.
package brand

import _ "embed"

//go:embed icon-64.png
var EmailLogo []byte

//go:embed icon-256.png
var AppIcon []byte
