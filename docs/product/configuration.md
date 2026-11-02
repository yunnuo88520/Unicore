<!-- Author: yunnuo <ymz@ebox.vip> -->
# 配置说明与参数表

Web 部署先按 [从零部署指南](deployment.md) 启动并完成安装。本页区分四类配置：进程启动参数、首次安装信息、管理员全局设置、当前设备偏好。它们的存储位置和生效方式不同，不能把数据库密码或后台设置任意改写成 `APP_*` 变量。

## 1. 配置在哪里修改

| 类别 | 配置入口 | 保存位置/生效方式 |
| --- | --- | --- |
| 启动参数 | `bin/server`/`./unicore` flags、进程环境变量、显式 JSON | 控制监听/数据目录/日志等；修改后重启进程或重建容器 |
| 首次安装 | 浏览器 `/install` | profile、加密数据库连接、安装 origin、实例 ID 持久化；正常重启不重填 |
| 全局管理设置 | 平台后台“系统管理 → 系统设置” | SettingDefinition 校验后写入数据库；保存后按功能生效；仅管理员 |
| 个人中心 | 个人资料、安全设置、登录会话 | 只影响当前身份域本人；不能修改全局配置 |
| 设备外观 | 右上角语言/主题控件、本地外观页 | 当前设备浏览器/Wails 本地保存；不写站点全局设置 |
| 构建开关 | `FEATURE_LICENSE`、`FEATURE_UPDATER` | 构建 Go 与前端时使用，改变后要重新构建；不是运行时开关 |

`web-standalone`/`desktop` 没有平台账号、SMTP/站点管理后台；CLI 无 HTTP/数据库。配置文件不负责创建管理员，也不支持将已安装的在线版无声转换成单机版。

## 2. Web 启动参数完整对照

优先级：**命令行 flag > 非空 `APP_*` 环境变量 > 显式 JSON 文件 > 默认值**。配置文件只有 `--config`/`APP_CONFIG` 指定才读取，不会自动加载当前目录的 `unicore.json` 或 `.env`。环境变量为空时视为未指定，禁用布尔项请明确使用 `false`。

| flag | 环境变量 | JSON 字段 | 默认值 | 格式、用途与限制 |
| --- | --- | --- | --- | --- |
| `--config PATH` | `APP_CONFIG` | 不适用 | 不读取文件 | 显式 JSON 路径；文件可读且必须合法，传空路径报错 |
| `--listen ADDRESS` | `APP_LISTEN` | `listen` | `127.0.0.1:8080` | `IP:端口`；容器默认另设 `0.0.0.0:8080`，宿主机限制映射地址 |
| `--profile PROFILE` | `APP_PROFILE` | `profile` | 未显式指定时使用程序默认 Web 形态 | `web-platform`/`web-standalone`；Web 发行包各自编译默认值，已安装时不能与持久化形态冲突 |
| `--data-dir PATH` | `APP_DATA_DIR` | `data_dir` | `data` | 完整私有数据目录；生产使用绝对路径，Docker 默认 `/data` |
| `--deployment KIND` | `APP_DEPLOYMENT_KIND` | `deployment` | `development` | `development`/`tar`/`docker`；表示交付介质和更新能力，不决定用户身份形态 |
| `--log-level LEVEL` | `APP_LOG_LEVEL` | `log_level` | `info` | `debug`/`info`/`warn`/`error` |
| `--log-format FORMAT` | `APP_LOG_FORMAT` | `log_format` | `json` | `json`/`text`，输出到进程 stdout，由 journal/容器日志接收 |
| `--api-docs=true` | `APP_API_DOCS` | `api_docs` | `false` | JSON 使用布尔值；开启 `/docs/api` 与 `/openapi.json`，关闭为 404 |
| `--monitor-listen ADDRESS` | `APP_MONITOR_LISTEN` | `monitor_listen` | 空，关闭 | 独立 `/metrics`；只能填字面回环 IP，例如 `127.0.0.1:9090`，不能用 `0.0.0.0`/`localhost` |
| `--shutdown-timeout DURATION` | `APP_SHUTDOWN_TIMEOUT` | `shutdown_timeout` | `5s` | `100ms`–`2m`；SIGTERM 后在途请求排空期限；supervisor 停止等待需相应留余量 |
| `--readiness-timeout DURATION` | `APP_READINESS_TIMEOUT` | `readiness_timeout` | `2s` | `100ms`–`10s`；数据库等依赖就绪探测的超时 |

