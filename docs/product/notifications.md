<!-- Author: yunnuo <ymz@ebox.vip> -->
# 通知与邮件：配置及开发接入

仅 Web 平台提供邮件与外部通知能力。Web 单机、Desktop 和 CLI 不装配平台 SMTP、企业微信、Webhook 或账号通知服务。前端短暂的成功/错误提示使用共享 `useMessage`；平台公告使用公告管理和顶部铃铛；本页介绍业务邮件和外部渠道通知。

## 选择能力

| 需求 | 应使用的能力 | 成功结果表示什么 |
| --- | --- | --- |
| 给指定邮箱或管理员邮箱发一封业务邮件 | 服务端 `mailer.Service.Notify` | 加密任务已持久入队，尚未保证送达 |
| 根据管理员配置，把事件发给用户、管理员或通知渠道 | `mailer.Plan` + 业务事务内入队 | 业务和通知任务一起提交，worker 后续投递 |
| 验证 SMTP 配置 | 邮件设置的测试发送 / `Mail().Test` | SMTP 接受测试邮件，随后保存配置指纹 |
| 验证邮件模板草稿 | 邮件模板页的测试发送 | SMTP 接受当前草稿，不保存模板 |
| 验证通知渠道 / 通知模板草稿 | 通知渠道 / 通知模板页的测试发送 | Webhook HTTP 2xx；企业微信另需 `errcode=0` |

不要从浏览器或业务 usecase 自行拼接 SMTP/Webhook 请求；普通用户没有任意发信或读取渠道凭据的公共 API。管理员页面使用共享 SDK，服务器仍检查管理员身份、权限及 CSRF。

## 管理员从零配置

### 邮件

1. 在基础设置填写站点名称、站点地址和管理员邮箱。管理员邮箱是告警邮件接收地址，不会修改后台登录邮箱，也不代表全部管理员订阅。
2. 在邮件设置填写 SMTP 主机、端口、加密方式、发件邮箱、用户名和授权码。常见组合是 465 + `tls`，或 587 + `starttls`；具体以邮件服务商为准。发件邮箱必须被服务商允许。
3. 保存后发送测试邮件，填写你有权使用的测试收件邮箱。收到“测试成功”表示 SMTP 已接受邮件，仍需检查收件箱、垃圾箱和服务商退信；可按服务商要求配置 SPF、DKIM 和 DMARC。
4. 连接参数或密钥改变后重新测试。发件人别名变化不撤销连接测试；账号、密码、TLS 等连接参数改变会使原指纹失效。
5. 在邮件模板编辑服务测试、注册验证、登录验证码、密码重置或系统通知。验证码场景必须保留 `{{code}}`；不要在系统通知中生成账号验证码。

SMTP 设置的完整参数表见 [配置说明](configuration.md)。注册开关与邮箱验证互相独立：不要求验证时可以无需 SMTP 注册；邮箱验证、验证码登录和邮件找回密码需要已测试的 SMTP。

### 企业微信群机器人

