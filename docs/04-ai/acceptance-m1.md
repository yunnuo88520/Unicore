<!-- Author: yunnuo <ymz@ebox.vip> -->
# M1 验收报告

日期：2026-10-26（Asia/Shanghai） · 版本：0.1.0 · 作者：yunnuo / ymz@ebox.vip

## 需求与影响

依据设计 v1.1 第 19 节，空仓库本次交付 M1 跨形态最小闭环。四个 profile 均复用无状态文本分析 usecase；Web 两 profile 使用 HTTP，desktop 使用原生 Wails，cli 直接调用。没有安装/身份/SQL 强依赖，bootstrap 不宣称未来功能已经实现。

## 文件与交付

- 入口 `cmd/{server,desktop,cli}`，领域/用例/薄 adapter，以及 buildinfo/runtime/bootstrap。
- `packages/contracts/openapi.json` 与生成 Go/TS 模型、共享 SDK/双 transport、共享 React 工作台/实验室/外观与 WidgetRegistry、两个 shell。
- Makefile、pnpm workspace/锁文件、Go modules/锁文件、单测与 E2E、CI 三类 job、契约/作者/依赖边界检查。
- AGENTS.md、8 个已校验项目 Skills、原始设计基线、PRD、架构、规范、部署手册、AI 模板与 2 个 ADR。
- tar 预览包/manifest/checksums、Nginx/systemd 与 Docker 开发模板。没有数据库迁移，因为 M1 没有 schema。

## 实测结果

环境：macOS darwin/arm64、Go 1.26.0、Node 22.21.1、pnpm 11.25.0、Wails 2.12.0、Docker 29.2.0。

| 检查 | 结果与证据 |
| --- | --- |
| `make test` | 通过：生成契约一致、作者标识、真实依赖图、go vet、go test -race、TypeScript、Vitest |
| Go 行为测试 | 通过：Unicode/字节上限/CRLF/固定摘要、取消、stdin、HTTP/bridge/CLI 同结果、协议错误/来源/超限、JSON 404、能力元信息 |
| Vitest | 7/7 通过：SDK 结果/稳定错误/网络失败，UI 真实 client/执行失败/空输入/主题保存/连接重试 |
| `pnpm build` | Web 与 Desktop 前端均通过，生产资产约 285 kB JS / 26 kB CSS（压缩前） |
| `make build-web build-cli` | 通过；真实本机二进制返回 version/profile/build_time，CLI completion 可生成 |
| `make build-desktop` | macOS arm64 原生 Wails .app 构建、打包、自签名成功；已启动并实际执行用例 |
| 原生桌面共享用例 | 默认 3 行样例：61 Unicode 字符、9 空白分隔词、87 字节；摘要 `e666d82104c9591acc651c8f2998d2973ad29dc07777340e848520aff4ab7b87`，与 CLI 完全一致 |
| `pnpm test:e2e` | 4/4 通过：Desktop Chrome 与 375×812 各验证真实 Go 调用、已知 SHA-256、主题/重载保存、移动抽屉、无横向溢出、无未实现 API |
| `make release` | 10 个预览包编译/归档成功：Web 两模式 × Linux amd64/arm64；CLI × Linux/macOS/Windows × amd64/arm64 |
| 发行包验证 | 10 个外部 SHA-256 与内嵌 manifest 全部核对；解压后的 darwin/arm64 CLI 实际执行成功 |
| Skills | 8/8 通过 skill-creator 的 quick_validate.py |
| Docker | 本机 daemon 可用；构建在拉取 node/golang 基础镜像元信息时失败，auth.docker.io:443 超时；未进入应用构建/运行，不能标通过 |
| GitHub Actions | workflow 已提供，尚未推送/运行，不把本机结果等同于远程 CI 成功 |

本机受限沙箱不允许写系统 Go cache，实际命令使用 `GOCACHE=/private/tmp/unicore-go-cache`。Chromium 安装在 `/private/tmp/unicore-playwright`，E2E 使用对应 `PLAYWRIGHT_BROWSERS_PATH`；常规开发环境可采用默认缓存。

## 产物位置

`build/bin/server`、`build/bin/unicore`、`build/desktop/bin/unicore.app`、`build/releases/`。构建产物与生成静态资源不提交 Git。Web 预览为 `http://127.0.0.1:8080`；重启可运行 `build/bin/server`。开发服务器没有账号体系，只监听 loopback。

## 未验证与后续

Windows/Linux/macOS Intel GUI 原生构建与交互需要对应 runner；非本机架构的 CLI/Web 已交叉编译，未实际运行。Docker 镜像尚需在包源可达时重跑构建与容器 smoke。没有性能 p95 测量、可访问性完整审计、代码签名公证或正式供应链签名。

原设计 AC-05 与 M1 相关 UI/契约/作者/依赖边界已经验证；AC-04 的 SQLite、AC-01～03/06～10 的安装/身份/设置、AC-12 的可编译启用分支、AC-13～14 的生产部署/升级恢复均在 M2～M4，尚未验收。当前 license/updater 只报告关闭，不存在启用实现。

尚未选定开源许可证；未创建误导性 LICENSE。正式发布前由作者确定许可、完善 M2～M4，并完成签名、备份/恢复与目标 OS 实测。当前全部包为未签名开发预览。
