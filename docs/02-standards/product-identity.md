<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品身份规范

`product.identity.json` 是产品身份唯一可信来源:`product.name/slug/vendor/description`、`go.module`、`cli.command/opsCommand/description`、`desktop.bundleId/outputName`、`deployment` 的服务名/用户/目录/镜像/卷、`release.artifactPrefix`。职责边界:版本归 [VERSION](../../VERSION) 与 [发版手册](../03-runbooks/release.md),主题色板与字体归 `assets/theme/tokens.json`,图形矢量归 `assets/brand/identity.json`,运行时站点名与实例图片归 [ADR-0009](../adr/ADR-0009-runtime-branding.md) 实例品牌。

## 校验规则

统一由 `scripts/product-identity.mjs` 读取校验,构建脚本不得各自解析:

- 未知键一律拒绝;`website`、`domain`、`serverName` 等部署端点不是身份字段。域名、DNS、Nginx `server_name`、TLS 证书与监听地址属运行时部署配置(`APP_LISTEN`、反向代理),部署者自理。
- `slug`/命令/服务名/产物名须为小写 slug;`go.module`、安装与数据目录拒绝 `..` 穿越;`bundleId` 须为反向域名;`description` 字段不接受控制字符。
- 严格 schema(`schemaVersion` 固定 1),字段名拼错直接失败,不做静默默认。

| 命令 | 行为 |
| --- | --- |
| `pnpm product:generate` | 幂等生成全部投影,重复执行无差异 |
| `pnpm product:check` | 只读对账,任何漂移报错退出;并入 `check:design` 与 `make test` |
| `pnpm check:residuals` | 派生项目残留扫描;框架仓库(无 provenance)自动跳过 |

## 生成投影与混合文件

| 目标 | 来源 | 更新方式 |
| --- | --- | --- |
| `assets/theme/tokens.json` → `brand.name` | `product.name` | 仅该字段 |
| `assets/theme/resolved.gen.json` → `brand.name` | `product.name` | 仅该字段(生成物随源提交,导出即可用) |
| `assets/brand/identity.json` → `bundleId` | `desktop.bundleId` | 仅该字段 |
| `assets/brand/wordmark.svg` 文字 | `product.name` | 仅词标文本节点 |
| `apps/web/index.html`、`admin.html`、`apps/desktop/index.html` 标题与描述 | `product.name`、`product.description` | 仅 `<title>` 与 description |
| `apps/*/public/site.webmanifest` | `product.name` | 生成物紧凑 JSON 往返 |
| `cmd/desktop/wails.json` → `name`/`outputfilename`/`info.productName`/`info.comments` | `product.name`、`desktop.outputName` | 仅身份字段;`info.productVersion` 归 `version:sync` |
| `package.json` → `name` | `product.slug` | 仅该字段;发行产物前缀随之派生 |
| `packages/contracts/openapi.json` → `info.title` | `product.name` | 仅标题;`x-unicore` 扩展与 cookie 名是契约机制,不改 |
| `internal/buildinfo/identity.gen.go` | 整文件 | 生成,随源提交;CLI `Use`/`Short`、ops 提示经常量消费 |
| `packages/web-ui/src/product.gen.ts` | 整文件 | 生成;About 标题与「关于」提示消费 |
| `deploy/tar/unicore`、`unicorehelp`、`unicore.service` | 重命名为 `cli.command`/`opsCommand`/`serviceName` 并替换内容 token | 框架路径固定,派生项目导出时重命名 |
| `deploy/docker/compose.yaml` 变量与卷、`compose.dev.yaml`、`nginx.conf.example` 路径、`Dockerfile` 镜像标签 | slug 派生 | 显式 token 表,最长优先 |
| `docs/product/*.md`(manifest project-template 清单) | 命令/服务/路径 token | 显式 token 表;`Unicore` 散文属性保留 |
| `Makefile` LDFLAGS 与 `build-cli`/`build-ops` 产物名 | 运行时 `$(GO_MODULE)`/`$(CLI_COMMAND)`/`$(OPS_COMMAND)` | 手写结构,动态读取 |
| `go.mod` module | 输入,不生成 | `product:check` 对账,须与身份一致 |

