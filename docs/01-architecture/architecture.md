<!-- Author: yunnuo <ymz@ebox.vip> -->
# M1 架构

共享依赖链：`entry → adapter → usecase → domain`。`internal/contracts` 从 OpenAPI 生成，为 Go 与 TS 的线格式来源；domain 保持纯业务类型。

```text
apps/web ── HttpTransport ── Chi HTTP ─────┐
apps/desktop ── WailsTransport ── Bridge ──┼─ usecase.Executor ─ domain.Analyze
cmd/cli ── Cobra ────────────────────────┘
           packages/web-ui 共用页面
```

`internal/bootstrap.Core()` 只装配无状态服务。Wails 入口受 `desktop` build tag 隔离，`go test ./...` 可在没有 GUI 库的 runner 运行。桥接本身不 import Wails，便于与真实 HTTP/CLI 交叉验证。CLI 不 import presenter（含随机请求 ID）之外的 HTTP/桌面组合，具体依赖由 `scripts/check-boundaries` 按 Go 实际依赖图校验。

## 源码归属

| 位置 | 责任 |
| --- | --- |
| `cmd/{server,desktop,cli}` | 入口与生命周期 |
| `internal/domain` | UTF-8 校验、分析规则，不引入框架 |
| `internal/usecase` | context 取消与 DTO 映射；Executor port |
| `internal/adapter/{http,desktop,cli}` | 请求解析、响应与传输约定 |
| `internal/runtime`, `internal/buildinfo` | profile / 构建元数据，不装配平台模块 |
| `packages/contracts` | OpenAPI 唯一来源，生成 Go/TS |
| `packages/sdk` | AppClient / HttpTransport / WailsTransport |
| `packages/web-ui` | TanStack Query、响应式页面、主题、DashboardWidgetRegistry |
| `apps/{web,desktop}` | 各自 main.tsx 与静态嵌入文件 |

## 接口

`GET /api/v1/bootstrap`、`POST /api/v1/core/execute`、`GET /api/v1/health/live`、`GET /api/v1/health/ready`。请求/响应见 `packages/contracts/openapi.json`。所有 JSON 响应有 `code/message/request_id`，成功有 `data`。HTTP 错误响应省略 data；桥接由于 Wails 静态 DTO 限制返回零值 data，SDK 先判断 code，不将错误数据呈现为结果。

未实现能力的 endpoint 返回 JSON 404，不回退 SPA。M1 两个 Web profile 共享同一无状态 handler，但各自 metadata 明确标示未实现认证/安装/数据库；不得误用为完整平台。

文本最多 65,536 UTF-8 字节，Unicode code point 计数；words 按 Unicode 空白分隔，并非中文分词。行数把 CRLF/CR 视为 LF，末尾换行多一行；摘要对原始字节计算。HTTP JSON body 上限 512 KiB，以容纳合法转义。未知字段/尾随 JSON 拒绝。输入不存储、不写日志。

## 前端

每个 shell 创建独立 AppClient，页面不判断 desktop 全局变量。TanStack Query 处理 bootstrap 与执行状态；M1 不需要额外全局状态库。主题存储 localStorage、监听系统更新；受限 webview 不可用存储时仍可正常渲染。路由使用 hash，避免桌面 custom protocol 的 history fallback 差异。组件/页面通过语义按钮与可见错误提供键盘路径。

`DashboardWidgetRegistry` 以唯一 id 注册业务 widget；产品入口注入 registry，不修改框架首页。扩展如需身份/设置先遵循对应阶段 ADR。

## 安全与能力边界

Web 默认 loopback。JSON POST 拒绝跨 origin 与 `Sec-Fetch-Site: cross-site`，不启用 CORS；M1 无 cookie 身份，不宣称已实现完整 CSRF/session 保护。无授权/升级客户端或路由，因此两项能力固定 false；可编译启用的实现留到 M4。

Go 生产静态嵌入与 CSP；开发 Vite 不继承 Go 的 CSP。日志只写 event/request_id/method/duration 等元信息，不写文本、Cookie 或 query。应用提供超时与优雅关闭。M1 readiness 仅反映无状态 Core，无 DB 健康状态可报告。
