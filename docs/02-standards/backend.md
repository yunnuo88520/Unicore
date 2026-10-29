<!-- Author: yunnuo <ymz@ebox.vip> -->
# 后端基础规范

Go 采用组合：可变业务实体嵌入 `internal/domain/entity.go` 的 BaseEntity。ID 由服务端安全随机生成；created_at/updated_at/deleted_at 均为 UTC Unix 秒，0 表示未删除；version 从 1 开始。更新和软删除必须按 `id + version + deleted_at=0` 条件写入，原子递增版本及更新时间。未找到与版本冲突分别映射统一 404/409，不能覆盖别人的更新或复活已删除数据。domain/entity_test.go 会发现新领域结构体并检查基座；纯值对象要登记例外及理由。

| 层 | 负责 | 禁止 |
| --- | --- | --- |
| OpenAPI | DTO、约束、操作、错误目录、身份域、profile/权限/CSRF 元数据 | 手改生成 DTO，按业务实体直接序列化 |
| HTTP/Wails 入口 | 解码、契约校验、会话/权限/CSRF、服务端 scope、响应投影 | 信任请求中的 actor、realm、role 或 owner，页面隐藏代替后端鉴权 |
| domain | 业务实体和纯规则 | HTTP、SQL、认证、环境读取 |
| usecase | 用例、业务校验、Repository/内容/附件 ports、时间依赖 | SQL、平台身份、框架 transport |
| SQL adapter | 参数绑定、固定排序、作用域/软删除、事务、并发检查、审计 | 外部输入拼 SQL 标识符，缺少 deleted_at 条件，返回数据库错误原文 |
| bootstrap | 按 profile 装配实际 adapter | 让桌面/CLI 引入平台身份、SMTP 或公告 |

分页复用 domain.ValidPage/PageOffset；页码 1–100000，单页不超过 50，列表响应统一 items/total/page/page_size。每个接口定义稳定排序及 tie-break ID；页码排序验证、LIKE 字面量转义、SQL 参数绑定各自不可省略。公告和笔记各自保留窄的业务 query，避免设计任意 SQL 查询器。

管理员与普通用户使用不同数据库身份表、会话 Cookie 和固定 API 路径。所有管理资源（包含只读）位于 `/api/v1/admin/*`，声明权限和 superAdmin 并实际调用 require；写请求还需 CSRF/Origin。在安装锁内重查操作者以防请求鉴权后的停用竞争，参考 platformsql.AuthorizeAdministrator 和 announcementsql.transaction。用户路径只返回本人或业务明确开放的最小投影，不提供管理 DTO；公告用户读取不包含内部备注、草稿、版本及管理员 ID。真实 Chi 路由与契约比对、身份域/CSRF 矩阵纳入 make test。

数据库实体与 DTO 分离：手写领域实体嵌入公共字段；SQL adapter 映射生成 DTO，客户端不得提交 id/created_at/updated_at/deleted_at/actor。更新请求只接收必要 version。当前 Note 的既有 Repository DTO port 为兼容 Wails 保留，实体在 adapter 映射；Announcement 则完整展示 domain port → DTO 的新模块推荐结构。

以下物理表有明确不同生命周期，不能机械添加通用软删除或伪造公共 ID：

| 类别 | 当前策略 |
| --- | --- |
| users / administrators | 各自 identity repository；停用撤销本域凭据，保护最后管理员；不提供删除接口 |
| sessions / tokens / challenges / oidc_flows | 过期、一次性消耗、撤销及清理；不能软删除后仍参与验证 |
| roles / permissions / join tables | 固定角色，主外键与联合唯一键；不存在通用业务聚合 ID |
| schema/business_migrations、audit_logs/audit_metadata | 追加账本或快照，保留历史，不提供业务编辑/软删 |
| install_state / system_settings | 单例/自然键配置，安装锁、SettingDefinition 和专用校验 |
| 文件元数据/位置/清理任务、邮件队列、企业绑定 | 沿用已发布的专门状态机、引用完整性、清理/重试语义；不可绕过生命周期改成普通 CRUD |
| Analysis 等纯值对象 | 不持久化，无实体身份和删除状态 |

新增模块若属于上述专门类别，必须在设计/ADR 说明原因并验证对应撤销/清理约束；其余可变业务聚合必须使用 BaseEntity。不要修改历史迁移 checksum，不在已有安全表上进行无关重构。

操作日志分为操作类型、操作目标和变更摘要；详情只写字段名、安全状态变化、版本变化等，禁止密码、授权码、SMTP 密钥和完整正文。没有详情的历史记录展示 `—`，不以操作名称假充详情，也不回填无法证实的历史。

公告的完整扩展示例见 [运行说明](../03-runbooks/announcements.md) 和 [ADR-0021](../adr/ADR-0021-business-entities-announcements.md)。新功能需同步契约、权限、分方言迁移、双语 UI、docs/Skills；依次运行 make docs、make test、相关 profile 构建与真实页面验证。
