<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore

**一份 Go Core，一套 React UI，连接 Web、桌面与 CLI。**

作者：yunnuo · ymz@ebox.vip · 版本：[VERSION](VERSION) · 开发预览

已实现共享文本分析 Core、Chi HTTP、Wails v2 桌面、Cobra CLI，以及 Web 一次性安装、SQLite/PostgreSQL/MySQL、平台本地登录/RBAC/用户管理、固定管理员/普通用户及权限目录、持久化设置与 SMTP 邮件账号流程。桌面自动创建本地 SQLite，无安装或登录；CLI 无 HTTP/Wails/数据库依赖。

在线平台的全局配置仅管理员查看和修改；普通用户可使用工作空间、本人账号及客户端本地外观。注册默认关闭；先保存 SMTP 并成功测试，才能启用邮箱验证注册和找回密码。OIDC 企业登录与显式绑定已实现；备份恢复、授权与升级仍在后续阶段；当前不作为生产发行。

## 启动

需要 Go 1.25+、Node 22+、pnpm 11.25.0。桌面另需 [Wails v2 原生依赖](https://wails.io/docs/gettingstarted/installation)。

```sh
make install
# 两个终端分别运行，访问 http://127.0.0.1:5173
make dev-server
make dev-web

# 或构建内嵌前端的单二进制，访问 http://127.0.0.1:8080
make build-web
build/bin/server
```

首次访问进入 `/install`。从私有数据目录（默认 `data/`）的 `bootstrap.token` 读取一次性凭据，选择平台或单机。默认 MySQL，PostgreSQL 同为在线推荐；地址、端口、库名、用户名和密码分开填，SQLite 需显式选择。三种数据库均需测试连接，非空库须备份并精确确认后才能清空初始化；已有 Unicore 安装不覆盖。平台需要管理员账号，单机跳过。访问 origin 自动登记，无需手填地址。安装凭据用于证明服务器所有权，可验证当前值后换新，与加密密钥不同。安装后凭据吊销，保留私有目录与数据库后重启自动恢复，不重复安装；配置、密钥和数据库不提交 Git。

```sh
# 独立 CLI，无需启动服务
make dev-cli ARGS='execute --text "Hello Unicore"'
printf '你好 Unicore\nOne core' | go run ./cmd/cli execute

# 桌面，不装配平台身份或外部 DB 驱动
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
make dev-desktop
```

桌面默认数据目录为系统 AppData 下 `Unicore/desktop`；`APP_DATA_DIR` 可指定隔离目录。Web 默认 loopback，远程部署须配受控反代/ACL。

## 验证与构建

```sh
make test                         # 契约、作者、依赖边界、vet、Go race、TS、React/SDK
pnpm build
make build-cli build-desktop
pnpm exec playwright install chromium
make build-web && make test-e2e   # 独立实例，真实安装/认证，含 375px
make release                     # 完整本地归档矩阵
make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform
make docker-build                # 镜像标签自动读取 VERSION
make compose-up                  # 构建并启动 127.0.0.1:8088
make version NEW_VERSION=0.1.1    # 准备版本与 Changelog，不发布
```

外部 DB 测试只连接显式提供的独立空库：`UNICORE_TEST_POSTGRES_DSN` / `UNICORE_TEST_MYSQL_DSN`。不要使用生产库；CI 有独立 PostgreSQL 15/MySQL 8.0 services。三方言已本机实测；其他 OS 原生 GUI 仍需 CI 验证。

## 文档

AI 开发从 [文档入口](docs/README.md) 和 [上下文地图](docs/04-ai/context.gen.md) 开始。框架自带 11 个任务 Skills、机器可读 manifest、任务模板和文档漂移检查；`make docs` 生成，`make test` 检查。

`APP_API_DOCS=true build/bin/server` 开启 `/docs/api` 和 `/openapi.json`；日志、退出超时及独立指标端口见 [运行基座](docs/02-standards/runtime.md)。

- [M3a 企业登录验收](docs/04-ai/acceptance-m3a.md)、[接入需求](docs/00-product/feature-oidc.md)
- [安装规范](docs/00-product/feature-installation.md)、[三数据库与重启验收](docs/04-ai/acceptance-installation.md)
- [当前权限验收](docs/04-ai/acceptance-permissions.md)、[角色功能](docs/00-product/feature-roles.md)
- [M2c 验收报告](docs/04-ai/acceptance-m2c.md)、[统一主题入口](docs/02-standards/design-system.md)
- [M2b 验收报告](docs/04-ai/acceptance-m2b.md)、[M2a 验收](docs/04-ai/acceptance-m2a.md)、[M1 历史验收](docs/04-ai/acceptance-m1.md)
- [完整设计基线](docs/00-product/design-v1.1.md)、[当前形态与里程碑](docs/00-product/PRD.md)
- [架构](docs/01-architecture/architecture.md)、[规范](docs/02-standards/coding.md)、[部署与密钥恢复](docs/03-runbooks/deployment.md)
- [M2 决策](docs/adr/ADR-0003-m2-install-storage-identity.md)、[权限清单](docs/api/permissions.md)、[协作约定](AGENTS.md)

仓库尚未选定开源许可证；采用或再分发前由作者明确条款。

主题和品牌统一由 `assets/theme/tokens.json` 与 `assets/brand/identity.json` 管理。只换主色修改 brand.accent；构建自动同步 Logo、ICO、原生图标与邮件配色。字体、圆角、间距、线宽、动效也有集中入口。

开发与打包完整流程见 [发版手册](docs/03-runbooks/release.md)，宝塔/Nginx、Docker/Compose 与首次安装见 [部署手册](docs/03-runbooks/deployment.md)。演示安装可填写 admin / Admin@123456，框架不预置管理员。部署真实验收记录见 [报告](docs/04-ai/acceptance-deployment.md)。