1. 在企业微信群创建机器人并复制 Webhook 地址。
2. 进入 **系统设置 → 通知渠道**，选择“企业微信群机器人”。从地址 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_BOT_KEY` 中只取 `YOUR_BOT_KEY`，填入“机器人 Key”，不要填整条地址。
3. 开启通知渠道、保存，再点击“测试发送”。框架检查 HTTP 成功状态和企业微信 JSON 中的 `errcode=0`，不是只看请求有没有返回。
4. 在 **系统设置 → 系统通知 → 管理员通知** 勾选需要的事件渠道开关，并开启系统通知总开关、保存。测试发送独立于系统通知总开关；自动业务通知则需要两个总开关和对应事件开关同时满足。

机器人 Key 加密存储且不回显；空白保存表示保持不变，明确勾选清除才删除。不要在仓库、文档或截图中填写真实 Key。机器人仅接收发送给其所在群的管理员渠道消息，不会给普通用户私聊发送。

### 自定义 Webhook

选择“自定义 Webhook”，填写公网 HTTPS 回调地址，可选填写签名密钥，保存并测试。企业微信与 Webhook 一次只能选择一个，切换保留各自配置。

| 字段 / 协议 | 约定 |
| --- | --- |
| 请求 | POST，`Content-Type: application/json` |
| JSON | `title` 标题、`content` 纯文本正文、`event` 事件键；模板测试时事件可能为空 |
| 签名 | 可选 `X-Unicore-Signature`，值为原始请求体 HMAC-SHA256 的小写十六进制摘要，不带前缀 |
| 接收成功 | HTTP 2xx；非 2xx 进入失败处理，不解析 Webhook 自定义业务状态 |
| 网络边界 | 公网 HTTPS；禁止私网、回环、链路本地、保留网络和重定向；不使用代理环境变量 |
| 超时 | 每次请求最多 10 秒 |

```json
{"title":"Unicore · 账号登录通知","content":"账户：example_user\n时间：2026-01-01T12:00:00Z","event":"login"}
```

接收端必须使用**未重新序列化的原始请求字节**验签，摘要采用恒定时间比较；不要先解析 JSON 再重新编码计算签名。通知至少投递一次，进程崩溃或网络确认丢失时可能重复，接收端应按业务设计去重。

## 两层模板与事件策略

| 位置 | 作用 | 典型变量 |
| --- | --- | --- |
| 邮件模板 → 系统通知 | 邮件主题和受限 HTML 正文，保留品牌外壳 | `site_name`、`site_url`、`title`、`detail` |
| 通知模板 | 每个业务事件的纯文本标题和正文 | `site_name`、`site_url`、`username`、`event_time`、`ip`、`message` |
| 系统通知 | 决定每个事件的用户邮件 / 管理员邮件 / 管理员渠道 | 无模板内容，仅路由开关 |

邮件事件先渲染通知模板，再将结果作为 `title` / `detail` 交给邮件系统通知模板；渠道消息直接使用纯文本。业务输入经过一次变量替换和必要转义，不执行任意模板逻辑。邮件模板内容不因界面切换语言而自动翻译。

当前已有事件：`login`、`ip_banned`、`password_changed`、`totp_enabled`、`totp_disabled`、`account_disabled`、`account_enabled`、`registered`、`user_created`、`admin_created`、`sessions_revoked`、`email_changed`。2FA 登录在第二因素通过后通知；注册在账户激活后通知；状态重复保存不重复通知。IP 封禁无法确认目标账户，仅通知管理员。

系统通知总开关默认关闭，避免升级意外发信。用户邮件仅发送给事件所属普通用户；管理员邮件发送到基础设置的管理员邮箱；渠道发送到当前机器人或 Webhook。同一事件重复邮件地址合并。未就绪 SMTP 或缺少收件邮箱时跳过相应邮件，不阻塞渠道消息。

## 开发者：直接发送业务邮件

从 Web 平台组合根注入已有 `*mailer.Service`。不要在领域层引用安装管理器、SMTP 或数据库。下面是一个可由平台服务层调用的最小 helper：

```go
// Author: yunnuo <ymz@ebox.vip>
package reportnotification

import (
    "context"
    "errors"

    "github.com/yunnuo/unicore/internal/mailer"
)

func QueueReportReady(ctx context.Context, service *mailer.Service, recipient, actorID string) error {
    if service == nil {
        return errors.New("mail is unavailable in this profile")
    }
    return service.Notify(ctx, mailer.Notification{
        To: recipient,
        Title: "报表已生成",
        Detail: "你请求的报表已生成，请登录站点查看。",
    }, actorID)
}
```

在组合根以 `manager.Mail()` 注入 `service`，`actorID` 必须来自可信的服务端身份；定时任务应按自身审计约定提供固定服务身份。`recipient` 为空时使用 `site.admin_email`；非空时必须是合法邮箱。标题非空、最多 80 字符、禁止换行；详情非空、最多 2000 字符。内容不要包含密码、验证码、恢复码、私密下载 URL 或未经授权披露的个人信息。

返回 `nil` 只表示入队。`settings.ErrMailNotReady` 表示 SMTP 尚未配置并测试通过；`settings.ErrInvalid` 表示参数或收件地址无效；`mailer.ErrUnavailable` 表示缺少所需队列能力。持久化失败向调用方返回错误。不要把 SMTP 错误中的地址或密钥拼进对用户响应。

`Notify` 仅发送邮件，不走系统事件矩阵，也不受该矩阵总开关控制。它适用于业务明确要求的一封邮件。该调用自行开启队列事务，因此只能在**没有持有数据库事务时**调用。若业务提交成功后才调用，入队失败不会自动回滚业务；调用方需记录可重试状态。需要原子一致性时使用下一节的方法。

## 开发者：复用事件策略并原子入队

`mailer.Plan` 只根据设置快照、事件和模板生成待投递消息，不做网络操作、数据库写入或凭据解密。`internal/adapter/storage/platformsql/notifications.go` 中的 `queueEvent` 是当前身份事件的完整示例：读取同一事务的设置及目标账户、解密敏感值、生成消息，再把加密载荷写入队列，与业务和审计一起提交。

以下 helper 展示**已生成消息**如何加入调用方持有的 SQL 事务；业务 adapter 负责先修改业务状态和写审计，最后统一 `Commit`，任何一步失败都 `Rollback`：

```go
// Author: yunnuo <ymz@ebox.vip>
package eventoutbox

import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"

    "github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
    "github.com/yunnuo/unicore/internal/mailer"
)

