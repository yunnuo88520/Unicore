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

发行者公钥已生成并进入集中配置；私钥仅在本机仓库外 0600 临时文件，上传 GitHub Secret 被自动审批拒绝，等待明确托管授权。缺 Secret 的候选流水线拒绝 OTA 签名，不输出可安装的未签名目标。现有 Release 不具备更新清单，需要后续经授权发行新版本，客户端才能发现真实可安装目标。
