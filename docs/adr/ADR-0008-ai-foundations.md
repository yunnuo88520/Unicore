<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0008：可验证的 AI 开发基座

状态：采用。日期：2026-10-26。

框架将主要由 AI 连续维护。只有设计文档而没有可定位的唯一来源、任务流程和漂移检查，容易出现重复契约、错误完成声明以及会话缓存越界。

将 framework.manifest.json、AGENTS.md、docs/README.md、项目内 .agents/skills 和生成上下文一起版本控制。manifest 只提供导航；OpenAPI、主题、品牌、设置注册表和迁移各自继续作为唯一来源。检查文档链接、可用命令、Skill 清单及生成文件，并纳入 make test。Skills 不隐含发布或生产授权，不依赖维护者个人全局安装。

扩展既有 OpenAPI 生成链，产出操作描述、支持子集的校验约束、错误目录和无 CDN 的离线文档；实际 Chi 路由比对契约，handler 继续独立鉴权和处理业务不变量。保留共享 hash 路由与 TanStack Query，新增集中路由元数据、公共 Form 和会话代际边界，不为库齐全而更换路由/状态体系。

Web 配置集中验证优先级；共享结构化日志适配各入口的输出约束。资源按依赖启动、逆序清理，在存储关闭前排空 HTTP。可选独立回环监控端口暴露低基数指标，tracing 保持未实现并明确记录。

代价：Go/TS 的小型校验解释器需用共享样例维护一致性；增加 schema keyword 时必须扩展解释器。文档/Skills 跟随实现验收，不将 manifest 当作能力完成证明。SQL 与迁移来源不变，不引入第二套 GORM schema。
