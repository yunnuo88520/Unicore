//go:build !no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Notes module descriptor: permissions, navigation and storage wiring for the removable reference business.
package notes

import "github.com/yunnuo/unicore/internal/edition"

import (
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
)

// Module aggregates the notes facts the platform registries consume. The HTTP
// mount and desktop contribution register themselves from the module's own
// http and desktop subpackages.
var Module = module.Module{
	Slug:        "notes",
	Title:       "我的笔记",
	Description: "个人笔记样板业务：三级自包含模块树的参考实现",
	Icon:        "NotebookPen",
	Order:       0,
	Permissions: []contracts.PermissionDefinition{
		{ID: "notes:access", Name: "使用我的笔记", Description: "访问笔记页面并查看个人笔记", Group: "业务权限", Assignable: true},
		{ID: "notes:create", Name: "创建笔记", Description: "新建个人笔记", Group: "业务权限", Assignable: true},
		{ID: "notes:update", Name: "编辑笔记", Description: "修改个人笔记内容与状态", Group: "业务权限", Assignable: true},
		{ID: "notes:delete", Name: "删除笔记", Description: "删除个人笔记", Group: "业务权限", Assignable: true},
		{ID: "notes:manage:read", Name: "查看笔记管理", Description: "按数据范围查看笔记标题、作者与状态，不读取正文与附件", Group: "业务权限"},
		{ID: "notes:manage:preview", Name: "预览笔记内容", Description: "在笔记管理中按数据范围查看笔记正文，不读取附件", Group: "业务权限"},
		{ID: "notes:manage:edit", Name: "编辑笔记内容", Description: "在笔记管理中按数据范围编辑笔记标题和正文", Group: "业务权限"},
		{ID: "notes:manage:update", Name: "修改笔记状态", Description: "在笔记管理中按数据范围修改笔记状态", Group: "业务权限"},
		{ID: "notes:manage:delete", Name: "管理删除笔记", Description: "在笔记管理中按数据范围删除笔记", Group: "业务权限"},
	},
	Navigation: []contracts.NavigationPage{
		{ID: "notes", Surfaces: []string{"user"}, Permission: "notes:access"},
		{ID: "note-management", Surfaces: []string{"user"}, Permission: "notes:manage:read"},
	},
	Migrations: "notes",
	Edition:    "notes",
	Enabled:    edition.Notes,
}
