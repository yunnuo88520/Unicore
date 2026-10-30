<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore 协作约定

从 [文档入口](docs/README.md) 和 [任务工作流](docs/04-ai/development.md) 选择相关规范与 Skill；`framework.manifest.json` 和生成地图只提供索引。

开始前核对工作区，说明影响的 profile 与验证方式。按任务读取必要源码和规范；涉及产品范围或重大架构选择时再读对应 PRD/ADR，不遍历全部 docs。

1. 依赖向内：`internal/domain` 不依赖传输、数据库或认证；`internal/usecase` 只依赖领域、契约和 ports。CLI 禁止引入 HTTP、Wails、SQL 驱动和平台身份模块。
2. `web-platform`、`web-standalone`、`desktop`、`cli` 分别装配；平台模块不能由桌面或 CLI 引入。不得声称空壳已经具备安装、认证、数据库或升级能力。
3. API/DTO 以 `packages/contracts/openapi.json` 为源；修改后运行 `pnpm generate`，不手改 `*.gen.*`。新增平台 API 必须声明后端权限点，前端隐藏不构成权限控制。
4. 新设置须登记 SettingDefinition；数据库变更须添加分方言迁移、兼容与恢复策略。未验证的数据库不声明支持。
5. 每个手写源码使用合法作者头 `Author: yunnuo <ymz@ebox.vip>`；严格 JSON、锁文件和生成文件按 `docs/02-standards/coding.md` 的例外处理。
6. 功能变更同步更新需求、架构、契约、测试与运行文档；重大选择新增 ADR，避免无关重构。不得写入密码、生产配置、个人数据或真实密钥。
7. 执行 `make docs` 保持契约文档/AI 上下文一致，再执行 `make test` 和相关 profile 构建。桌面原生依赖与交叉编译的限制须如实报告。不要用 HTTP 服务模拟 Wails 桌面。
8. 更新设计区分 tar 与 Docker；Docker 不挂载 socket、不在容器内覆盖自身二进制。迁移只在当前任务授权的隔离测试或实例启动边界内执行；对外发布、升级与生产部署需要用户对应授权。

交付在会话中说明变更、验证结果与未测项。源码文档只保留可复用使用说明、开发规范和必要 ADR；审查/验收报告、路线图、实验输出、截图流水及工作区记录放 build/、CI artifact 或仓库外，不新增到 docs。真实测试依赖的夹具须保留。

任务流程位于 `.agents/skills/`；阅读与你的任务直接相关的 Skill，用户当前指令优先。

9. 共享前端新增或修改界面必须同时提供中英文：组件用 useI18n/useLocale 与 t，静态路由/选项用 defineMessages 并在渲染时翻译；禁止中文直写后再补翻译。运行 pnpm check:i18n（构建与 make test 均执行），新增设置/权限描述也须补词条。布局只复用 WorkspaceLayout，不在业务页设置侧栏偏移；工作区固定 LTR，忽略旧 RTL 偏好。见 docs/03-runbooks/frontend-foundations.md。
10. 所有新 Git 提交的标题与正文必须使用英文，包括 squash/merge 的最终提交消息；提交前检查完整消息。此规则不改变界面双语、中文文档或用户自定义内容的语言约定，不重写历史提交。
