<!-- Author: yunnuo <ymz@ebox.vip> -->
# sdk 域内约定

传输无关客户端。契约与错误目录见 [接口契约](../../docs/product/development.md)，根 [AGENTS](../../AGENTS.md) 优先。

- HttpTransport 与 WailsTransport 语义一致：改动须两侧测试同时通过（相同结果与相同错误码）。
- 错误一律 `AppError(code, message, requestId, fields)`，code 与契约错误目录对齐，不新增与契约脱节的错误码。
- 相同 path+query 的并发 GET 共享一次请求；调用者 abort 只作用于自己，共享请求不挂任何调用者 signal。见 `index.ts` 的 dedup 与 dedup.test.ts。
- 不手写接口路径：一切经生成的 operations 描述发起；会话过期只通知一次（authenticated 翻转即单飞）。
- 测试 fetcher 必须响应 abort signal（见 dedup.test.ts 的 responsive）：忽略 signal 的 mock 会掩盖"共享请求被调用者取消连带中止"这类只在真实 fetch 暴露的 bug；类型也必须匹配 `typeof fetch` 签名。
