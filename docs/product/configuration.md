<!-- Author: yunnuo <ymz@ebox.vip> -->
# 配置、数据库与运行状态

Web 参数优先级为 flag > APP_* 环境 > 显式 JSON 配置文件 > 默认值；已安装的 Profile、数据库与设置以持久化安装信息为准，启动参数不用于无声转换已安装形态。

| 参数 | 环境变量 | 默认/说明 |
| --- | --- | --- |
| --config | APP_CONFIG | 可选启动 JSON；仅显式指定时读取 |
| --listen | APP_LISTEN | 127.0.0.1:8080 |
| --profile | APP_PROFILE | 首次选择 web-platform / web-standalone |
| --data-dir | APP_DATA_DIR | data；生产必须使用独立私有目录 |
| --deployment | APP_DEPLOYMENT_KIND | development / tar / docker |
| --log-level | APP_LOG_LEVEL | info；debug/info/warn/error |
| --log-format | APP_LOG_FORMAT | json；可选 text |
| --api-docs | APP_API_DOCS | false；按需开启 /docs/api |
| --monitor-listen | APP_MONITOR_LISTEN | 默认关闭，只允许回环地址 |
| --shutdown-timeout | APP_SHUTDOWN_TIMEOUT | 5s；100ms–2m |
| --readiness-timeout | APP_READINESS_TIMEOUT | 2s；100ms–10s |

使用 bin/server --help 查看当前参数。APP_DATA_DIR 包含安装配置、密钥与私有文件；SQLite 文件也在该实例目录。必须整套持久化，不能只保留 DB、丢弃 secret.key。使用 APP_SECRET_KEY 时备份恢复须保留对应密钥，不在命令输出、公开配置或浏览器中展示。

Linux Web 包解压后可直接使用根目录入口：

```sh
./unicorehelp
./unicore help
./unicore config generate --output unicore.json
./unicore --config unicore.json
# 兼容别名，同样拒绝覆盖已有文件
./unicore generate-config --output another-config.json
```

无参数 `./unicore` 继续按环境变量和默认值启动，不强制配置文件；生成后用 `--config` 或 `APP_CONFIG` 显式加载。JSON 字段为 listen、profile、data_dir、deployment、log_level、log_format、monitor_listen、shutdown_timeout、readiness_timeout、api_docs（布尔值）；未知字段、null、必填字段空字符串和无效参数会拒绝启动。相对路径以当前工作目录为准。生成文件使用 0600 权限，拒绝覆盖现有文件，不写入密钥或数据库凭据。数据库、管理员和首次安装由 `/install` 向导完成；此处的 Web 管理入口与无数据库的业务 CLI 独立。

## 数据库与权限

Web 两种形态支持 SQLite、PostgreSQL、MySQL，桌面仅 SQLite，CLI 不连接数据库。在线推荐 PostgreSQL/MySQL；向导填写明确 host、port、库名、账号、密码并测试连接。按最小权限创建专用账号，不连接未知共享库。三方言需要分别验证，SQLite 的 VARCHAR 不自动限制长度，不能跳过服务端校验。

在线管理员可管理全局站点信息、安全、邮件和存储；普通用户只管理自己的业务数据和本地外观。菜单隐藏不能替代后端授权。管理员/用户会话与 API 前缀分离，不通过自定义身份请求头切换身份。

## 站点、安全与邮件设置

管理员在基础设置修改站点名称、Logo/Favicon、版权与备案信息；这些是实例全局配置。外观主题、语言等客户端偏好只作用于本机。安全设置可切换登录/注册图形验证码、开放注册与后台路径。默认注册关闭、验证码开启；开放注册依赖已验证邮件配置，不把改后台路径当作认证机制。

邮件页配置 SMTP 主机、端口、加密方式、发件邮箱/别名、账号和密码或授权码。常用 STARTTLS 587 或隐式 TLS 465，但以服务商要求为准；生产不使用明文 SMTP。先向自己控制的测试邮箱发送并确认服务配置，再启用注册、验证码登录、找回密码。验证码为六位数字，仍受有效期与次数限制；不要在日志/截图公开验证码或授权码。模板内容由管理员在邮件模板页配置，属于业务内容，不由界面语言自动翻译。

需要企业登录时配置实际 IdP 的 issuer、client ID/secret 与允许的回调地址；管理员和用户回调分别为 /api/v1/admin/auth/oidc/callback 与 /api/v1/auth/oidc/callback。管理员身份不使用自动 JIT 创建；启用前分别验证正常登录、无权限账号和回调失败。密钥只保存于私有配置，不能给前端完整返回。

## 日志与健康

Web 日志输出 stdout，CLI 业务 JSON 使用 stdout、诊断使用 stderr。不要把请求体、密码、完整 DSN、令牌或云凭据写日志。/api/v1/health/live 仅证明进程响应；/api/v1/health/ready 需完成安装且数据库 Ping 成功，否则 503。

显式设置 APP_MONITOR_LISTEN=127.0.0.1:9090 可提供 /metrics。只让受控本机采集访问；不要将监控端口默认暴露公网。默认没有外部监控平台依赖。

Windows GUI 无控制台，启动错误会显示原生错误弹窗。排查时使用独立临时 APP_DATA_DIR，不删除真实 AppData。退出前等待任务完成，避免在更新中强杀进程。

返回 [使用指南](index.md)；部署和恢复见 [部署](deployment.md)、[备份](backup.md)。
