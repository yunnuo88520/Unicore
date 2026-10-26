<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore

**一份 Go Core，一套 React UI，连接 Web、桌面与 CLI。**

作者：yunnuo · ymz@ebox.vip · 当前版本：0.1.0（M1 开发预览）

当前实现跨形态最小闭环：共享 UTF-8 文本分析用例、Chi HTTP API、Wails v2 原生桌面桥接、Cobra CLI、React 响应式工作台、浅色/深色/系统主题、契约生成、测试和发布构建。**M1 不具备安装、账号、RBAC、SQLite、SMTP、OIDC、备份或在线升级，不能作为生产平台交付。**

## 快速启动

需要 Go 1.25+、Node 22+、pnpm 11.25.0。桌面另需 [Wails v2 原生依赖](https://wails.io/docs/gettingstarted/installation)。

```sh
make install
# 终端 1：Go API（默认 127.0.0.1:8080）
make dev-server
# 终端 2：React（http://127.0.0.1:5173）
make dev-web

# CLI：独立执行，不依赖正在运行的服务
make dev-cli ARGS='execute --text "Hello Unicore"'
printf '你好 Unicore\nOne core' | go run ./cmd/cli execute
go run ./cmd/cli completion bash

# 桌面：安装与 go.mod 一致的工具
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
make dev-desktop
```

`make build-web` 生成内嵌前端的 `build/bin/server`；运行后访问 8080，无需 Vite。`--profile web-platform` 可验证平台形态元信息，账号与安装仍待 M2。不要向公网开放 M1 服务。

## 验证与构建

```sh
make test                         # 契约、作者、依赖边界、vet、Go race、TS、React/SDK
pnpm build                       # Web + Desktop 共享 UI 构建
make build-cli
make build-desktop               # 本机原生 Wails 应用
pnpm exec playwright install chromium
make build-web && make test-e2e   # 两种宽度，连接真实 Go 服务
make release                     # 6 个 OS/Arch 的 CLI + Linux 双模式 Web 预览包
```

`make release` 仅生成本地产物及 SHA-256 manifest，不上传或发布。未签名的 M1 产物不能交给升级系统。GUI 在各 OS 原生 CI runner 构建。详细实测范围见 [M1 验收报告](docs/04-ai/acceptance-m1.md)。

## 仓库导航

- [原始 v1.1 设计基线](docs/00-product/design-v1.1.md) 与 [产品形态/里程碑](docs/00-product/PRD.md)
- [架构与接口](docs/01-architecture/architecture.md)、[代码规范](docs/02-standards/coding.md)
- [开发部署与恢复边界](docs/03-runbooks/deployment.md)、[AI 任务模板](docs/04-ai/task-template.md)
- [协作约定](AGENTS.md)、[初始 ADR](docs/adr/ADR-0001-m1-foundation.md)
- `.agents/skills/`：8 个项目开发工作流；`packages/contracts/openapi.json`：唯一 DTO 来源

源码使用 yunnuo 作者标识。仓库尚未选定开源许可证；采用或再分发前由作者明确许可条款。
