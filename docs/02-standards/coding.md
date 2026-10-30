<!-- Author: yunnuo <ymz@ebox.vip> -->
# 代码与交付规范

手写 Go/TS/TSX/CSS/Shell/YAML/SQL/HTML/SVG 文件均带合法注释 `Author: yunnuo <ymz@ebox.vip>`；Markdown 在顶部作者元数据。Go build constraint 放在作者头之前，Shell shebang 放在第一行。禁止手改 `*.gen.*`。

严格 JSON 无注释：package.json 通过 author 字段记录，OpenAPI 通过 info.contact，wails.json 通过 author；tsconfig.json 为本规则声明的配置例外。go.sum/pnpm-lock.yaml 为机器生成例外。VERSION 为纯文本版本源，`.gitkeep`、构建输出和三方文件例外。`scripts/check-authors.mjs` 检查所有受支持的手写源码格式。

Go 使用 gofmt、go vet、go test -race；核心输入边界与协议错误须有实际行为测试。前端 strict TypeScript；可恢复失败、空态、加载、成功均需提供。功能 UI 依 AppClient，禁止在页面直接 fetch 或访问 Wails global。响应式测试覆盖 375px，尊重 reduced motion。

OpenAPI 变更后运行 `pnpm generate`；生成器对不支持的类型 fail closed；`pnpm check:contracts` 防止生成产物漂移。生成器当前仅支持文档实际使用的对象、引用、字符串枚举、整数、布尔与数组；新增 union/nullable/security schema 前须扩展生成器并测试。

新增核心模块遵循 ports → usecase → adapter → composition；新增设置、权限、迁移时读取相应 Skill。文档与 ADR 随代码更新。测试不抄实现公式，优先固定已知摘要、不同入口一致性、错误码、越权与恢复行为。

锁文件提交，缓存/二进制/生成静态资源不提交。应用版本只手改 VERSION；包元数据、OpenAPI info.version、Wails productVersion、Go 默认版本都是 scripts/version.mjs 的生成投影，pnpm check:version 阻止漂移。推荐 make version NEW_VERSION=x.y.z 同时准备 Changelog。Go/Node/pnpm/Wails 是工具链版本，不跟随应用版本。禁止将个人数据和生产凭据加入仓库；日志不包含请求体和敏感 headers。源码现采用 [MIT](../../LICENSE)，保留版权和许可声明，第三方内容需核对兼容性；贡献方式见 [CONTRIBUTING](../../CONTRIBUTING.md)。

可变业务实体、层职责、分页、软删除与管理员事务鉴权统一遵守 [后端基础规范](backend.md)。新领域结构体由 entity_test.go 检查 BaseEntity 嵌入；安全状态机和账本不机械改成通用 CRUD。

源码文档只维护可复用指南、规范、当前限制和必要 ADR。一次性审查/验收报告、研发路线图、环境快照和工作区保护记录保存到仓库外或 build/、CI artifact；测试需要的固定输入保留并明确消费者，不以文档清理为由删测试或降低门禁。
