// Author: yunnuo <ymz@ebox.vip>
// Description: Fixed administrator/member roles; management permissions cannot be delegated.
package platform

import "github.com/yunnuo/unicore/internal/contracts"

var PermissionCatalog = []contracts.PermissionDefinition{
	{ID: "storage:read", Name: "查看对象存储", Description: "查看存储位置与文件策略", Group: "系统管理"},
	{ID: "storage:write", Name: "管理对象存储", Description: "测试、切换、迁移与清理文件", Group: "系统管理"},
	{ID: "logs:read", Name: "查看系统日志", Description: "查看审计与邮件投递记录", Group: "系统管理"},
	{ID: "administrators:read", Name: "查看管理员", Description: "查看独立管理员账号", Group: "用户管理"},
	{ID: "administrators:create", Name: "新增管理员", Description: "创建独立后台账号", Group: "用户管理"},
	{ID: "administrators:update", Name: "管理管理员", Description: "启停管理员，保护最后管理员", Group: "用户管理"},
	{ID: "users:read", Name: "查看用户", Description: "搜索和查看用户账号、角色与状态", Group: "用户管理"},
	{ID: "users:create", Name: "创建用户", Description: "创建普通用户", Group: "用户管理"},
	{ID: "users:update", Name: "管理用户身份", Description: "启停普通用户账号", Group: "用户管理"},
	{ID: "settings:read", Name: "查看基础设置", Description: "查看站点、品牌、安全和邮件配置", Group: "系统管理"},
	{ID: "settings:write", Name: "修改基础设置", Description: "修改品牌、安全、SMTP 与账号策略", Group: "系统管理"},
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
