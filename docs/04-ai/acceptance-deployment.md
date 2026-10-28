<!-- Author: yunnuo <ymz@ebox.vip> -->
# 构建与部署验收

> 本文保留该阶段的验收记录；系统更新、签名流程及其后续验证以 [更新验收](acceptance-updates.md) 为准，早期占位与未实现描述不再代表当前能力。

> 固定两角色与平台迁移 0007 的最新部署复验见 [权限验收](acceptance-permissions.md)，下方保留交付基座初次验收记录。

日期：2026-10-27。影响四个 profile 的版本/构建以及两种 Web 的运行模板；无 DB 迁移，不创建生产账号，不对外部署/推送/发布。

## 实现

- VERSION 是唯一人工应用版本源，scripts/version.mjs 生成 Go 默认版本、全部 workspace 包元数据、OpenAPI info.version、Wails productVersion。Make 阻止命令行覆盖 VERSION；Docker 编译参数与源不一致时失败，镜像 tag/OCI label/运行 bootstrap 由统一入口赋值。check:version 进入 make test/CI。
- make version NEW_VERSION=x.y.z 同步版本并将 Unreleased 内容归档为带 UTC 日期的 Changelog；拒绝非法、重复、降版本和空发布说明。只做本地准备。隔离测试验证漂移检查及原历史记录保留；真实仓库版本保持原值。
- make package 支持 RELEASE_TARGETS / RELEASE_PROFILES；make release 输出完整矩阵。每次重建 build/releases，包内包含离线部署文档、VERSION、CHANGELOG、manifest、Web/CLI 二进制和 Web 静态目录/模板。不混用前一次遗留产物，macOS 打包排除 AppleDouble 附加元数据。
- Nginx 直接读取指纹 assets；其余交 Go，保留首次 /install、动态品牌/manifest、自定义后台旧路径 404、API JSON404、文档默认关闭。Tar 包的默认 profile 现在也正确进入安装向导，可在首装显式选择，安装后固定。
- Docker/Compose 使用非 root + 只读根目录 + 独立数据卷；build context 排除本地数据、密钥和 env。统一 Make 构建/启动/停止入口、OCI 元数据、端口配置和停止宽限期。
- 发版/部署手册、ADR-0011、manifest 与仓库 release-cross-platform Skill 同步更新。CI 增加真实部署 smoke 和证据上传，原生 runner 改走统一 Make 版本注入入口；本轮未触发远程 CI。

## 实测

本机 macOS arm64，Go 1.26.0、Node 22.21.1、pnpm 11.25.0；Docker Engine 29.9.2 为 Linux aarch64。实际部署运行平台为 Linux arm64；容器使用 SQLite，独立随机命名容器/网络/卷，结束清理这些测试资源。

| 交付场景 | 结果 |
| --- | --- |
| Tar web-platform 解包 + 真 Nginx | 通过，实际执行包内 Linux 二进制和包内 Nginx 模板 |
| Tar web-standalone 解包 + 真 Nginx | 通过，无管理员步骤/平台 API |
| Docker 镜像直接运行 | 通过，distroless nonroot，只读根目录、持久命名卷 |
| Docker Compose | 通过，使用实际 compose.yaml，强制替换容器保留数据 |
| PC 1440px / 手机 375px | 四场景安装/工作台，平台登录页截图；无页面横向溢出、无浏览器未捕获异常 |
| 完整归档矩阵 | 10 个 tar.gz：Linux 双架构两种 Web + 三系统双架构 CLI，checksum/包内版本/manifest/离线手册检查通过，无 ._ 元数据 |
| macOS Wails 包 | make build-desktop 通过；实际 plist 两处版本、bundle ID、ICNS 五种分辨率品牌像素校验通过 |
| 质量与回归 | make docs → make test；版本隔离测试、Go race/vet/依赖边界、契约/设计/文档/作者、TS 和 28 项 Vitest；28 项 PC/375px E2E 通过 |

每个部署场景验证：未安装 live=200/ready=503、根路径 303 到 /install；真实向导测试数据库连接并完成安装；安装后 ready=200。平台演示管理员为用户指定 `admin / Admin@123456`，由安装表单显式创建，注册仍默认关闭、图形验证码开启，未预置任何生产账号。

平台写设置缺少 CSRF 返回 403；完整请求能保存站点名称、修改后台 /manage，旧 /admin 404。上传 favicon 后动态 manifest 和 PNG 经 Nginx 正确返回；未知 API 返回 JSON404，关闭的 /docs/api、/openapi.json 及不存在的静态文件均 404。

实际执行进程重启及容器替换（Compose 使用 force-recreate），检查站点设置、数据库账号、secret.key/installation.json 指纹、品牌引用和图片保持；安装凭据重放得到 409，/install 不再允许安装。清空浏览器 Cookie 后用演示账号及六位图形验证码再次登录，通过共享 Core 的固定 SHA-256 结果验证。Tar 验证静态资源确由 Nginx 读取。该测试是同版本替换，不能作为跨版本数据恢复或回滚证据。

Docker 官方 Hub 鉴权实际超时；成功构建使用 mirror.gcr.io/library/golang:1.26-bookworm 和 mirror.gcr.io/library/node:22-bookworm-slim 的同版本镜像源，运行基底为 gcr.io/distroless/static-debian12:nonroot。未将绕过源码构建的临时镜像作为完整 Dockerfile 成功证据。

关键页面：[手机安装](evidence-deployment/install-mobile.png)、[桌面登录](evidence-deployment/login-desktop.png)、[桌面工作台](evidence-deployment/workspace-desktop.png)。完整本轮截图和 JSON 位于 build/acceptance/deployment/，可用 make test-deploy 重现；脚本只使用测试收件地址，未发外部邮件。

## 实际限制

- 未操作宝塔面板；验证的是其可用的等效 Nginx 配置。Linux systemd 模板未在真实 systemd 主机启动；HTTPS 公网 DNS/证书/反代和真实生产服务器未部署。
- Linux amd64 和其余 OS/Arch CLI 已交叉构建，未在这些目标机运行。Windows/Linux 原生 GUI、远程 CI 本轮未运行；不能把编译成功视为目标机验收。
- 本轮应用容器使用 SQLite；PostgreSQL/MySQL 三方言属于先前隔离数据库验收，本轮未重跑外部 DB/SMTP/OIDC 实际供应商。镜像 feature 默认均关闭；其他 feature 组合此前有 Go/Vite/browser 验收，本轮未分别构建四种镜像。
- 当前仍是未签名开发预览，正式签名/公证、公开发布流水线、真实授权/版本服务器、OTA 与自动备份恢复未完成。签名/密钥/registry 由发布方接入，不将 checksum 或同版本重建称为正式升级能力。

操作入口见 [发版流程](../03-runbooks/release.md)、[部署手册](../03-runbooks/deployment.md) 和 [ADR-0011](../adr/ADR-0011-release-deployment.md)。
