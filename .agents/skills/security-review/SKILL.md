---
name: security-review
description: 有范围地审查 Unicore 安装、身份、设置、传输、上传或升级的实际安全边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# security-review

## trigger

用户请求安全评审或改动触及实际信任边界；不扩展无关小改动。

## inputs

范围、profile、攻击入口、身份/secret/数据流及实现阶段。

## steps

1. 阅读设计和实现，区分当前控制与路线图，列出可信边界。
2. 安装边界先读 [ADR-0013](../../../docs/adr/ADR-0013-installation-experience.md)：token 换新需当前凭据；清空只在完成安装且精确库名确认后，已有 Unicore 标记始终拒绝；已安装 DB/标记缺失不能自动重装。按范围检查安装 token/锁/吊销，密码/session/CSRF/限流/RBAC，secret 加密/掩码，OIDC PKCE/state/nonce/绑定，上传路径和升级签名。品牌上传的实际格式/尺寸、原子提交、清理与邮件快照边界见 [ADR-0009](../../../docs/adr/ADR-0009-runtime-branding.md)。
3. 错误、日志、审计和契约不能泄露敏感信息；单机 loopback，桌面/CLI 不加载身份。
4. 提供可复现风险和最小修复，增加相关测试，不把未来模块未实现误报为已上线的生产功能漏洞。

## output

按影响排序的发现、路径证据、触发条件、修复、验证和部署限制。

## forbidden

读取/输出生产 secret；攻击未授权外部系统；验证码、隐藏路径或菜单作为唯一防线。

## validation

运行相关允许/拒绝/重试测试、make test 与 profile 构建；明确未覆盖范围。
