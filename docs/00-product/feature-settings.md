<!-- Author: yunnuo <ymz@ebox.vip> -->
# 系统设置与可裁剪扩展

系统管理分为基础设置、邮件设置、邮件模板、系统日志、系统更新与可选授权。基础设置使用单层 Tabs（基础信息、品牌图片、外观、安全与控制、注册设置、维护模式、企业登录）；保留品牌三卡片、外观预览卡片及切换草稿。平台外观仅当前客户端 localStorage；普通用户只可访问这一项。单机/桌面保留本地默认外观。

邮件设置将 SMTP 配置、账号邮件策略和真实发送测试合并到一页，无子标签；测试收件地址在弹窗填写。投递记录在系统日志的邮件投递页，与操作日志并列；邮件模板为独立页面，使用单层场景 Tabs 配置主题/受限 HTML 正文，支持变量、预览、指定收件人测试与恢复默认，保留品牌框架。具体边界见 [管理工具手册](../03-runbooks/admin-tools.md) 与 [ADR-0020](../adr/ADR-0020-audit-mail-templates.md)。全局设置/品牌/SMTP 仅管理员读写，投递和审计需要 logs:read；写请求校验 CSRF/Origin，敏感值不回传。设置源仍为 SettingDefinition。

| 分组 | 当前行为 | 适用 profile |
| --- | --- | --- |
| 基础信息/实例品牌 | 浅深 Logo、favicon 上传/预览/恢复；站点名、邮件链接站点地址、管理员通知邮箱、描述、版权、ICP/公安备案号、HTTPS 查询链接与受限页脚 HTML | web-platform 管理端 |
| 外观 | 平台只存当前客户端；单机/桌面保留本地默认主题 | Web 两模式、desktop |
| 安全与后台 | 登录/注册图形验证码分别默认开启，会话时长；默认 /admin，可修改且排除保留路径，APP_ADMIN_PATH 恢复 | web-platform |
| 邮件服务 | 主机/端口/TLS/账号/加密密钥、发件邮箱、独立发件人别名、真实测试；五套模板独立管理，队列记录在系统日志 | web-platform |
| 账号/企业登录 | 注册/六位码登录/找回密码分别开启；SMTP 测试门槛；OIDC 与 JIT 策略 | web-platform |
| 系统更新 / 授权 | 更新默认开启，离线日志/可信检查/确认安装；授权默认关闭并保持占位 | 平台仅管理员，单机/桌面仅更新 |

站点名/版权/备案信息用于工作台和公开登录/注册/找回页面；备案号留空隐藏，查询链接留空显示纯文本，非空只接受无凭据的 HTTPS。读取旧数据时 UI 再次限制可点击链接。新增设置由默认值补齐，复用 system_settings，无 schema 迁移。

favicon 兼容 PNG/JPEG 与 ICO，Logo 仍只接受 PNG/JPEG。ICO 支持 PNG frame 和未压缩 BITMAPINFOHEADER DIB（1/4/8/24/32 位），最多 64 帧，选择最大可用尺寸 16–256 像素，校验偏移/体积/调色板/透明掩码后转成 PNG；不原样提供 ICO 内容。全部原图不超过 256 KiB。其余持久化/清理边界见 [实例品牌](feature-branding.md)。

mail.from_name 留空时使用邮件内的站点名称；非空作为测试/账号/系统通知的 MIME 显示名，信封发件邮箱仍由 mail.from 决定。别名不影响连接与凭据，修改别名不撤销已有 SMTP 连通性测试；主机/端口/TLS/邮箱/账号/密钥变更沿用指纹失效规则。密钥加密且 API 不回传。注册/六位码登录/重置使用十分钟六位码，不以验证码充当系统通知。

系统通知使用第五套主题/Logo/版权模板、HTML 转义和纯文本。平台业务可在提交事件后调用 `manager.Mail().Notify(ctx, mailer.Notification{To: recipient, Title: title, Detail: detail}, actor)`；SMTP 未就绪拒绝入队，载荷加密，24 小时过期，沿用五次重试和元信息审计。没有公开任意发信 API。框架不默认订阅用户或对所有设置变更群发；具体事件、接收人及事务 outbox 由业务明确，跨业务提交与入队仍需调用方处理一致性。

## 授权与更新的编译边界

FEATURE_LICENSE 默认 false，保留独立授权服务待对接卡片；FEATURE_UPDATER 默认 true，提供真实签名 OTA 与内置历史。均只接受 true/false，Make 映射为 license/updater Go tags，Vite 编译常量裁剪相同功能。禁用更新时不装配渠道/安装器，CLI 始终不装配；capability 由实际组合根服务决定。

平台版本页面与更新 API 仅管理员，本地系统更新由 loopback/原生桥接开放。Docker 只检查、不覆盖自己。签名、备份确认、兼容边界和恢复见 [更新需求](feature-updates.md)、[ADR-0018](../adr/ADR-0018-signed-updates.md)、[运行手册](../03-runbooks/updates.md)。没有新增设置表或数据库迁移；渠道与信任根由受控构建/部署配置管理，不能让远端 feed 修改公钥。

在线平台新增独立“对象存储”设置页，按本地/MinIO/S3/OSS/COS 单层 Tabs 配置；仅管理员可见，默认本地，测试后显式切换，文件策略登记 storage.*。详见 [文件存储](feature-storage.md) 与 [运行手册](../03-runbooks/storage.md)。

当前单机/桌面只提供本地外观，拒绝站点/品牌/邮件等设置，详见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。布尔设置用 Switch；开放注册与注册验证码置于独立注册设置标签，默认关闭且保留 SMTP 就绪门槛。

本地外观新增共享右侧抽屉与中英文入口；既有外观页的更多设置复用该抽屉。即时偏好只写当前客户端，不进入 SettingDefinition 或实例 PATCH；具体选项和兼容见 [客户端偏好](../03-runbooks/client-preferences.md)。

## 站点地址、页脚与维护

基础信息中的 site.base_url 仅决定新邮件链接（包括模板预览和旧版账号链接），留空沿用安装地址；不改变监听地址、Cookie 安全策略或 OIDC 固定回调。新安装默认保存安装地址和管理员邮箱，旧实例留空回退。site.admin_email 不公开到 bootstrap；内部 Notify 的 To 留空时发送到此邮箱，具体告警事件由业务接入，不自动订阅所有设置变更。

site.police_number 在公开账号页和工作台页脚显示；site.footer_html 支持受限段落、列表、强调和 HTTP/HTTPS 链接，服务端拒绝脚本/事件属性/样式/嵌入，浏览器再次净化。用户内容原样展示，不自动翻译。所有字段复用 system_settings，无 schema 迁移。

维护模式默认关闭，提示可填写多行文字。开启后，用户页面展示维护提示，用户业务/认证/文件 API 返回 503 MAINTENANCE_MODE；bootstrap 与健康检查保留。用户页面每 30 秒复核维护状态，管理员入口和独立管理 API 保持原鉴权以便恢复。已经签发的云下载仍遵循有效期，已发起的请求不回滚；本地签名下载在维护期间暂停。关闭后用户可重新检查或等待自动复核恢复。仅 web-platform 提供这些设置。
