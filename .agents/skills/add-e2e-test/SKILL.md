---
name: add-e2e-test
description: 扩展 Unicore Playwright E2E：真实后端与 Go 夹具编译、双视口断言与证据留存边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-e2e-test

## trigger

为安装、账号、公告、OIDC、存储、更新等真实浏览器链路新增或修改 E2E。

## steps

1. 先读 playwright.config.ts（chromium + mobile 双 project；375px 断言不可省）与 tests/e2e 里同域 spec 找样板。
2. 需要真实身份/OIDC/存储后端时复用 Go 夹具：tests/oidcprovider、tests/storagefixture 由 `pnpm test:e2e` 先编译到 build/bin/，不能假设二进制已存在，也不在 spec 内启动它们。
3. spec 只走页面交互与 AppClient 的用户可见行为，不拼接口路径、不读内部表；断言用户可观察状态而非实现细节。
4. 前置状态用真实流程构造（安装向导、登录、设置 PATCH），不用 SQL 注入造状态；凭据用 testutil 合成值。
5. 运行 `pnpm test:e2e`；失败按 debug-failure 分流，trace/截图只在 test-results/ 与 CI artifact，不入仓库。

## forbidden

mock 后端冒充真实链路；只跑 chromium 不跑 mobile；把截图/视频/日志提交进仓库；用修断言代替修产品。

## output

spec 变更、双 project 真实运行结果、失败时的根因与未测项。
