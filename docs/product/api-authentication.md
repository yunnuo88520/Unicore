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

在“个人中心 → 安全设置 → 个人访问令牌”创建命名令牌，选择有效天数和允许调用的 API。秘密仅在创建完成时显示一次，关闭后不能再读取。

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

PAT 最长 365 天，最多 50 条有效凭证，每账号每小时最多创建 10 次。列表优先呈现有效凭证及最近历史，最多 200 条；过期超过 30 天的元数据和到期的刷新证明会在新客户端登录时清理。授权按 operationId 区分用户端与管理端 API，即使访问相同资源也必须显式选择对应 operation。权限不会超过当前账号，且继续检查数据范围与资源归属；没有菜单不会让 API 获得额外权限。PAT 无法调用认证、本人凭证管理或超级管理员专属 API。程序如果需要调用某个 API，应申请对应最小范围，而非使用超级管理员密码。

本人管理 API：GET/POST `/api/v1/account/tokens`、DELETE `/api/v1/account/tokens/{id}`、GET `/api/v1/account/token-scopes`。这些入口仅接受浏览器 Cookie，写请求必须 CSRF，Bearer 凭证不能给自己继续签发凭证。

在个人页撤销立即生效。修改密码、调整角色、禁用账号或“下线其他设备”也会使关联 PAT 失效；普通浏览器退出不影响独立 PAT。列表只显示元数据，不返回秘密。签发、刷新、撤销、刷新重放与密钥轮换记录审计；业务操作沿用既有业务审计。

## 密钥与部署

生产 API 应通过 HTTPS 访问。JWT 签名密钥加密保存在平台数据库，依赖实例密钥 `secret.key` 或 APP_SECRET_KEY。备份恢复须保留同一实例密钥。只有 super_admin 能使用 Cookie + CSRF 调用 POST `/api/v1/admin/auth/token-keys/rotate`；旧密钥保留 15 分钟验证窗口，新签发和刷新立即使用新密钥。

签名采用 HS256，仅由本实例验证。不能把签名秘密分给外部程序，也不提供将本框架作为 OAuth2/OIDC 授权服务器的能力。浏览器、JWT 和 PAT 共用同一 RBAC，不是三套账号。

现有限流和图形验证码仍为进程内存；多实例部署需要保持既有粘性路由约束或增加共享实现。本次认证能力不等同于完成所有多实例部署改造。

platform@10 为 MySQL 修正个人安全表的旧默认排序规则，使关联键与平台基线一致；表中数据保留。升级前按实例备份流程保留快照，并为 MySQL 的表转换预留 DDL 窗口。
