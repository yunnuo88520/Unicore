<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore

**一份 Go Core，一套 React UI，连接 Web、桌面与 CLI。**

作者：yunnuo · ymz@ebox.vip · 版本：0.1.0 开发预览 · 当前阶段：M2c

已实现共享文本分析 Core、Chi HTTP、Wails v2 桌面、Cobra CLI，以及 Web 一次性安装、SQLite/PostgreSQL/MySQL、平台本地登录/RBAC/用户管理、持久化设置与 SMTP 邮件账号流程。桌面自动创建本地 SQLite，无安装或登录；CLI 无 HTTP/Wails/数据库依赖。

注册默认关闭；先保存 SMTP 并成功测试，才能启用邮箱验证注册和找回密码。OIDC、完整角色权限编辑、备份恢复、授权与升级仍在后续阶段；当前不作为生产发行。

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

首次访问进入 `/install`。从私有数据目录（默认 `data/`）的 `bootstrap.token` 读取一次性凭据，选择平台或单机、连接数据库。平台需要管理员账号，单机跳过。安装后 token 吊销，profile 不可直接切换；配置、密钥、数据库不提交 Git。已有 M1 预览没有持久数据，M2a 首次启动需要初始化。

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
make release                     # 本地跨平台预览包，不发布或上传
```

外部 DB 测试只连接显式提供的独立空库：`UNICORE_TEST_POSTGRES_DSN` / `UNICORE_TEST_MYSQL_DSN`。不要使用生产库；CI 有独立 PostgreSQL 15/MySQL 8.0 services。三方言已本机实测；其他 OS 原生 GUI 仍需 CI 验证。

## 文档

- [M2c 验收报告](docs/04-ai/acceptance-m2c.md)、[统一主题入口](docs/02-standards/design-system.md)
- [M2b 验收报告](docs/04-ai/acceptance-m2b.md)、[M2a 验收](docs/04-ai/acceptance-m2a.md)、[M1 历史验收](docs/04-ai/acceptance-m1.md)
- [完整设计基线](docs/00-product/design-v1.1.md)、[当前形态与里程碑](docs/00-product/PRD.md)
- [架构](docs/01-architecture/architecture.md)、[规范](docs/02-standards/coding.md)、[部署与密钥恢复](docs/03-runbooks/deployment.md)
- [M2 决策](docs/adr/ADR-0003-m2-install-storage-identity.md)、[权限清单](docs/api/permissions.md)、[协作约定](AGENTS.md)

仓库尚未选定开源许可证；采用或再分发前由作者明确条款。

主题和品牌统一由 `assets/theme/tokens.json` 与 `assets/brand/identity.json` 管理。只换主色修改 brand.accent；构建自动同步 Logo、ICO、原生图标与邮件配色。字体、圆角、间距、线宽、动效也有集中入口。
