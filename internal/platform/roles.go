// Author: yunnuo <ymz@ebox.vip>
// Description: Unified role permission catalogue and privileged-account classification.
package platform

import "github.com/yunnuo/unicore/internal/contracts"

// Assignable classifies baseline business permissions granted to new members.
// All roles can hold catalogue points; reserved operations still require super_admin.
// Accounts with management permissions use the stricter session and MFA policies.
var PermissionCatalog = []contracts.PermissionDefinition{
	{ID: "posts:read", Name: "查看岗位", Description: "查看岗位与成员分配", Group: "用户管理"},
	{ID: "posts:write", Name: "管理岗位", Description: "创建、编辑与删除岗位", Group: "用户管理"},
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
	{ID: "departments:read", Name: "查看部门", Description: "查看部门组织树与用户归属", Group: "用户管理"},
	{ID: "departments:write", Name: "管理部门", Description: "创建、编辑与删除部门", Group: "用户管理"},
	{ID: "settings:read", Name: "查看基础设置", Description: "查看站点、品牌、安全和邮件配置", Group: "系统管理"},
	{ID: "settings:write", Name: "修改基础设置", Description: "修改品牌、安全、SMTP 与账号策略", Group: "系统管理"},
	{ID: "roles:read", Name: "查看角色权限", Description: "查看角色清单与权限配置", Group: "角色权限"},
	{ID: "roles:write", Name: "管理角色", Description: "创建、编辑与删除用户角色并分配权限", Group: "角色权限"},
	{ID: "menus:write", Name: "管理菜单", Description: "调整工作空间菜单的顺序、分组与可见性", Group: "角色权限"},
	{ID: "dictionaries:read", Name: "查看数据字典", Description: "查看字典类型与字典项", Group: "角色权限"},
	{ID: "tasks:read", Name: "查看定时任务", Description: "查看定时任务的计划与运行状态", Group: "系统管理"},
	{ID: "tasks:write", Name: "管理定时任务", Description: "启停定时任务并手动触发执行", Group: "系统管理"},
	{ID: "dictionaries:write", Name: "管理数据字典", Description: "维护字典类型与字典项", Group: "角色权限"},
	{ID: "files:access", Name: "使用文件管理", Description: "访问文件管理页面并查看、下载文件", Group: "业务权限", Assignable: true},
	{ID: "files:upload", Name: "上传文件", Description: "发起分片或普通上传并写入文件内容", Group: "业务权限", Assignable: true},
	{ID: "files:delete", Name: "删除文件", Description: "删除本人上传的文件", Group: "业务权限", Assignable: true},
	{ID: "notes:access", Name: "使用我的笔记", Description: "访问笔记页面并查看个人笔记", Group: "业务权限", Assignable: true},
	{ID: "notes:create", Name: "创建笔记", Description: "新建个人笔记", Group: "业务权限", Assignable: true},
	{ID: "notes:update", Name: "编辑笔记", Description: "修改个人笔记内容与状态", Group: "业务权限", Assignable: true},
	{ID: "notes:delete", Name: "删除笔记", Description: "删除个人笔记", Group: "业务权限", Assignable: true},
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
	for _, role := range user.Roles {
		if role == "super_admin" {
			return true
		}
	}
	return false
}
func BuiltinRole(id string) bool { return id == "super_admin" || id == "user" }

// AssignablePermission identifies baseline business grants allowed on the registration role.
func AssignablePermission(permission string) bool { return assignablePermissions[permission] }

// CatalogPermission bounds custom role grants to registered permission points.
func CatalogPermission(permission string) bool {
	for _, definition := range PermissionCatalog {
		if definition.ID == permission {
			return true
		}
	}
	return false
}

// SuperOnlyPermission protects credential and authorization administration inside transactions too.
func SuperOnlyPermission(id string) bool {
	switch id {
	case "roles:write", "administrators:read", "administrators:create", "administrators:update", "settings:write", "updates:apply", "storage:write":
		return true
	}
	return false
}

// HasManagementAccess identifies privileged accounts independently of workspace URLs.
func HasManagementAccess(user contracts.User) bool {
	if IsSuper(user) {
		return true
	}
	for _, p := range user.Permissions {
		for _, def := range PermissionCatalog {
			if p == def.ID && !def.Assignable {
				return true
			}
		}
	}
	return false
}
