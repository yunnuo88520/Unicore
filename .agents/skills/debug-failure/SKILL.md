---
name: debug-failure
description: 分流 Unicore 自动化失败：按受影响面选择粒度目标、对照常见失败签名、定位日志与 trace。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# debug-failure

## trigger

make test / make test-go / make test-web / make test-gen / pnpm test:e2e 失败后的排查任务。

## steps

1. 先复现最小面再上全量：Go 用 `go test -race ./<受影响包>`；前端 `npx vitest run <文件>`；生成/文档漂移直接跑对应 `pnpm check:*`。`make test` 只在交付前跑。
2. 常见失败签名对照：
   - check:contracts 失败 → 改了 openapi.json 没跑 `pnpm generate`，或手改了 `*.gen.*`；从源头改再生成。
   - TestAPIRoutesMatchContract 失败 → 新端点漏登记契约或漏注册路由；双向遍历要求完全一致。
   - 响应 500 ROUTE_POLICY_UNDECLARED → 路由存在但 x-unicore 未声明访问策略（见 policy.go 与 add-api-operation）。
   - check:i18n 失败 → 中英词条不同步；按列出的 key 补齐。
   - check:boundaries 失败 → CLI/domain/usecase 引入了越界包；按报错的 import 链裁剪。
   - check:migrations / catalog 测试失败 → SQL 原字节、checksum 或 catalog 登记不一致；禁止手改生成物或已分发 SQL。
   - e2e 失败 → 先确认 `pnpm test:e2e` 已编译 Go 夹具（oidcprovider/storagefixture），trace 在 test-results/；见 add-e2e-test。
3. 数据库相关失败区分方言：单 SQLite 通过不代表 PG/MySQL，行锁、事务 DDL、collation 语义见 docs/02-standards/backend.md。
4. 修复后按受影响面回归对应粒度目标，交付前 make test 全量；根因一句话写进交付说明。

## forbidden

用加超时/重试掩盖 flaky；删除或放宽失败断言；在本地 dirty 状态宣称全量通过；绕过信封/契约断言改测试迁就实现。

## output

根因、最小修复、实际执行的回归命令与结果、仍未解释的失败项。
