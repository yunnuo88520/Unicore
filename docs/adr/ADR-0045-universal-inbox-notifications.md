<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0045：通用站内通知（登记式投递 + 铃铛中心化）

状态：采纳（分期落地）。第一期只改变平台版的呈现与模块投递口径；单机装配在第二期单独验收后才生效。取代 `docs/03-runbooks/notifications.md` 中「平台公告的顶部铃铛仍独立管理公告，不是渠道消息收件箱」的边界表述。

## 功能声明

- 功能领域 / 归属层：通知消息，产品功能；把顶部铃铛从公告专用面板升级为面向全部模块的站内通知收件箱，为功能模块任务、监控告警、公告及后续新模块提供统一投递与查看能力。
- Platform：已实现（本期）。铃铛气泡面板对两个会话域开放：用户域承载公告与通知两类来源；管理员域仅承载通知 tab（模块/系统通知按账号投递，公告受众模型不变）。模块经登记式门面投递。
- Standalone 两载体 / CLI：待第二期装配。第二期落地前维持不装配（设计现状，见 product-forms §3）；装配需要本地收件人约定、契约 profiles 放开与 handler 自查，并同步矩阵为已实现。
- 访问主体：Platform 用户域本人会话（inbox 端点保持 session-only、无新权限点）；写操作仍要求 CSRF，SSE 会话复核不变。
- 持久化：复用 platform@1 的 `unicore_inbox_messages`（type/source_id/title/body/read_at），无新表；公告首读账本 `unicore_announcement_reads` 不变。
- 契约：无新增 operation（GET /inbox、read-all、{id}/read、/events 均复用）；类型治理发生在投递门面层，不进入 OpenAPI。
- 菜单与页面呈现：无新页面；顶部铃铛改为 Radix Popover 气泡（440px），由 `@unicore/ui` 的 NotificationCenter 合成件承载。
- 依赖：platformsql.DeliverInbox（事务内投递、source_id 幂等）、realtime.Hub（inbox.new）、既有公告 usecase/SSE。
- 关联：公告功能（保持现状）、D22 告警渠道边界（平台外部渠道仍走 notifycontent，不因本能力改变）。
- 待决策事项：无；分两期与登记式治理由维护者明确指定。

## 决策

1. **登记式类型治理**。模块投递前必须在装配期向 `internal/notify.Registry` 登记类型（type + 中英文名称，≤32 字符、全局唯一）；未登记类型在门面处拒绝，不能绕过。存量表中非登记类型的历史行不受影响，仅新投递受控。初始登记 `announcement`（公告投递）与 `system`（系统）。
2. **投递走门面**。模块在自身事务内调用 `notify.Notifier.Deliver`（校验登记后复用 `platformsql.DeliverInbox`：非空 source_id 按 (recipient,type,source_id) 更新不置读，空 source_id 独立插入）；提交成功后经 `hub.PublishMany(recipients, inbox.new)` 通知客户端。公告事务迁移为优先走门面，未注入门面的旧构造保留直连兜底。
3. **操作按钮（actions）**。投递可附带至多 4 个按钮 `{id,label,href?}`（platform@2 的 `unicore_inbox_messages.actions` JSON 列，契约 `InboxAction`）：href 为站内路径时铃铛面板点击经路由导航（下载产物、查看日志、打开审批页等站内查看/操作入口），外部 https 由前端整体跳转；按钮不改变已读语义，已读仍以点开条目/标记为准。无 actions 的投递保持纯文本通知。
4. **铃铛中心化呈现**。顶部铃铛改为锚定气泡（Radix Popover，440px），面板由受控合成件 `composites.NotificationCenter` 承载：标题 + 未读计数 + 分段 tab（计数 pill）+ 状态圆盘条目（neutral/information/success/error）+ 未读点 + 条目操作 + 空态。用户域为公告/通知双 tab，公告 tab 保留分页、详情对话框与首次已读流程，通知 tab 点条目展开正文并标记已读；管理员域仅通知 tab——收件箱按统一账号 ID 投递，管理员会话读取同一账号的收件箱，公告受众模型不向管理员扩展。
5. **SSE 与收件箱端点对两个会话域开放**。`/api/v1/inbox*` 与 `/api/v1/events` 的会话校验本就按 cookie 解析（管理员会话的 actor 即同一统一账号），契约 realm 字段仅是权限授予的分组元数据（收件箱端点不可授予）；SDK 端移除管理员不订阅 events 的短路。
4. **点外关闭语义分层**：气泡面板点外关闭（浮层惯例）；正式弹窗公告维持禁遮罩/禁 Escape（显式标为已读）；其余模态按 ADR-0045 前的专项修复一律禁遮罩关闭，显式按钮与 Escape 有效。
6. **公告行为零变更**：类型契约枚举不变（info/success/warning/error 仍可渲染存量数据），编辑器仅提供通知/重要提醒；受众、有效期、开关、SSE、首读语义全部沿用公告手册。
7. **第二期（单机装配）另行走查**：本地收件人约定、SSE/轮询选择、契约 profiles 放开、handler 自查、product-forms 矩阵与 feature-inventory 改「已实现」。本 ADR 记录裁决方向，不使第二期未实现状态被宣称为实现。

## 验证边界

第一期回归：登记式治理（重复/未登记/双语缺失拒绝）、门面投递与失败不推送、公告事务走门面的存储套件、合成件受控边界（tab/激活/操作/空态）、铃铛气泡双 tab 与明暗双主题、公告详情首读与正式弹窗禁外点。浏览器覆盖 chromium/mobile 双视口与中英文。
