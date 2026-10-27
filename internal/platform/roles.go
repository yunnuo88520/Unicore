// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed administrator/member roles; management permissions cannot be delegated.
package platform

import "github.com/yunnuo/unicore/internal/contracts"

var PermissionCatalog = []contracts.PermissionDefinition{
	{ID: "dashboard:read", Name: "查看仪表盘", Description: "查看用户统计和最近审计记录", Group: "平台概览"},
	{ID: "users:read", Name: "查看用户", Description: "搜索和查看用户账号、角色与状态", Group: "用户管理"},
	{ID: "users:create", Name: "创建用户", Description: "创建管理员或普通用户", Group: "用户管理"},
	{ID: "users:update", Name: "管理用户身份", Description: "启停账号或更换两种固定角色", Group: "用户管理"},
	{ID: "settings:read", Name: "查看实例设置", Description: "查看全局配置、邮件模板和投递状态", Group: "实例设置"},
	{ID: "settings:write", Name: "修改实例设置", Description: "修改品牌、安全、SMTP 与账号策略", Group: "实例设置"},
	{ID: "roles:read", Name: "查看角色权限", Description: "查看管理员与普通用户的固定权限边界", Group: "角色权限"},
}

var Permissions = func() []string {
	result := make([]string, 0, len(PermissionCatalog))
	for _, permission := range PermissionCatalog {
		result = append(result, permission.ID)
	}
	return result
}()

// super_admin is retained as the existing administrator ID for data compatibility.
func IsSuper(user contracts.User) bool {
	return len(user.Roles) == 1 && user.Roles[0] == "super_admin"
}
func BuiltinRole(id string) bool { return id == "super_admin" || id == "user" }
func SuperOnly(permission string) bool {
	for _, definition := range PermissionCatalog {
		if definition.ID == permission {
			return true
		}
	}
	return false
}
