---
name: app-lifecycle
description: 修改 Unicore 配置加载、组件生命周期、日志或监控入口，并验证各 profile 的启动与退出。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# app-lifecycle

先读 docs/02-standards/runtime.md 与 docs/03-runbooks/deployment.md。配置的默认值、环境变量、flag 优先级与脱敏范围保持一致；密钥继续由组合根注入，不能写入上下文或有效配置日志。

HTTP 在关闭存储前排空在途请求；组件按依赖顺序启动、逆序清理，失败时继续清理并返回错误。CLI stdout 保持结构化业务输出，框架日志使用 stderr。监控监听只允许独立 loopback 地址，不能把未鉴权指标绑定公网。

用真实回环请求验证正常关闭、截止时间及启动失败；配置测试覆盖优先级和无效输入。运行 make test 与受影响 profile 构建，更新实际配置表与未实测平台。
