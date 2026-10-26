// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit permission catalogue and immutable builtin role policy.
package platform

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/yunnuo/unicore/internal/contracts"
)

var (
	ErrRoleNotFound = errors.New("role not found")
	ErrRoleConflict = errors.New("role name already exists")
	ErrBuiltinRole  = errors.New("builtin roles are immutable")
	ErrRoleInUse    = errors.New("role is assigned to users")
)

var PermissionCatalog = []contracts.PermissionDefinition{
	{ID: "dashboard:read", Name: "查看仪表盘", Description: "查看用户统计和最近审计记录", Group: "平台概览", Assignable: true},
	{ID: "users:read", Name: "查看用户", Description: "搜索和查看用户账号、角色与状态", Group: "用户管理", Assignable: true},
	{ID: "users:create", Name: "创建用户", Description: "创建账号，只能授予自身权限范围内的业务角色", Group: "用户管理", Assignable: true},
	{ID: "users:update", Name: "管理用户身份", Description: "启停账号或更换角色，仅限超级管理员", Group: "用户管理", Assignable: false},
	{ID: "settings:read", Name: "查看实例设置", Description: "查看脱敏配置、邮件模板和投递状态", Group: "实例设置", Assignable: true},
	{ID: "settings:write", Name: "修改实例设置", Description: "包含安全、SMTP 与账号策略，仅限超级管理员", Group: "实例设置", Assignable: false},
	{ID: "roles:read", Name: "查看角色", Description: "查看角色、权限清单和关联用户数量", Group: "角色权限", Assignable: true},
	{ID: "roles:write", Name: "管理角色权限", Description: "创建、修改和删除业务角色，仅限超级管理员", Group: "角色权限", Assignable: false},
}

var Permissions = func() []string {
	result := make([]string, 0, len(PermissionCatalog))
	for _, permission := range PermissionCatalog {
		result = append(result, permission.ID)
	}
	return result
}()

func IsSuper(user contracts.User) bool {
	for _, role := range user.Roles {
		if role == "super_admin" {
			return true
		}
	}
	return false
}

func BuiltinRole(id string) bool { return id == "super_admin" || id == "user" }

func SuperOnly(permission string) bool {
	for _, definition := range PermissionCatalog {
		if definition.ID == permission {
			return !definition.Assignable
		}
	}
	return false
}

func ValidateRole(input contracts.RoleInput) bool {
	if input.Name != strings.TrimSpace(input.Name) || utf8.RuneCountInString(input.Name) < 1 || utf8.RuneCountInString(input.Name) > 64 || input.Permissions == nil || len(input.Permissions) > len(PermissionCatalog) {
		return false
	}
	for _, character := range input.Name {
		if unicode.IsControl(character) {
			return false
		}
	}
	seen := map[string]bool{}
	for _, id := range input.Permissions {
		valid := false
		for _, permission := range PermissionCatalog {
			if permission.ID == id && permission.Assignable {
				valid = true
				break
			}
		}
		if !valid || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}
