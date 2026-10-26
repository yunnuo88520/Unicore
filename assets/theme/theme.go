// Author: yunnuo <ymz@ebox.vip>
// Description: Shared resolved design tokens for transactional mail and native chrome.
package theme

import (
	_ "embed"
	"encoding/json"
)

//go:embed resolved.gen.json
var encoded []byte

type Tokens struct {
	Brand       struct{ Name, Accent string }
	Typography  struct{ Sans, Mono string }
	Light, Dark map[string]string
}

var Current = func() Tokens {
	var result Tokens
	if err := json.Unmarshal(encoded, &result); err != nil {
		panic(err)
	}
	return result
}()