相对路径以**进程当前工作目录**为准，shell 入口不会自动切到解压目录。systemd 模板的工作目录为 `/var/lib/unicore`，容器与交互终端也可能不同，因此线上推荐绝对路径。

### 生成并使用 JSON

Linux Web 包根目录可运行：

```sh
./unicorehelp
./unicore help
./unicore config generate --output unicore.json
# 先编辑数据目录、监听等，再启动
./unicore --config unicore.json
# 兼容命令，语义相同，拒绝覆盖已有文件
./unicore generate-config --output another-config.json
```

也可用 `bin/server config generate`、`bin/server --config`。生成文件权限为 `0600`，拒绝覆盖已有文件/符号链接，不包含密钥、数据库密码或管理员密码。示例：

```json
{
  "listen": "127.0.0.1:8080",
  "profile": "web-platform",
  "data_dir": "/var/lib/unicore",
  "deployment": "tar",
  "log_level": "info",
  "log_format": "json",
  "monitor_listen": "",
  "shutdown_timeout": "5s",
  "readiness_timeout": "2s",
  "api_docs": false
}
```

可以只提供需要覆盖的字段，其余取默认值。未知字段、`null`、除 `profile`/`monitor_listen` 外的显式空字符串、无效枚举和超时会拒绝启动。JSON 不允许注释或尾逗号；不要在里面添加 `database`、`password`、`secret_key` 等未定义字段。

命令行覆盖示例（启动服务后按 Ctrl+C 结束）：

```sh
APP_LOG_LEVEL=warn ./unicore --config unicore.json --log-level info
```

最终日志级别为 `info`。排查未生效时先检查 service/env/容器 `environment` 是否设置了同名项，不要反复修改被更高优先级覆盖的 JSON。

### systemd 使用 JSON

默认 unit 已有 `APP_LISTEN`、`APP_DATA_DIR`、`APP_DEPLOYMENT_KIND`；这些值优先于 JSON。采用本文部署指南默认目录时，可保留 unit、在 `/etc/unicore/unicore.env` 设置 `APP_CONFIG=/etc/unicore/unicore.json`，JSON 中其他参数生效。要以 JSON 为唯一启动参数来源，创建 drop-in，清除已有三项环境并指定配置路径：

```ini
# /etc/systemd/system/unicore.service.d/config.conf
# Author: yunnuo <ymz@ebox.vip>
[Service]
UnsetEnvironment=APP_LISTEN APP_DATA_DIR APP_DEPLOYMENT_KIND
Environment=APP_CONFIG=/etc/unicore/unicore.json
```

`UnsetEnvironment` 在最终进程环境组装时生效，包括 env 文件中的同名项；JSON 的数据目录仍须与 unit 的 `ReadWritePaths`/用户权限匹配。若还需 flag，在 drop-in 中先写空 `ExecStart=` 再写完整启动命令。完成后 `systemctl daemon-reload`、`systemctl restart unicore`，查看日志。

### Docker 使用 JSON

镜像已有 `APP_LISTEN`、`APP_DATA_DIR`、`APP_DEPLOYMENT_KIND`，推荐直接通过环境配置容器启动。必须用 JSON 时，只读挂入容器并传 `--config`；注意 JSON 的 `listen`/`data_dir` 仍会被上述镜像环境覆盖，除非用 flags 明确覆盖。例：

```sh
# 在完整 docker run 参数中加入：
# --mount type=bind,src=/绝对路径/unicore.json,dst=/etc/unicore.json,readonly
# 镜像名后追加：
# --config /etc/unicore.json --listen 0.0.0.0:8080 --data-dir /data --deployment docker
```

容器 UID 65532 必须可读取挂入文件；`0600 root:root` 文件对它不可读。使用受限属组/ACL 或合适的属主，不放宽整个数据目录权限。

## 3. 安装、安全与更新环境变量

这些变量不属于上面的 JSON schema；没有同名 flag 时不要自行发明。通常只需设置 data/listen/deployment，安装 token 和密钥让程序生成即可。

