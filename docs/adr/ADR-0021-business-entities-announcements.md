<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0021：业务实体生命周期与平台公告

状态：接受。沿用 ADR-0003 的 database/sql 与显式迁移，不引入第二套 ORM 自动建表。

Go 用结构体嵌入代替类继承。新增可变业务聚合嵌入 `domain.BaseEntity`，统一 ID、UTC Unix 秒创建/更新时间、`deleted_at=0` 活跃标记及乐观版本。Note 与 Announcement 是实际样板；生成 DTO 不是数据库实体，adapter 显式投影。`entity_test.go` 用 AST 发现未嵌入基座的新领域结构体；不可变值对象必须登记有理由的例外。

不对全部物理表强加软删除：session/token/challenge 按过期和撤销清理，用户/管理员采用停用和独立身份表，关系表按主外键维护，审计/迁移账本只追加。盲目给凭据加软删除会让旧会话继续有效，给关联表添加虚假 ID 会损害已有唯一约束。例外及接口/业务/数据层职责集中记录于 [后端基础规范](../02-standards/backend.md)。

平台公告的管理 API 固定 `/api/v1/admin/announcements*`，要求有效管理员、对应 permissions、写请求 CSRF；SQL 写事务在 installation 锁内重查管理员，原子写数据和审计。用户 API 固定 `/api/v1/announcements*`，要求普通用户会话，只读已到发布时间的 published 公告，不公开草稿、内部备注和管理员字段。前端两入口共享 shell、Modal、Form、Switch、Message 与安全内容组件，管理页仅由 admin-app.tsx 导入，用户卡片走 DashboardWidgetRegistry。

SettingDefinition 注册 `announcements.enabled`，平台缺省 true，仅公告专用端点可写。非平台不装配公告表，不发公告请求，不显示卡片或管理页，HTTP 返回 NOT_AVAILABLE；Wails/CLI 没有公告桥接。

公告保存原始业务内容和服务端生成的安全 HTML。Markdown 使用 Goldmark 默认安全模式；HTML 使用标签/属性/链接白名单，禁止脚本、样式、图片、iframe、事件及不安全 URL，浏览器再次白名单处理。公告与邮件模板的自定义内容不翻译，邮件默认主题/正文仍为中文；界面标签双语。

平台迁移 0011 新增公告表，独立 business 0002 为笔记增加软删除。保留所有已发布 checksum；旧笔记默认 deleted_at=0。SQLite/PostgreSQL 使用事务，MySQL 以可重试的单条 additive ALTER 加列/索引，记录版本前重试检查列。当前框架本地=1、平台=11、业务=2。schema 不同的 OTA 包被拒绝，升级前停机备份 DB、data 和实例密钥；回退恢复相同版本备份，不能仅换旧二进制。升级与恢复只能在授权隔离实例验证。
