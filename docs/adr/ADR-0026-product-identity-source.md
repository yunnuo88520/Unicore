<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0026：产品身份唯一来源与生成投影

状态：接受 · 日期：2026-10-31 · 作者：yunnuo / ymz@ebox.vip

背景：产品名称、slug、Go module、CLI/运维命令、Bundle ID、桌面产物名与服务/目录/镜像/卷身份此前分散在 go.mod、Makefile、wails.json、identity.json、tokens.json、部署模板与创建器的点写逻辑中；CLI 根命令仍是 Go 源码字面量。商业产品化派生需要完整白标与可持续的上游三方合并，两者都依赖一个可校验、可机读的身份真源，否则白标残留只能靠扫描兜底，合并无法区分产品所有与框架管理的文件。

决定：新增 `product.identity.json`（schemaVersion 1）作为唯一身份来源，`scripts/product-identity.mjs` 统一执行严格校验与投影生成。校验拒绝未知键、路径穿越与不安全命名；域名、`server_name`、DNS、TLS 明确排除在身份之外，外部地址归运行时部署配置。投影只限声明字段：`tokens.json` 的 `brand.name`、`identity.json` 的 `bundleId`、`wails.json` 的 `name`/`outputfilename`/`productName` 用逐字段文本改写，混合文件只动身份字段不重排用户配置；`internal/buildinfo/identity.gen.go` 整文件生成，CLI 根命令与 ops 使用提示经 buildinfo 常量消费；Makefile 改为运行时读取身份（`$(GO_MODULE)` LDFLAGS 与 CLI/ops 产物名），`go.mod` module 保持输入并由 check 对账。`pnpm product:generate` 幂等，`pnpm product:check` 只读，并入 `design:generate`/`check:design` 链与 make test。`create:project` 输出派生项目自己的身份文件与生成常量。建立 product-owned/framework-managed/generated/excluded 所有权分类，作为上游同步分发清单机读标注的前置。

替代：继续多点手改加创建器 edit——残留靠扫描、合并无所有权依据；全仓字符串替换——破坏内部 `@unicore` 命名与作者署名并制造上游冲突；把 wails.json 等整文件变成生成物——重排用户配置并吞掉手工字段。均不采用。

后果：机制性 `UNICORE_*` 变量与 `APP_*` 运行配置保留原名，产品 CI Secret 约定用 slug 派生前缀；CLI 帮助文案、Web 静态 HTML、部署模板与发行脚本的 Unicore 字面量属后续白标范围；`identity.gen.go` 随源提交，派生项目由创建器写入；上游同步需在 distribution manifest 落所有权标注并验证合并与二次同步。
