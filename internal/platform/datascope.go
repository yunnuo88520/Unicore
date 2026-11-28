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
// or restricted to explicit platform user and department sets. DataScope expands
// members and retains the session user; DepartmentScope skips member expansion.
// Modules choose the ownership dimension and translate it into row filters without
// cross-database joins.
type ScopeFilter struct {
	All     bool
	UserIDs []string
	// DepartmentIDs describes current resource ownership, independently of its
	// audit creator. Empty departments remain visible without enumerating users.
	DepartmentIDs []string
}

// Self reports whether the filter degrades to the personal-only behaviour.
func (f ScopeFilter) Self() bool { return !f.All && len(f.UserIDs) == 0 && len(f.DepartmentIDs) == 0 }

// ContainsDepartment checks a department-owned resource. An absent department
// is not an ownership grant, even for All; modules must explicitly model any
// instance-owned resources separately.
func (f ScopeFilter) ContainsDepartment(id string) bool {
	if id == "" {
		return false
	}
	if f.All {
		return true
	}
	for _, allowed := range f.DepartmentIDs {
		if allowed == id {
			return true
		}
	}
	return false
}

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
