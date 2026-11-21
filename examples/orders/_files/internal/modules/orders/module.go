// Author: yunnuo <ymz@ebox.vip>
// Description: Orders module descriptor: the acceptance example for registerable business consoles.
package orders

import (
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/module"
)

// Module declares the orders facts the platform registries consume. The HTTP
// mount registers from the module's own http subpackage through web.go.
var Module = module.Module{
	Slug:        "orders",
	Title:       "我的订单",
	Description: "订单验收示例：客户、代理与运营工作台的显式授权矩阵",
	Icon:        "ShoppingCart",
	Order:       1,
	Permissions: []contracts.PermissionDefinition{
		{ID: "orders:access", Name: "查看我的订单", Description: "访问订单页面并查看本人订单", Group: "业务权限", Assignable: true},
		{ID: "orders:handle", Name: "处理订单", Description: "在授权范围内处理代理与运营订单", Group: "业务权限", Assignable: true},
	},
	Navigation: []contracts.NavigationPage{
		{ID: "orders", Surfaces: []string{"user"}, Permission: "orders:access"},
	},
	Migrations: "orders",
	Enabled:    true,
}