| 环境变量 | 默认/格式 | 用途与操作 |
| --- | --- | --- |
| `APP_BOOTSTRAP_TOKEN` | 未设置时自动生成；注入值 32–256 字符 | 未安装实例的一次性所有权证明；初次成功后吊销。每次未安装启动持续注入会重新采用该值，使用后移除部署覆盖；显式重装使用新生成 token |
| `APP_SECRET_KEY` | 未设置时生成 `secret.key`；外置时为标准 base64 编码的 32 字节密钥 | 加密数据库连接、SMTP/TOTP 等；与安装 token 不同。已安装后必须持续使用同一密钥，不能随意重生或替换 |
| `APP_ADMIN_PATH` | 默认持久设置 `/admin`；格式如 `/manage` | 管理后台路径恢复覆盖；单段 `/` 加字母开头的 2–32 位字母/数字/`_`/`-`，避开 `/api`/`/install` 等保留路径；不改变 API 权限 |
| `APP_UPDATE_REPOSITORY` | 构建内置仓库，可覆盖为 `owner/repo` | 更新渠道；公开 GitHub 仓库无需 token，派生产品应使用自己的仓库 |
| `APP_UPDATE_FEED_URL` | 未设置 | 自有 HTTPS 更新 feed；不把凭据写进 URL |
| `APP_UPDATE_TRUST_FILE` | 未设置时使用构建内置信任设置 | 受控 JSON 公钥/信任配置，不能由远端 feed 改写 |
| `APP_UPDATE_CA_FILE` | 未设置 | 更新服务私有 CA 文件；仍验证 HTTPS 身份 |
| `APP_UPDATE_INSTALL_DIR` | 未设置，tar 默认只检查 | tar 的完整安装根，数据必须在其外；自动安装还需受限写权限、staging、可信签名等条件 |
| `APP_UPDATE_RESTART` | 默认自启动；systemd 模板设 `supervisor` | updater 重启策略，`supervisor` 交给服务管理器；Docker 始终由外部替换镜像 |

更新变量只有构建包含 updater 时才相关，签名与兼容性要求见 [更新指南](updates.md)。数据库迁移变化应人工停服、备份、验证后升级，不能因配置了目录就假定可自动升级。外置密钥通过受控配置/Secret 注入，别放源码、镜像或公开命令日志；备份时同步保管。

## 4. 首次安装数据库参数

两种 Web 都通过 `/install` 保存连接。向导默认 MySQL；SQLite 必须主动选择。点击测试连接成功才能继续，修改任意字段后重测。数据库和账号的创建命令见 [部署指南](deployment.md)。

| 安装字段 | 类型/默认 | 说明 |
| --- | --- | --- |
| `driver` | `mysql` / `postgres` / `sqlite` | Web 支持三种；桌面只 SQLite，CLI 无数据库 |
| `host` | 字符串，默认 `127.0.0.1` | 外部数据库地址，不含协议、端口；Compose 同网络通常为服务名 `db` |
| `port` | 整数，MySQL `3306` / PG `5432` | 1–65535 |
| `name` | 字符串，默认 `unicore` | 已创建的独占库，拒绝 mysql/postgres 等系统库；PG 限独占 public schema |
| `username` | MySQL 默认 `root` / PG 默认 `postgres` | 仅向导初始占位，部署应换专用账号，不表示建议给应用全局 root |
| `password` | 字符串，无默认 | 数据库账号口令，特殊字符由驱动安全编码，不需要用户拼接 URL |
| `tls` | 布尔，默认 `false` | PG `require`、MySQL `skip-verify`；仅加密、不验证证书身份 |
| `dsn` | 旧 API 兼容字段，页面不展示 | 不能与 host/port/name 等结构化字段混传；需严格证书校验时核对对应驱动 DSN 能力 |

SQLite 不填写上述外部连接字段/DSN，固定使用 data 目录中的 `unicore.db`。应用不创建外部数据库本身，账号需要专用库内的迁移/表/索引/约束权限；不要用真实共享库做连接测试或试装。

安装 origin 自动取浏览器实际地址，影响 Secure Cookie 与 OIDC callback；`site.base_url` 只覆盖邮件生成链接。需变更正式域名时先评估安装 origin 的迁移/恢复方案，不能只改邮件地址后宣称站点迁移完成。

