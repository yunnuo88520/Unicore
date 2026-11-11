// Author: yunnuo <ymz@ebox.vip>
// Description: Notes module descriptor: permissions, navigation and storage wiring for the removable reference business.
package notes

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
	},
	Navigation: []contracts.NavigationPage{
		{ID: "notes", Surfaces: []string{"user", "administrator"}, Permission: "notes:access"},
	},
	Migrations: "notes",
	Edition:    "",
	Enabled:    true,
}
