// Author: yunnuo <ymz@ebox.vip>
// Description: Shared repository errors for mutable business aggregates, mapped at each transport boundary.
package usecase

import "errors"

var ErrEntityNotFound = errors.New("entity not found")
var ErrEntityConflict = errors.New("entity version conflict")