安装配置保存后优先恢复原配置，环境变量不用于改数据库或更换形态。换 profile 应部署新实例/新数据目录，数据库迁移或跨引擎转换不由修改 JSON 实现。

## 5. 平台后台设置表

以下为实例全局配置，**只在 `web-platform` 管理后台修改**，不是启动 JSON/环境变量。设置 key 供开发/API 对照，使用者在对应页面填写即可；敏感项加密保存、接口不返回明文。详细安全与设备流程另见后台“个人中心”。

### 站点、备案与维护

| 设置 key | UI/默认值 | 用途与限制 |
| --- | --- | --- |
| `site.name` | 站点名称，默认产品名称 | 1–64 字符，不为空；标题/邮件等使用 |
| `site.description` | 默认“一份核心，无限可能” | 站点介绍，最多 240 字符 |
| `site.base_url` | 站点地址，默认空时回退安装地址 | http(s) origin，最多 2048 字符；不带凭据、query、fragment 或子路径；用于邮件链接，不修改 Cookie/OIDC origin |
| `site.admin_email` | 管理员邮箱，默认空 | 系统告警/通知接收地址配置；不等于本人登录邮箱，不自动创建外部监控告警集成 |
| `site.copyright` | 默认 `Crafted by Yunnuo` | 页脚版权，最多 160 字符 |
| `site.icp_number` | ICP 备案号，空 | 最多 80 字符 |
| `site.icp_url` | 默认 `https://beian.miit.gov.cn/` | 备案查询 HTTPS 地址 |
| `site.police_number` | 公安备案号，空 | 最多 80 字符 |
| `site.footer_html` | 自定义页脚 HTML，空 | 最多 4000 字符，按安全标签/链接白名单验证，不支持脚本、任意嵌入或模板变量 |
| `branding.logo` / `branding.logo_dark` / `branding.favicon` | 默认产品素材 | 通过品牌上传控件管理 file_id 引用，不手填磁盘路径或私有云 URL |
| `maintenance.enabled` | 维护模式，`false` | 普通用户看到维护状态，管理员仍能进后台关闭；不替代停进程备份 |
| `maintenance.message` | 维护提示，空 | 最多 1000 字符；未填显示默认提示 |

### 登录、注册和双重验证

| 设置 key | 默认值 | 说明 |
| --- | --- | --- |
| `admin.path` | `/admin` | 后台入口；改后记住新路径，旧入口 404；误配可用 APP_ADMIN_PATH 恢复 |
| `security.login_captcha` | `true` | 登录图形验证码 |
| `security.register_captcha` | `true` | 注册图形验证码 |
| `security.session_hours` | `24` | 会话有效期，1–168 小时 |
| `account.registration_enabled` | `false` | 是否开放普通用户注册，与邮箱验证独立；不开放管理员自助注册 |
| `account.email_verification_required` | `false` | 注册是否必须验证邮箱；开启需 SMTP 测试，关闭无需 SMTP |
| `account.email_domain_mode` | `unrestricted` | 邮箱后缀不限制 / `allowlist` 白名单 / `blocklist` 黑名单 |
| `account.email_domains` | 空 | 每行一个精确域名，如 example.com，限制注册和注册验证发信 |
| `account.nickname_blacklist` | 空 | 每行一条，不区分大小写，包含匹配；禁止注册/资料修改 |
| `account.username_blacklist` | 空 | 同上；既有用户名命中也拒绝资料修改，用户名不可修改 |
| `account.password_blacklist` | 空 | 不区分大小写，完整匹配；禁止注册/改密/重置中的密码 |
| `account.ip_blacklist` | 空 | 单 IP、CIDR、末尾通配符；拒绝注册/登录。使用 socket IP，不信任转发头，代理入口另配客户端过滤 |
| `account.email_login_enabled` | `false` | 邮箱验证码登录，需邮件配置验证 |
| `account.password_reset_enabled` | `false` | 邮件找回密码，需邮件配置验证 |
| `security.login_failure_limit` | `5` | 同一身份域/IP 连续登录失败封禁次数，1–20；成功登录清除计数 |
| `security.ip_ban_minutes` | `15` | 临时封禁时长，1–1440 分钟；不冻结账号 |
| `security.user_idle_minutes` | `1440` | 普通用户空闲超时，1–10080 分钟 |
| `security.admin_idle_minutes` | `360` | 管理员空闲超时，1–10080 分钟 |
| `security.admin_max_minutes` | `1440` | 管理员首次登录起最长时间，1–10080 分钟，与会话小时数取较短者 |
| `security.force_admin_2fa` | `false` | 强制管理员先绑定验证器，且不能自行关闭 |
| `security.force_user_2fa` | `false` | 强制普通用户先绑定验证器，且不能自行关闭 |
| `security.force_2fa` | 旧兼容键 | 已隐藏；旧实例映射至两类账号开关，旧 API 写入仍同步两者 |
| `security.allow_disable_2fa` | `true` | 是否允许本人关闭；强制开启时不能关闭 |