Go 消费:`internal/buildinfo` 常量(ProductName/ProductSlug/CLIRootCommand/CLIRootDescription/OpsCommandName/BundleID);邮件主题、更新 UA、存储探针、桌面 Linux `ProgramName` 经 `ProductName`/`ProductSlug` 派生。`design:generate` 链顺序为 version → product-identity → theme → brand → sync → contracts。混合配置文件只允许更新上表身份字段,不得重排或覆盖用户配置。

## 保留的框架机制命名

以下命名属机制而非产品身份,派生项目保留并在扫描白名单放行:会话 cookie(`unicore(_administrator)?_session`)、邮件 `cid:unicore-brand`、私有数据目录内的 SQLite 文件名 `unicore.db`、`x-unicore` 契约扩展、`__UNICORE_*__` 生成占位符、`UNICORE_*` 环境变量(分类见下)、`@unicore/*` pnpm 包名、作者署名与上游链接、「基于 Unicore」类来源散文。派生项目的面向用户文案不出现框架名;以产品为主语的模板文档句子一律中性化,不依赖逐字替换。

## 残留扫描

`scripts/check-product-residuals.mjs` 只在派生项目生效(读取 `project.provenance.json` 的框架名):对上表全部产品可见文件逐行扫描框架名,命中且不在白名单即失败,并检查 `deploy/tar` 无框架名文件。白名单是显式数组,不接受"忽略全部匹配"。`make test` 在框架仓库自动跳过,在派生项目强制执行。

## 文件所有权

上游同步与派生的前置分类,机器可读标注在 [distribution/manifest.json](../../distribution/manifest.json) 的 `ownership` 字段;`framework-template` 模板分支随附框架自身 `product.identity.json`,同步工具据此把派生树归一化回框架命名再三方合并:

| 类别 | 内容 |
| --- | --- |
| product-owned | `product.identity.json`、`go.mod` module、用户业务代码 |
| framework-managed | `scripts/product-identity.mjs`、schema、`Makefile`、部署模板、`docs/product` 源文 |
| generated | `identity.gen.go`、`product.gen.ts`、`resolved.gen.json`、`wordmark.svg`、site.webmanifest、tokens/identity/wails 的身份字段、`assets/brand` 生成资产 |
| excluded | 运行数据、密钥、`.env`、私有配置 |

## 环境变量分类

| 变量 | 类别 | 处理 |
| --- | --- | --- |
| `APP_*` | 框架通用运行配置 | 保留 |
| `UNICORE_BACKUP_PASSPHRASE`、`UNICORE_VERIFY_TARGET`、`UNICORE_MAINTENANCE_*`、`UNICORE_RESTORE_DATABASE_DSN`、`UNICORE_PLATFORM_SIGNING`、`UNICORE_API_URL`、`UNICORE_WIKI_REPOSITORY` | 框架机制 | 保留 `UNICORE_` 前缀,不改名 |
| `MY_PRODUCT_IMAGE` 等 compose 输入 | 产品发行输入 | `compose.yaml` 按 `ciSecretPrefix(slug)` 重生成 |
| `UNICORE_UPDATE_SIGNING_KEY` | CI/CD Secret | 派生产品使用 slug 派生前缀(`ciSecretPrefix`:my-product → `MY_PRODUCT_*`) |
| `UNICORE_TEST_*`、`UNICORE_DEV_*`、`*_FIXTURE*` | 开发与测试 | 保留 |
| `__UNICORE_BUNDLE_ID__` 等模板占位符 | 构建机制 | 保留,由 sync-brand 回填 |

## 派生项目

`create:project` 生成派生项目自己的 `product.identity.json`(部署字段按 slug 派生,description 默认「基于 Unicore 构建」),随后一次 `applyIdentity` 套用全部投影——混合文件身份字段、生成源、部署重命名与文档令牌——导出即可通过 `product:check` 与 `check:residuals`。上游同步不得覆盖 product-owned 身份文件,合并后执行 `make docs` 重新生成投影。流程见 [创建与合并](../03-runbooks/framework-upgrade.md)。
