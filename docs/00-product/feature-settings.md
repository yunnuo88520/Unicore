<!-- Author: yunnuo <ymz@ebox.vip> -->
# 系统设置与可裁剪扩展

系统管理分为基础设置、邮件设置、系统日志、系统更新与可选授权。基础设置使用单层 Tabs（基础信息、品牌图片、外观、安全与控制、企业登录）；保留品牌三卡片、外观预览卡片及切换草稿。平台外观仅当前客户端 localStorage；普通用户只可访问这一项。单机/桌面保留本地默认外观。

邮件设置将 SMTP 配置、账号邮件策略和真实发送测试合并到一页，无子标签；测试收件地址在弹窗填写。投递记录在系统日志的邮件投递页，与操作日志并列；不在设置展示邮件模板。模板由框架内部统一生成，业务可通过内部预览 API 验证。全局设置/品牌/SMTP 仅管理员读写，投递和审计需要 logs:read；写请求校验 CSRF/Origin，敏感值不回传。设置源仍为 SettingDefinition。

| 分组 | 当前行为 | 适用 profile |
| --- | --- | --- |
| 基础信息/实例品牌 | 浅深 Logo、favicon 上传/预览/恢复；站点名、描述、版权、ICP备案号与 HTTPS 查询链接 | web-platform 管理端 |
| 外观 | 平台只存当前客户端；单机/桌面保留本地默认主题 | Web 两模式、desktop |
| 安全与后台 | 登录/注册图形验证码分别默认开启，会话时长；默认 /admin，可修改且排除保留路径，APP_ADMIN_PATH 恢复 | web-platform |
| 邮件服务 | 主机/端口/TLS/账号/加密密钥、发件邮箱、独立发件人别名、真实测试；五套模板内部生成，队列记录在系统日志 | web-platform |
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

当前单机/桌面只提供本地外观，拒绝站点/品牌/邮件等设置，详见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。布尔设置用 Switch；开放注册移至安全与控制，默认关闭且保留 SMTP 就绪门槛。

本地外观新增共享右侧抽屉与中英文入口；既有外观页的更多设置复用该抽屉。即时偏好只写当前客户端，不进入 SettingDefinition 或实例 PATCH；具体选项和兼容见 [客户端偏好](../03-runbooks/client-preferences.md)。
