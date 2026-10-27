<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0012：平台固定管理员/普通用户与客户端外观

状态：采纳，2026-10-27；取代 ADR-0006 的业务角色编辑与委派方案。

用户明确只需要两种角色：管理员管理整实例，普通用户使用业务与本人账号。全局配置对所有用户生效，但管理界面及 API 的读取和修改都属于管理员。当前客户端外观是唯一可在普通用户设置入口编辑的偏好。

沿用 super_admin/user 数据 ID，每用户一种角色，显示为管理员/普通用户。删除角色写 API/SDK/RoleInput，目录与矩阵只读。权限源 internal/platform/roles.go；只有恰好关联 super_admin 的用户得到管理权限，DB role_permissions 残留 grant 不能授权。HTTP 对所有管理端点校验固定管理员，用户写入事务再复核当前操作者；保留最后启用管理员/最后本地密码管理员规则。OpenAPI 同时声明管理员要求，前端统一守卫只负责交互。

平台 settings 服务不适用 appearance 分组；bootstrap 不返回服务器默认主题，PATCH 拒绝全局 appearance.theme。普通用户设置页只挂载本地主题卡片，不请求管理 API；管理员外观标签使用同一 localStorage 保存方式。单机/桌面继续使用其本地持久主题，不引入平台身份。公开品牌、页脚和最小登录策略继续服务所有用户，敏感配置不进入公共响应。

平台迁移 0007 保留管理员及账号字段：移除 custom 关联，管理员优先，无内置角色者归 user；删除自定义角色/非管理员 grant/roles:write 和平台全局主题。撤销全部 session、账号 token、六位挑战与 OIDC flow，取消 pending/sending 邮件并清除载荷。历史 checksum 不变；新空库和旧版数据均验证，MySQL DML 可在中断后幂等重试。

代价：既有自定义角色权限被收回，管理员需按两角色重新确认身份；所有用户重新登录，未完成账号流程重新申请。不能只切回旧 binary 恢复角色；须停服成套恢复原生一致性 DB、私有数据目录、配置、密钥和匹配版本。未在用户真实数据上执行迁移。操作说明见 [部署手册](../03-runbooks/deployment.md)。

验证见 [权限验收](../04-ai/acceptance-permissions.md)：所有管理 API、残留授权越权、最后管理员、三方言迁移/凭据失效、PC/375px 页面及两个独立浏览器的外观隔离。
