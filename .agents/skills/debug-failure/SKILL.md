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

1. 先复现最小面再上全量：Go 用 `go test -race ./<受影响包>`；前端 `npx vitest run <文件>` 且类型相关改动必须跟 `pnpm typecheck`（vitest 不做类型检查，只跑 vitest 会漏）；生成/文档漂移直接跑对应 `pnpm check:*`。`make test` 只在交付前跑。
2. 常见失败签名对照：
   - check:contracts 失败 → 改了 openapi.json 没跑 `pnpm generate`，或手改了 `*.gen.*`；从源头改再生成。
   - TestAPIRoutesMatchContract 失败 → 新端点漏登记契约或漏注册路由；双向遍历要求完全一致。
   - 响应 500 ROUTE_POLICY_UNDECLARED → 路由存在但 x-unicore 未声明访问策略（见 policy.go 与 add-api-operation）。
   - 页面批量变成"暂时无法连接核心 · 请求已取消或超时" → 有请求被调用方的 abort signal 连带取消（React Query 失效/卸载会中止自己的查询）：检查共享请求或 AbortSignal.any 是否携带了会中止的调用者 signal；回归用响应 abort 的 mock fetcher——忽略 signal 的 mock 恰好会掩盖这类 bug（真实案例：SDK 共享 GET 去重，见 packages/sdk/src/dedup.test.ts 的 responsive fetcher）。
   - 本地过、CI 挂的路径/链接检查（missing cited path、missing linked resource） → 大小写漂移：macOS/Windows 文件系统不区分大小写，Linux CI 区分；引用路径必须与磁盘真实大小写一致（真实案例：docs/ADR 写成大写而目录是 docs/adr）。check-docs 已按大小写精确校验。
   - check:i18n 失败 → 中英词条不同步；按列出的 key 补齐。
   - check:boundaries 失败 → CLI/domain/usecase 引入了越界包；按报错的 import 链裁剪。
   - check:migrations / catalog 测试失败 → SQL 原字节、checksum 或 catalog 登记不一致；禁止手改生成物或已分发 SQL。
   - e2e 失败 → 先确认 `pnpm test:e2e` 已编译 Go 夹具（oidcprovider/storagefixture），trace 在 test-results/；见 add-e2e-test。
3. 数据库相关失败区分方言：单 SQLite 通过不代表 PG/MySQL，行锁、事务 DDL、collation 语义见 docs/02-standards/backend.md。mock 与真实实现的差异同理：本地 mock 通过不代表真机会同样表现，关键行为（signal、超时、流式）要让 mock 按真实契约响应。
4. 修复后按受影响面回归对应粒度目标，交付前 make test 全量；根因一句话写进交付说明。

## forbidden

用加超时/重试掩盖 flaky；删除或放宽失败断言；在本地 dirty 状态宣称全量通过；绕过信封/契约断言改测试迁就实现。

## output

根因、最小修复、实际执行的回归命令与结果、仍未解释的失败项。
