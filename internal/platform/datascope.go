// Author: yunnuo <ymz@ebox.vip>
// Description: Data-scope resolution types shared by modules that filter user-owned rows.
package platform

// Data scope enum values persisted on unicore_roles.data_scope. Unknown values
// resolve to ScopeSelf (fail-closed) everywhere.
const (
	ScopeAll       = "all"
	ScopeDept      = "dept"
	ScopeDeptBelow = "dept_and_below"
	ScopeCustom    = "custom"
	ScopeSelf      = "self"

	// MaxScopeUserIDs is retained for callers choosing batch sizes. It is not a
	// visibility limit: repositories split larger sets into bounded SQL batches.
	MaxScopeUserIDs = 500
)

// ScopeFilter is the resolved visibility of one session: either unrestricted,
// or restricted to an explicit set of platform user ids (always containing the
// session user). Modules translate it into their own row filters without
// cross-database joins.
type ScopeFilter struct {
	All     bool
	UserIDs []string
}

// Self reports whether the filter degrades to the personal-only behaviour.
func (f ScopeFilter) Self() bool { return !f.All && len(f.UserIDs) == 0 }

// Contains checks a target against the resolved resource scope.
func (f ScopeFilter) Contains(id string) bool {
	if f.All {
		return true
	}
	for _, allowed := range f.UserIDs {
		if allowed == id {
			return true
		}
	}
	return false
}
