<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 协作约定

开发导航见 [文档入口](docs/README.md)、[生成上下文](docs/04-ai/context.gen.md) 和 `framework.manifest.json`；AI 工作流见 [development.md](docs/04-ai/development.md)。

开始修改前阅读 [产品形态矩阵](docs/00-product/PRD.md)、[架构](docs/01-architecture/architecture.md) 和相关 `docs/adr/`，说明影响的 profile 与验收方式。

1. 依赖向内：`internal/domain` 不依赖传输、数据库或认证；`internal/usecase` 只依赖领域、契约和 ports。CLI 禁止引入 HTTP、Wails、SQL 驱动和平台身份模块。
2. `web-platform`、`web-standalone`、`desktop`、`cli` 分别装配；平台模块不能由桌面或 CLI 引入。不得声称空壳已经具备安装、认证、数据库或升级能力。
3. API/DTO 以 `packages/contracts/openapi.json` 为源；修改后运行 `pnpm generate`，不手改 `*.gen.*`。新增平台 API 必须声明后端权限点，前端隐藏不构成权限控制。
4. 新设置须登记 SettingDefinition；数据库变更须添加分方言迁移、兼容与恢复策略。未验证的数据库不声明支持。
5. 每个手写源码使用合法作者头 `Author: yunnuo <ymz@ebox.vip>`；严格 JSON、锁文件和生成文件按 `docs/02-standards/coding.md` 的例外处理。
6. 功能变更同步更新需求、架构、契约、测试与运行文档；重大选择新增 ADR，避免无关重构。不得写入密码、生产配置、个人数据或真实密钥。
7. 执行 `make docs` 保持契约文档/AI 上下文一致，再执行 `make test` 和相关 profile 构建。桌面原生依赖与交叉编译的限制须如实记入验收报告。不要用 HTTP 服务模拟 Wails 桌面。
8. 更新设计区分 tar 与 Docker；Docker 不挂载 socket、不在容器内覆盖自身二进制。迁移只在当前任务授权的隔离测试或实例启动边界内执行；对外发布、升级与生产部署需要用户对应授权。

开发输出包含：需求与影响矩阵、文件清单、实现及迁移、验证结果、docs/ADR、未验证事项。小改动可合并描述。

任务流程位于 `.agents/skills/`；阅读与你的任务直接相关的 Skill，用户当前指令优先。
