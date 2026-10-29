<!-- Author: yunnuo <ymz@ebox.vip> -->
# 签名 OTA 验收

日期：2026-10-28。需求与边界见 [更新需求](../00-product/feature-updates.md)、[ADR-0018](../adr/ADR-0018-signed-updates.md)、[运维手册](../03-runbooks/updates.md)。本轮不修改应用数据库，没有新增迁移；自动安装仅接受相同框架/业务迁移级别。未修改已发布的 v0.1.1 资产，也未更新现有用户实例。

| 形态 | 影响 | 验收 |
| --- | --- | --- |
| web-platform | 管理员更新入口、六操作中固定 admin 三操作；普通用户版本脱敏 | HTTP 身份/CSRF/Origin 与真实页面 |
| web-standalone | loopback 更新 API、共享页面 | Host/peer/跨站拒绝、内置日志与响应式页面 |
| desktop | 原生 bridge、app/程序更新 helper | macOS 原生构建、离线日志与隔离重启 |
| cli | 不装配更新 | 依赖边界、构建 |
| Docker | 仅检查/历史 | 安装器拒绝 self update；不引入 socket |

核心测试已覆盖 Ed25519 篡改、未知公钥、过期/未来签名、应用/目标/feature/迁移不符、重复目标/资产、降级和缓存篡改。HTTPS adapter 覆盖同源 feed、读写大小和降级重定向拒绝。隔离进程测试使用临时 key/目录，真实运行复制的 helper：1.0.0→1.0.1 启动确认成功、目标启动失败回滚、中断切换后恢复旧程序；保留 sentinel 实例数据。解包测试拒绝路径穿越、绝对路径、非法路径与不匹配 metadata。

本机验证结果：

- `make docs`、`make test`：契约/作者/依赖边界、Go vet/race、前端类型检查与 36 项单测通过。补充测试限制数据目录的符号链接、空路径、准确 target 的启动确认、重启工作目录保持及 Docker 提示优先级。
- 全部浏览器回归：46 项通过、6 项外部服务或特定编译条件跳过；发现 2 项管理流程仍引用旧占位菜单，改为「系统更新」后单独复跑 PC/375px，2 项通过。更新/设置专项共 10 项通过，浅/深色、无页面横向溢出、备份弹窗焦点/Escape/取消均已验证。截图在 `build/acceptance/m3a/`、`build/acceptance/management/`。
- 授权/更新四种编译组合：验证实际 Go 文件、前端裁剪和 PC/375px 页面。CLI 不引入更新渠道或安装器。
- `make release`：本机完成 10 个 Web/CLI 预览包；macOS arm64 真实 Wails 构建及原生品牌校验通过。Windows 安装器测试包交叉编译通过，不能替代实际 Windows 运行。
- Linux arm64：在隔离容器中实际执行复制 helper 的升级/失败回滚/中断恢复测试，全部通过。
- Tar+Nginx（platform/standalone）、Docker、Compose：四种隔离部署均通过安装、重启/容器替换、配置/密钥/数据持久化及权限验收；Docker/Compose 管理员更新页显示日志、禁用自更新。证据在 `build/acceptance/deployment/results.json` 和 `docker-updates.png`、`compose-updates.png`。标准 Dockerfile 构建因 Docker Hub 基础镜像鉴权请求超时未完成；本轮运行验收采用缓存运行时加新编译服务的独立镜像，不能据此宣称标准镜像构建成功。

原生 GUI 升级复现：先 `make build-desktop`，再执行 `node scripts/test-native-update.mjs`；脚本只在随机临时目录创建两份真实 Wails 应用、独立实例/密钥和受控 HTTPS CA。2026-10-28 本机通过页面执行 `0.1.1 → 0.1.2`，任务 `54c3281c565193416c2d41cb93e2de69` 完成，准确版本/target/nonce 启动确认成功；更新前笔记仍可读取。关闭测试渠道后再次检查失败，三条内置/缓存历史仍显示。截图 `build/acceptance/updates/native-updated-offline.png`。测试版本没有修改仓库 VERSION、公开 Release 或现有用户实例；测试应用使用 ad-hoc 签名，不能当作 Developer ID。

平台开发者证书未提供，真实 Developer ID/公证、Windows Authenticode 与三系统生产签名验收未执行；unsigned 与 required 缺凭据拒绝分支已实测。远端三 OS CI 结果另记；本机 macOS 和 Linux 容器不能替代 Windows 原生运行。

GitHub PR #14 首轮实际运行：依赖安全、macOS/Windows 原生测试/构建/打包、标准 Dockerfile 构建与 Docker/Tar 部署任务通过。Linux 原生测试发现 runner 继承了自身 systemd 的 INVOCATION_ID；隔离测试显式清空该继承值，并增加真实服务必须显式选择 supervisor 的拒绝/允许测试，不放宽生产检查。最终提交的完整 CI 结果以 PR checks 为准。

实现提交 01d83ec 的全部 12 项 PR 检查已通过，包括三系统原生更新测试/构建/打包、标准 Docker 构建与部署、数据库与页面回归、四种功能组合、发行包矩阵及依赖安全。

发行者公钥已进入集中配置。2026-10-28 获得维护者明确授权后，已将私钥托管为 yunnuo88520/Unicore 的 GitHub 加密 Secret UNICORE_UPDATE_SIGNING_KEY，并核对远端名称与更新时间；未输出私钥。此前自动审批拒绝的托管动作已由本次明确授权解决。本机仓库外 0600 密钥副本仍保留；私钥不进入源码或发行产物。候选流水线使用该 Secret 签名，缺失或不匹配时拒绝生成可安装目标；本次未触发候选发布。现有 Release 不具备更新清单，仍需后续经授权发行新版本，客户端才能发现真实可安装目标。

## Windows SQLite 启动修复

Windows 盘符无前导斜杠时，旧 url.URL 将 C: 放入 file URI authority，SQLite 打开失败，GUI 无控制台而表现为双击无反应。SQLite adapter 已绝对化路径并补齐 URI 路径斜杠，盘符不作 host；实际文件测试覆盖中文/空格/#/%/&、相对/绝对路径、WAL/外键/忙等待及关闭再打开后的数据保留。影响 desktop、使用 SQLite 的 Web 与离线 ops，CLI 不装配；无数据库格式或迁移变更。

Windows 普通启动错误增加原生对话框，仍退出 1；内部更新 helper 不弹框。原生 CI 用实际 exe 在随机临时数据目录验证 React 页面渲染、数据库初始化、正常退出与再次打开，再以不可用路径验证错误弹窗。分支提交 068f89b 在运行 40695642723 中完成真实 Windows 验收：first-start/reopen 均退出 0、startup-error 弹窗关闭后退出 1。对应 PR 运行 40695652428 的 Windows、macOS、Linux 原生任务及 Docker 构建/部署均通过；本机 make test、Windows 交叉编译及 macOS 原生构建通过。无 schema 变化，不需要数据重建或迁移。

同次分支构建的 windows-exe artifact 为 12819059009，windows-startup-evidence 包含首启/重启/错误对话框截图、可访问性文本与 results.json。068f89b 的 push/PR 两套完整 CI 及依赖安全检查均通过，包括数据库回归、页面测试、四种功能组合、发行包矩阵与三系统原生构建。用户明确要求本人验证通过后再合并，PR #14 保持草稿，未发布新 Release；自动化验收不能代替用户自己的 Windows 环境验证。