新实例关闭邮箱验证时注册成功即可登录，不发验证邮件；旧实例已开放注册且尚无独立验证键时继续要求验证，需管理员明确关闭。列表最多 200 条/16000 字符。

用户登录 /login、注册 /register、忘记密码 /forgot-password 使用相互链接的独立页面，支持浏览器前进/后退。注册和重置密码均需确认密码；完成注册后进入 /registration-success，仅提供一个返回登录主入口。找回密码入口始终可见，实例未开放邮件恢复时提示联系管理员；真正发送和重置仍由服务端策略决定。

用户名、邮箱在各身份域内唯一，大小写或提交前后的空格不能绕过。重复注册返回 409 与对应字段提示；不创建新账号、不覆盖原密码，也不显示注册成功。用户和管理员仍是独立身份域，可各自使用相同邮箱而不合并身份。密码找回等邮件恢复流程不透露账号是否存在。

全局账号策略在「系统管理 → 系统设置 → 账户安全」，本人验证器设置仍在「个人中心 → 安全设置」。后台 bootstrap/会话轮询不续期，主动业务请求刷新空闲时间；最长登录时间不续期。IP 临时封禁按进程内、身份域及 socket IP 记录，重启会清空；持久 IP 黑名单不随重启清空。反代入口需另行过滤实际客户端 IP，应用不信任任意转发头。管理员/普通用户列表的双因素字段只读，不提供清除他人验证器的后门。

昵称、账号邮箱、密码、验证器与恢复码属于本人账户安全设置；邮箱换绑须先验证旧邮箱再验证新邮箱。恢复码只显示一次，保存在安全位置，不能从后台重复读取。管理员与普通用户分域，配置相同邮箱不合并身份。

### SMTP、邮件与企业登录

| 设置 key | 默认值 | 说明 |
| --- | --- | --- |
| `mail.host` | 空 | SMTP 主机，不带协议/路径 |
| `mail.port` | `587` | 1–65535，按服务商要求；隐式 TLS 常用 465 |
| `mail.tls` | `starttls` | `starttls`/`tls`/`plain`；生产优先加密，明文不用于公网 |
| `mail.from` | 空 | 发件邮箱，需服务商允许 |
| `mail.from_name` | 空 | 发件人别名，最多 64 字符 |
| `mail.username` | 空 | SMTP 用户名，通常为邮箱 |
| `mail.password` | 空，敏感 | 密码或服务商授权码，加密保存 |
| `oidc.enabled` | `false` | 启用企业 OIDC 登录 |
| `oidc.provider_name` | 企业账号 | 登录按钮名称 |
| `oidc.issuer` | 空 | IdP issuer，远程必须 HTTPS，HTTP 仅字面回环测试 |
| `oidc.client_id` | 空 | IdP 应用 ID |
| `oidc.client_secret` | 空，敏感 | IdP 应用密钥，加密保存 |
| `oidc.scopes` | `openid email profile` | 必须含 openid |
| `oidc.jit_enabled` | `false` | 首次企业登录可建普通用户；永远不自动建管理员 |

顺序为保存 SMTP → 发送并实际收到测试邮件 → 启用注册邮箱验证/验证码登录/找回密码。修改 SMTP 后重新测试。邮件模板由独立“邮件模板”页编辑，模板正文属于业务数据，不随 UI 语言翻译。

IdP 需登记两条固定回调（使用安装 origin；后台页面改路径不会改这两条 API）：

```text
https://app.example.com/api/v1/auth/oidc/callback
https://app.example.com/api/v1/admin/auth/oidc/callback
```

