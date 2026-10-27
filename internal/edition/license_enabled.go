//go:build license

// Author: yunnuo <ymz@ebox.vip>
// Description: Optional license integration port; no client or network request is initialized.
package edition

import "context"

const License = true

type LicenseStatus struct {
	Valid   bool
	Summary string
}

// LicenseProvider is implemented by the product's independent authorization service adapter.
type LicenseProvider interface {
	Check(context.Context) (LicenseStatus, error)
}
