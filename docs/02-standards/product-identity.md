<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品身份规范

`product.identity.json` 是产品身份唯一可信来源:`product.name/slug/vendor`、`go.module`、`cli.command/opsCommand`、`desktop.bundleId/outputName`、`deployment` 的服务名/用户/目录/镜像/卷、`release.artifactPrefix`。职责边界:版本归 [VERSION](../../VERSION) 与 [发版手册](../03-runbooks/release.md),主题色板与字体归 `assets/theme/tokens.json`,图形矢量归 `assets/brand/identity.json`,运行时站点名与实例图片归 [ADR-0009](../adr/ADR-0009-runtime-branding.md) 实例品牌。

## 校验规则

统一由 `scripts/product-identity.mjs` 读取校验,构建脚本不得各自解析:

- 未知键一律拒绝;`website`、`domain`、`serverName` 等部署端点不是身份字段。域名、DNS、Nginx `server_name`、TLS 证书与监听地址属运行时部署配置(`APP_LISTEN`、反向代理),部署者自理。
- `slug`/命令/服务名/产物名须为小写 slug;`go.module`、安装与数据目录拒绝 `..` 穿越;`bundleId` 须为反向域名。
- 严格 schema(`schemaVersion` 固定 1),字段名拼错直接失败,不做静默默认。

| 命令 | 行为 |
| --- | --- |
| `pnpm product:generate` | 幂等生成全部投影,重复执行无差异 |
| `pnpm product:check` | 只读对账,任何漂移报错退出;并入 `check:design` 与 `make test` |

## 生成投影与混合文件

| 目标 | 来源 | 更新方式 |
| --- | --- | --- |
| `assets/theme/tokens.json` → `brand.name` | `product.name` | 仅该字段 |
| `assets/brand/identity.json` → `bundleId` | `desktop.bundleId` | 仅该字段 |
| `cmd/desktop/wails.json` → `name`/`outputfilename`/`info.productName` | `product.name`、`desktop.outputName` | 仅身份字段;`info.productVersion` 归 `version:sync` |
| `internal/buildinfo/identity.gen.go` | 整文件 | 生成,随源提交 |
| `Makefile` LDFLAGS 与 `build-cli`/`build-ops` 产物名 | 运行时 `$(GO_MODULE)`/`$(CLI_COMMAND)`/`$(OPS_COMMAND)` | 手写结构,动态读取 |
| `go.mod` module | 输入,不生成 | `product:check` 对账,须与身份一致 |

Go 消费:`internal/adapter/cli` 根命令 `Use` 与 `cmd/ops` 使用提示读取 `buildinfo` 的 `CLIRootCommand`/`OpsCommandName`;帮助文案等描述性文本尚未接入。混合配置文件只允许更新上表身份字段,不得重排或覆盖用户配置(主题色、图形矢量、开发配置)。`design:generate` 链顺序为 version → product-identity → theme → brand → sync → contracts。

## 文件所有权

上游同步与派生的前置分类,机器可读标注在 D4 落入 [distribution/manifest.json](../../distribution/manifest.json):

| 类别 | 内容 |
| --- | --- |
| product-owned | `product.identity.json`、`go.mod` module、用户业务代码 |
| framework-managed | `scripts/product-identity.mjs`、schema、`Makefile`、部署模板 |
| generated | `identity.gen.go`、`tokens.json` 的 `brand.name`、`identity.json` 的 `bundleId`、`wails.json` 身份字段、`assets/brand` 生成资产 |
| excluded | 运行数据、密钥、`.env`、私有配置 |

## 环境变量分类

| 变量 | 类别 | 处理 |
| --- | --- | --- |
| `APP_*` | 框架通用运行配置 | 保留 |
| `UNICORE_BACKUP_PASSPHRASE`、`UNICORE_VERIFY_TARGET`、`UNICORE_MAINTENANCE_*`、`UNICORE_RESTORE_DATABASE_DSN`、`UNICORE_PLATFORM_SIGNING` | 框架机制 | 保留 `UNICORE_` 前缀,不改名 |
| `UNICORE_IMAGE`、`UNICORE_VERSION`、`UNICORE_COMMIT`、`UNICORE_BUILD_TIME`、`UNICORE_PORT` | 产品发行输入(compose/构建) | 白标阶段按 slug 重生成 |
| `UNICORE_UPDATE_SIGNING_KEY` | CI/CD Secret | 派生产品使用 slug 派生前缀(`ciSecretPrefix`:my-product → `MY_PRODUCT_*`) |
| `UNICORE_TEST_*`、`UNICORE_DEV_*`、`*_FIXTURE*` | 开发与测试 | 保留 |
| `__UNICORE_BUNDLE_ID__` 等模板占位符 | 构建机制 | 保留,由 sync-brand 回填 |

## 派生项目

`create:project` 生成派生项目自己的 `product.identity.json`(部署字段按 slug 派生)与 `identity.gen.go`;上游同步不得覆盖 product-owned 身份文件,合并后执行 `make docs` 重新生成投影。流程见 [创建与合并](../03-runbooks/framework-upgrade.md)。
