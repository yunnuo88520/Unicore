<!-- Author: yunnuo <ymz@ebox.vip> -->
# 客户端与 API 认证

此能力仅属于 Platform。浏览器继续使用统一的 `unicore_session` Cookie，写请求附带 `X-CSRF-Token`；原生客户端和脚本可显式使用 Bearer。Standalone Web、桌面和独立 CLI 没有平台身份，不装配这些接口。

## 小程序 / App 客户端

`POST /api/v1/auth/token` 输入与普通登录相同的 LoginInput，包括账号密码、验证码及按配置要求的人机验证。API 不写 Cookie，也不接受 Cookie 与显式认证混用。

```ts
import { ClientTokenSession } from '@unicore/sdk';

const client = new ClientTokenSession('https://your-instance.example');
const challenge = await client.captcha();
// 展示 challenge.image 并由用户输入 answer；验证码关闭时可传空字段。
const result = await client.login({
  username: 'your-account', password: 'your-password',
  captcha_id: challenge.id, captcha_answer: answer,
});
if (result.mfa_required) {
  await client.completeMFA(result.challenge_token!, authenticatorOrRecoveryCode);
}
const notes = await client.call('listNotes');
await client.logout();
```

示例中的账号、验证码和二次验证输入由应用自己的交互提供。验证码由 `GET /api/v1/auth/captcha` 获取；人机验证策略与 Cookie 登录一致，不能通过客户端 API 绕过。SSO-only 账号不能凭空使用密码登录；需要具体身份提供商适配。微信临时 code → 服务端验证 → 已验证身份 → 本系统 Token 的适配尚未提供；客户端 openid 不能直接当作可信用户 ID。

成功返回 access_token（JWT）、refresh_token、token_type、expires_in、refresh_expires_at 及当前用户。已配置 MFA 时先返回 mfa_required 与 challenge_token，再通过 `/auth/token/mfa` 提交验证码/恢复码。挑战仅限五分钟且成功兑换后失效，不能继续当作 Cookie；强制 MFA 尚未登记时返回 MFA_ENROLLMENT_REQUIRED，先通过浏览器登记。

Access Token 最长 15 分钟，后端每次重新检查登录和当前权限；修改密码、账号状态、角色及撤销登录设备会使其失效。Refresh Token 不能调用业务 API；仅发送到 `/auth/token/refresh` 或 `/auth/token/revoke`。刷新时返回新的整对凭证，旧 Refresh Token 再次使用会撤销这一登录链。刷新期限沿用登录会话与安全策略，不无限延期。

SDK 的 ClientTokenSession 在内存保存凭证并合并并发刷新；不会写入 localStorage 或 Cookie。应用如需持久化，可通过构造函数第三个 onTokens 回调写入系统安全存储，恢复后调用 accept(pair)；退出时回调 undefined。HTTP 写操作返回 401 后只在凭证仍属于同一用户时刷新并重试一次，不重试权限错误。刷新请求若网络结果不确定，应重新认证，勿循环重试已消费的秘密。

原生客户端未被浏览器 CORS 约束；浏览器仍遵守本站来源限制。本模块没有开放任意跨域前端，独立站点接入需另行配置明确的来源策略，不能取消现有 CSRF 校验。

## 用户 API / 脚本

在“个人中心 → 访问令牌”创建命名令牌，选择自己已经拥有的一个角色，填写可选备注，有效期下拉选择 1 天、7 天、30 天、90 天或永久。秘密仅在创建完成时显示一次，关闭后不能再读取。多个角色应分别签发不同的令牌。

```sh
# 令牌从你使用的秘密管理工具注入，不写入代码仓库。
curl -H "Authorization: Bearer $UNICORE_API_TOKEN" \
  https://your-instance.example/api/v1/notes
```

```ts
import { BearerTransport } from '@unicore/sdk';
const api = new BearerTransport('https://your-instance.example', tokenFromSecureStore);
const notes = await api.call('listNotes');
```

每用户最多 50 条有效令牌，每签发操作者每小时最多创建 30 次。列表支持名称、备注搜索，管理列表还支持用户名搜索，并按页读取。PAT 只获得绑定角色当前的权限点、operation 授权和数据范围，不会叠加账号其他角色。角色对用户与管理 API 的授权仍按具体 operation 区分；界面不再逐项选择 API。认证、本人账号恢复/凭证管理及超级管理员专属 API 不接受 PAT，即使绑定 super_admin 也不能绕过。

续期不改变原令牌：未到期的有限令牌从原到期时间延长；已过期或永久令牌选择有限期限时从现在计算；选择永久则不设到期时间。作废立即生效，不能通过续期恢复。因账号、密码、角色或设备安全变更失效的令牌也不可恢复，须重新签发。永久只表示没有时间期限。

本人管理 API：GET/POST `/api/v1/account/tokens`、DELETE `/api/v1/account/tokens/{id}`、POST `/api/v1/account/tokens/{id}/renew`、GET `/api/v1/account/token-roles`。管理员工作台通过对应 `/admin/account/*` 别名管理本人令牌。这些入口仅接受浏览器 Cookie，写请求必须 CSRF，Bearer 凭证不能继续签发凭证。

超级管理员在“超级管理员 → 访问令牌管理”查看、搜索、分页管理所有人的令牌，选择目标用户后只能从该用户的现有角色中签发，支持备注、续期和作废。接口为 `/api/v1/admin/access-tokens`、`/{id}`、`/{id}/renew`、`/users` 和 `/users/{id}/roles`，分别要求 tokens:read/write、super_admin 和浏览器会话，写请求要求 CSRF。被禁用的用户不能新建或续期，但其历史记录仍可被超级管理员作废。

在个人页作废立即生效。修改密码、调整角色、禁用账号或“下线其他设备”也会使关联 PAT 失效；普通浏览器退出不影响独立 PAT。列表只显示元数据，不返回秘密，PAT 元数据不会被客户端刷新凭证的到期清理删除。签发、刷新、撤销、刷新重放与密钥轮换记录审计；业务操作沿用既有业务审计。

## 密钥与部署

生产 API 应通过 HTTPS 访问。JWT 签名密钥加密保存在平台数据库，依赖实例密钥 `secret.key` 或 APP_SECRET_KEY。备份恢复须保留同一实例密钥。只有 super_admin 能使用 Cookie + CSRF 调用 POST `/api/v1/admin/auth/token-keys/rotate`；旧密钥保留 15 分钟验证窗口，新签发和刷新立即使用新密钥。

签名采用 HS256，仅由本实例验证。不能把签名秘密分给外部程序，也不提供将本框架作为 OAuth2/OIDC 授权服务器的能力。浏览器、JWT 和 PAT 共用同一 RBAC，不是三套账号。

现有限流和图形验证码仍为进程内存；多实例部署需要保持既有粘性路由约束或增加共享实现。本次认证能力不等同于完成所有多实例部署改造。

当前未发布基线为 platform@1，不提供旧开发令牌结构的升级路径。开发验证使用新的隔离数据库，不能修改已有库账本冒充升级。
