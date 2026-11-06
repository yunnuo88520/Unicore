// Author: yunnuo <ymz@ebox.vip>
// Description: Permission catalogue with assignable business grants; management permissions stay super-only.
package platform

import "github.com/yunnuo/unicore/internal/contracts"

// Assignable marks permission points a custom user-realm role may hold. Management
// permissions stay false: custom roles can never grant administrator account
// control, role management, framework updates or instance configuration.
var PermissionCatalog = []contracts.PermissionDefinition{
	{ID: "announcements:read", Name: "查看平台公告", Description: "查看公告列表、草稿与配置", Group: "系统管理"},
	{ID: "announcements:write", Name: "管理平台公告", Description: "发布、编辑、删除公告与控制展示", Group: "系统管理"},
	{ID: "updates:read", Name: "查看系统更新", Description: "查看版本、更新历史与检查结果", Group: "系统管理"},
	{ID: "updates:apply", Name: "安装系统更新", Description: "安装可信兼容版本并重启实例", Group: "系统管理"},
	{ID: "admin:access", Name: "访问管理工作台", Description: "使用管理员端的共享业务工具", Group: "管理入口"},
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
	{ID: "roles:read", Name: "查看角色权限", Description: "查看角色清单与权限配置", Group: "角色权限"},
	{ID: "roles:write", Name: "管理角色", Description: "创建、编辑与删除用户角色并分配权限", Group: "角色权限"},
	{ID: "menus:write", Name: "管理菜单", Description: "调整工作空间菜单的顺序、分组与可见性", Group: "角色权限"},
	{ID: "dictionaries:read", Name: "查看数据字典", Description: "查看字典类型与字典项", Group: "角色权限"},
	{ID: "dictionaries:write", Name: "管理数据字典", Description: "维护字典类型与字典项", Group: "角色权限"},
	{ID: "files:access", Name: "使用文件管理", Description: "访问文件管理页面并上传、下载文件", Group: "业务权限", Assignable: true},
	{ID: "notes:access", Name: "使用我的笔记", Description: "访问笔记页面并读写个人笔记", Group: "业务权限", Assignable: true},
}

var Permissions = func() []string {
	result := make([]string, 0, len(PermissionCatalog))
	for _, permission := range PermissionCatalog {
		result = append(result, permission.ID)
	}
	return result
}()

var assignablePermissions = func() map[string]bool {
	result := map[string]bool{}
	for _, permission := range PermissionCatalog {
		if permission.Assignable {
			result[permission.ID] = true
		}
	}
	return result
}()

// super_admin is retained as the existing administrator ID for data compatibility.
func IsSuper(user contracts.User) bool {
	return len(user.Roles) == 1 && user.Roles[0] == "super_admin"
}
func BuiltinRole(id string) bool { return id == "super_admin" || id == "user" }
func SuperOnly(permission string) bool { return !assignablePermissions[permission] }

// AssignablePermission reports whether a permission point exists and may be
// granted to a custom role. Unknown points are refused (fail-closed).
func AssignablePermission(permission string) bool { return assignablePermissions[permission] }