func Enqueue(ctx context.Context, store *sqlstore.Store, tx *sql.Tx,
    secrets mailer.Secrets, messages []mailer.Message, now int) error {
    for _, message := range messages {
        body, err := json.Marshal(message)
        if err != nil { return err }
        payload := secrets.Seal(string(body))
        if len(payload) > 65535 { return errors.New("notification payload too large") }
        channel := message.Channel
        if channel == "" { channel = "email" }
        switch channel {
        case "email", "wecom", "webhook":
        default:
            return errors.New("unknown notification channel")
        }
        _, err = store.Exec(ctx, tx,
            "INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES(?,?,?,'pending',0,?,?,?,'',0,'')",
            "notify-"+channel+"-"+sqlstore.ID(), "", payload, now, now, now+86400)
        if err != nil { return err }
    }
    return nil
}
```

调用前由 adapter 执行 `messages, err := mailer.Plan(values, event)`，`values` 是**同一事务内**读取并解密的设置快照，`event` 是服务端构造的 `mailer.Event`。`Kind` 必须存在于事件目录；`Username` / `Email` 是目标用户最小快照，`Administrator` 标识目标账户身份域，`At` 是 Unix 秒，`IP` 来自可信连接上下文，`Detail` 只含允许外发的简短业务信息。不得将此数据结构直接接收为公开用户请求。

必须保留调用方的事务授权、锁顺序和审计。不要在持有 SQLite 事务时调用 `Settings.Raw`、`Mail().Notify` 或另开连接；这会与单连接策略冲突。helper 放在平台数据库 adapter 内；共享 usecase 依赖你自己的事件 port，不导入 `sqlstore`、HTTP 或平台身份实现。

新增事件需要同时增加 `notifycontent.Events`、默认路由/模板、前端中英文场景，以及旧配置归一化策略；不能只在业务里写一个新 `Kind`。未知事件在启用通知时返回模板错误，未规划的消息不会自动获得默认发送权限。参照当前目录的输入验证、权限、事务回滚、2FA、重试和恢复测试扩展。

## SDK 与测试边界

已有管理员 `WebClient` 方法如下，调用时复用已认证的 `client.web`，不要在页面硬编码 API 地址：

| 方法 | 用途 |
| --- | --- |
| `notificationSettings()` | 读取通知配置，凭据只返回 configured 状态 |
| `saveNotificationSettings(config)` | 原子保存通知配置、事件矩阵及模板 |
| `previewNotification(template)` | 用示例数据渲染纯文本草稿 |
| `testNotification({template,destination,recipient})` | 测试 `channel` 或 `email` 目标；recipient 仅用于邮件 |
| `mailTemplates()` / `saveMailTemplate(input)` | 读取 / 保存邮件模板 |
| `previewMailTemplate(input)` / `testMailTemplate(input)` | 预览 / 实发邮件模板草稿 |
| `mailJobs()` | 读取最近投递任务，包含渠道类型与脱敏状态 |

测试接口每个管理员限流 5 次/分钟。测试动作会真实外发，自动化使用本地 SMTP 或注入的渠道 fixture，不配置真实机器人 Key。编写端到端业务测试时还应验证匿名/普通用户拒绝访问、CSRF、密钥不回显、关闭开关不发送、业务失败不留任务、重启恢复及重复投递处理。不要在业务请求内自行调用 worker 的 `Tick`；它由进程生命周期统一驱动。

## 投递、排错与恢复

系统日志 → **通知投递** 展示最近 30 个任务和邮件 / 企业微信 / Webhook 渠道，不返回载荷、收件人或凭据。进程每秒认领一个任务；最大 5 次尝试，失败延迟 10/20/40/80 秒，租约 60 秒，事件任务有效期 24 小时；终态清除载荷，元信息最多保留 7 天。至少一次投递不等于严格一次。

| 状态 / 现象 | 排查方式 |
| --- | --- |
| 测试成功但无自动消息 | 检查系统总开关、渠道总开关和对应事件路由；测试本身不启用自动事件 |
| 没有邮件任务 | 检查 SMTP 指纹是否有效、用户邮箱 / 管理员邮箱是否存在，以及邮件事件开关 |
| `pending` / `sending` | 等待下一次调度；`sending` 进程异常退出后等待租约恢复 |
| `sent` | 远端已接受；邮件仍需检查退信和垃圾箱，企业微信需确认机器人所在群 |
| `dead` / `DELIVERY_FAILED` | 检查 SMTP 参数、机器人 Key、Webhook 网络和响应；修复后用测试发送确认，再触发新的业务事件 |
| `EXPIRED` | 超过任务有效期，不再投递 |
| `cancelled` / `DISABLED` | 系统/渠道关闭或渠道类型切换，旧任务跳过且不会自动补发 |

事件内的单独路由开关影响新建任务；已经入队的内容和收件人保持快照，凭据使用投递时的当前配置。系统/渠道总开关在投递时复核。数据库和实例密钥必须成套备份；详见 [备份指南](backup.md)。本功能复用既有设置/队列表，无需新增 schema 迁移。降级前关闭事件并排空渠道任务，旧程序不理解新版渠道载荷。
