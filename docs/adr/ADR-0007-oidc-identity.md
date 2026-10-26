<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0007：企业身份与本地授权分离

状态：接受 · 日期：2026-10-26 · 作者：yunnuo / ymz@ebox.vip

M3a 仅在 web-platform 装配 OIDC。platform 定义身份服务 port，adapter/oidc 使用 coreos/go-oidc v3 与 oauth2 处理发现、授权码、PKCE S256 和签名校验。Core、CLI、桌面与单机 profile 不装配平台身份；依赖图检查同时禁止 OIDC/OAuth2 进入本地组合。

身份键为 SHA-256(issuer + NUL + sub)，一个本地用户至多绑定一个企业身份。不按邮箱自动关联，不导入企业 roles/groups/admin 声明，也不随企业邮箱变化覆盖本地邮箱或角色。已关联身份仍需本地账号 active，实时使用本地 RBAC。JIT 默认关闭；显式开启后仅接受合法且 email_verified=true 的邮箱，且本地邮箱不存在，固定创建 user。没有本地密码的账号不能直接解除绑定，可由现有邮件找回密码流程设置本地密码。

绑定要求当前 session、CSRF、本地密码再次验证，并在企业授权请求指定 prompt=login/max_age=0，验证 auth_time 在五分钟内。绑定/解绑事务在安装行锁下重读账号状态、密码 hash 与原 session，撤销该用户全部旧会话、待用账号挑战及待发邮件，再签发新 session。本地密码登录一直保留，最后一个 active 且具有本地密码的 super_admin 不能被禁用或降权。不会为了启用 OIDC 删除本地密码。

每次授权生成独立 state/nonce/verifier，五分钟有效。数据库仅存 state/browser 的 hash 与 AES-GCM 加密的 flow 载荷。回调必须同时匹配浏览器 HttpOnly/SameSite=Lax 的短期 Cookie 和 state，正确匹配后原子消费，即使换码失败也不可重放。浏览器新发起授权会替换同名 Cookie；多标签页应完成最新的一次。全局活跃 flow 上限 2048，并按 IP 限流。

回调固定为安装 BaseURL + /api/v1/auth/oidc/callback；不接收 return_url。站点及 Issuer 使用 HTTPS，只有 literal loopback IP 可用 HTTP 做隔离本机测试。发现/换码/JWKS 使用系统 CA、TLS>=1.2、超时、响应大小上限并拒绝网络重定向。发现端点必须是 HTTPS；本机 HTTP 例外必须与 Issuer 同 origin，不能降级到远程 HTTP。Client Secret 可为空以使用 public client；有密钥时按发现文档选 client_secret_basic 或 client_secret_post，不尝试携带密钥的自动重试。不支持 private_key_jwt/mTLS 客户端认证。

校验签名、issuer、audience、有效期、nonce、sub、iat 及适用的 azp；绑定还校验 auth_time。state 使用随机凭据摘要，nonce 使用恒时比较，flow 正确消费后再次校验配置指纹，提交 session 的事务内仍校验同一指纹及 enabled，避免发现配置修改或关闭流程后继续授权。指纹包含随机密文版本，不对 Client Secret 做快速摘要。不持久保存 access/refresh/id_token。

成功/失败都 303 到固定本地 hash 页面，只携带稳定结果，回调设置 no-store/no-referrer；不把 code/state/provider 原始错误带到界面、日志或审计。连接检查仅验证发现文档及端点，不声称已验证 Client Secret 或真实企业账号。外部 IdP 的停用或权限变化不会主动撤销本地 session；运维应合理设置 security.session_hours，需要即时撤销时在本地禁用账号。本阶段不实现单点退出、SCIM、多 IdP 或角色 claim 映射。

平台迁移 0006 增加 external_identities/oidc_flows，不改历史 checksum；单机/桌面仍只有 framework 0001。迁移是增量 DDL，MySQL 依赖 IF NOT EXISTS 恢复部分提交。回退需停服，恢复同一时间点 DB、installation.json 和密钥；不能承诺只换旧 binary 能保留 SSO-only 账号的登录能力。