启用前分别验证普通用户、管理员、本地密码回退与回调失败。保持至少一个可用本地管理员；不要用未验证的企业登录替代所有恢复入口。

| 文件策略 key | 默认 | 说明 |
| --- | --- | --- |
| `storage.upload_paths` | 空 | 每行一个相对路径，首项默认，上传时可选择；禁止绝对路径、.. 和反斜杠 |
| `storage.allowed_extensions` | 空 | 每行一个扩展名，如 png、tar.gz；大小写不敏感，留空允许所有类型 |

文件位置、默认存储策略、单文件/分片限制另见 [存储指南](storage.md)；更新渠道与可信签名见 [更新指南](updates.md)。它们不是将同名任意配置追加到启动 JSON。

## 6. Compose 变量与应用环境的区别

| Compose 变量 | 本文示例值 | 谁读取 |
| --- | --- | --- |
| `UNICORE_IMAGE` | `unicore:0.1.2` | Docker Compose 选镜像；不等于应用版本开关 |
| `UNICORE_PORT` | `8088` | Compose 的宿主端口映射；容器内仍为 8080 |
| `POSTGRES_PASSWORD` | 自己的随机口令 | 示例 db 容器初始化；不会自动更新已存在数据库用户或应用安装记录 |
| `UNICORE_VERSION` | 源码 `VERSION` | 仅仓库自带的构建型 Compose 需要，本文独立 Compose 不需要 |
| `APP_*` | app 的 `environment` 中显式列出 | 只有传进 app 容器后才成为应用环境 |

Compose 默认读取项目目录 `.env` 进行变量替换；应用不会自动加载它。宿主 shell 同名导出值优先，实际启动按所用 compose/env 文件为准；修改后 `docker compose up -d` 重建 app 才应用，`restart` 不能切换镜像或容器环境。

## 7. 日志、健康、数据与密钥

| 路径/接口 | 含义 | 运维处理 |
| --- | --- | --- |
| `installation.json` | 实例身份、profile、加密数据库配置、安装 origin | 私有持久化，与 DB/密钥成套保存；不手工改密文 |
| `secret.key` / 外置 `APP_SECRET_KEY` | 解密数据所需实例密钥 | 丢失不能靠新建密钥解密旧数据；备份同步保管 |
| `bootstrap.token` | 仅安装前有效的所有权凭据 | 安装完成删除/吊销；从私有文件读取，不提供匿名下载 |
| `install.lock` | 安装完成锁 | 正常升级保留；仅明确重装时停服删除 |
| `instance.lock` | 同一目录进程互斥 | 不通过删锁启动第二个实例 |
| `unicore.db` / WAL/SHM | SQLite 数据 | 用一致备份/停服方案，不只复制运行中的单一主文件 |
| `files/`、品牌和其他私有目录 | 文件/分片、品牌素材及运行状态 | 完整持久化；不可置于公开静态根目录 |
| `/api/v1/health/live` | 进程可响应 | 未安装也可 200 |
| `/api/v1/health/ready` | 已安装且数据库 Ping 成功 | 未安装/依赖不可用为 503；安装完成后检查 |
| 独立 `/metrics` | 启用 monitor-listen 后的指标 | 仅受控本机采集，不映射公网；容器回环不等于宿主回环 |

Web 日志到 stdout，systemd 用 `journalctl -u unicore -f`，Docker 用 `docker logs`/`docker compose logs`；配置日志轮转与磁盘监控。CLI 的业务 JSON 到 stdout、诊断到 stderr。不要记录请求体、密码、完整 DSN、验证码、恢复码、token 或云密钥。

服务器停止等待必须覆盖应用排空期限。默认应用 5 秒、示例 systemd/容器 15 秒；调大应用超时时同步调大 supervisor 的停止等待。收到 SIGTERM 后等待请求/worker 退出，不在迁移/更新中强杀进程。

Windows GUI 无控制台，启动错误显示原生错误弹窗；桌面数据默认位于系统应用数据目录的 `Unicore/desktop`，可用 `APP_DATA_DIR` 指定隔离目录。排查不要删真实 AppData。正常重启又进安装页，应先找回原目录/卷；数据库失败先恢复连接和原密钥，不删除安装状态自动重装。

返回 [使用指南](index.md)；完整操作见 [部署指南](deployment.md)、[备份恢复](backup.md)。
