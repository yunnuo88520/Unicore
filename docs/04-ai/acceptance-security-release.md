<!-- Author: yunnuo <ymz@ebox.vip> -->
# 依赖安全与首次开发预览

日期：2026-10-28。影响四种 profile 的依赖/构建与分发，无数据库 schema 或 API 行为变更。按 security-review / release-cross-platform 流程验收；运行结果与公开 Release 以对应 GitHub workflow/Release 为准，本文不把待运行配置作为成功证据。

## 修复范围

| 依赖 | 修复版本 | 范围 |
| --- | --- | --- |
| Chi | 5.4.0 | Web 路由、中间件依赖 |
| JOSE | 4.1.6 | 平台 OIDC |
| Wails | 2.13.0 | 原生桌面，CI CLI 跟随 go.mod |
| Echo | 4.16.1 | Wails 间接依赖 |
| Compress | 1.18.7 | 对象存储/压缩依赖 |
| Edwards25519 | 1.1.1 | 数据库驱动间接依赖 |
| x/net | 0.62.0 | HTML 解析库模块告警 |
| Vitest / mocker | 4.1.12 | 开发测试，旧 Tinypool 依赖链移除 |

首次 GitHub 16 条告警由版本升级解决，不手动 dismiss。模块级扫描发现 x/crypto 废弃 openpgp 无修复版；框架未导入该包，包/符号扫描单独检查实际攻击面。不能承诺永远零漏洞，发布时还需核对实时 GitHub 与包管理器数据库。

## 验证与发布边界

本地执行全量 pnpm audit、Go 包/符号扫描、make docs/test、Web/CLI/ops/原生构建及页面回归；远端门禁包含独立 MySQL/PostgreSQL、PC/375px、四种 feature 组合、Tar/Nginx/Docker/Compose，以及三系统原生构建。旧历史验收不代表本轮全部已运行，最终结果见发布对应的 workflow。

本地已确认：pnpm audit 全部等级为 0；36 项 Vitest、Go race/vet/依赖边界、契约/作者/设计/文档检查通过；macOS arm64 原生 0.1.1 启动、Go Core 调用、弹窗新建笔记及品牌/ICNS 校验通过。隔离测试从可信旧提交 6905ffe 向前升级、重启，并用升级前加密快照恢复旧程序成功。原生测试使用临时 data dir，没有操作已有实例。

候选 bundle 必须来自相同 main 提交，包含 Linux 双架构两种 Web、三系统双架构 CLI、三系统各自 runner 的桌面共 13 个 tar.gz。归档附版本/许可/说明/manifest；总清单与 checksum 在组包时重新验证，并生成 GitHub 来源证明。脚本拒绝不同来源、缺包、重复目标或篡改归档。

公开渠道为开发预览 prerelease，非稳定发行。没有 Apple/Windows 系统签名、公证或框架 OTA 签名；GitHub 来源证明及 checksum 不等于这些签名。Windows/Linux 原生窗口需要真实机器交互验收，不将 runner 编译成功写成窗口功能已测。没有公开 registry 镜像，不承诺 AWS/OSS/COS 供应商实测，也没有生产部署或真实 OTA。

部署、停服备份/恢复与构建命令分别见 [部署](../03-runbooks/deployment.md)、[备份](../03-runbooks/backup.md)、[发版](../03-runbooks/release.md)。
