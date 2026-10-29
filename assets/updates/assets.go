// Author: yunnuo <ymz@ebox.vip>
// Description: Offline release history and public OTA trust configuration; contains no private key.
package updateassets

import _ "embed"

//go:embed config.json
var Config []byte

//go:embed history.gen.json
var History []byte
