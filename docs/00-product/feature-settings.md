<!-- Author: yunnuo <ymz@ebox.vip> -->
# 系统设置与可裁剪扩展

设置采用单层 Tabs，每次仅显示当前标签的分组卡片；不把标签当成长页锚点，也不嵌套子标签。平台的基础信息、品牌图片、外观设置、安全与控制、邮件服务、账号流程、发送测试、投递记录、邮件模板、企业登录、连接检查和授权与升级均为同级入口，按 profile/编译能力显示。品牌保留浅色 Logo / 深色 Logo / 站点图标三张卡片；邮件模板类型使用下拉选择。表单草稿和图片预览在标签间保留，未保存设置标签显示圆点，每次只保存当前分组；主标签写入 URL 并在刷新后恢复。桌面采用多列紧凑表单，手机标签自动换行；邮件预览和投递表格限制内部高度，减少页面滚动。

外观设置复用原工作空间的浅色/深色/跟随系统预览卡片，侧栏不再保留重复入口。在线平台的保存与顶部快速切换均只写当前客户端 localStorage，不同步服务器或其他用户。普通用户的设置入口仅显示这一张外观卡片；管理员的实例设置中保留外观标签。单机/桌面保留本地实例默认主题。旧 #settings 地址兼容到同一外观入口。

设置统一通过 SettingDefinition 校验、持久化与审计。平台所有全局设置的读取/修改及品牌、邮件预览、投递记录均仅管理员可访问：读取需 settings:read + 固定管理员，写入需 settings:write + 固定管理员及 CSRF/Origin。平台不注册 appearance 分组，API 拒绝保存全局主题。单机/桌面只提供适用项，CLI 不装配设置。

| 分组 | 当前行为 | 适用 profile |
| --- | --- | --- |
| 基础信息/实例品牌 | 浅深 Logo、favicon 上传/预览/恢复；站点名、描述、版权、ICP备案号与 HTTPS 查询链接 | Web 两模式、desktop |
| 外观 | 平台只存当前客户端；单机/桌面保留本地默认主题 | Web 两模式、desktop |
| 安全与后台 | 登录/注册图形验证码分别默认开启，会话时长；默认 /admin，可修改且排除保留路径，APP_ADMIN_PATH 恢复 | web-platform |
| 邮件服务 | 主机/端口/TLS/账号/加密密钥、发件邮箱、独立发件人别名、真实测试、队列状态、五套同源模板预览 | web-platform |
| 账号/企业登录 | 注册/六位码登录/找回密码分别开启；SMTP 测试门槛；OIDC 与 JIT 策略 | web-platform |
| 授权与升级 | 独立编译开关、当前版本、待对接状态、禁用的检查按钮/空更新日志 | Web 两模式、desktop；默认编译关闭 |

站点名/版权/备案信息用于工作台和公开登录/注册/找回页面；备案号留空隐藏，查询链接留空显示纯文本，非空只接受无凭据的 HTTPS。读取旧数据时 UI 再次限制可点击链接。新增设置由默认值补齐，复用 system_settings，无 schema 迁移。

favicon 兼容 PNG/JPEG 与 ICO，Logo 仍只接受 PNG/JPEG。ICO 支持 PNG frame 和未压缩 BITMAPINFOHEADER DIB（1/4/8/24/32 位），最多 64 帧，选择最大可用尺寸 16–256 像素，校验偏移/体积/调色板/透明掩码后转成 PNG；不原样提供 ICO 内容。全部原图不超过 256 KiB。其余持久化/清理边界见 [实例品牌](feature-branding.md)。

mail.from_name 留空时使用邮件内的站点名称；非空作为测试/账号/系统通知的 MIME 显示名，信封发件邮箱仍由 mail.from 决定。别名不影响连接与凭据，修改别名不撤销已有 SMTP 连通性测试；主机/端口/TLS/邮箱/账号/密钥变更沿用指纹失效规则。密钥加密且 API 不回传。注册/六位码登录/重置使用十分钟六位码，不以验证码充当系统通知。

系统通知使用第五套主题/Logo/版权模板、HTML 转义和纯文本。平台业务可在提交事件后调用 `manager.Mail().Notify(ctx, mailer.Notification{To: recipient, Title: title, Detail: detail}, actor)`；SMTP 未就绪拒绝入队，载荷加密，24 小时过期，沿用五次重试和元信息审计。没有公开任意发信 API。框架不默认订阅用户或对所有设置变更群发；具体事件、接收人及事务 outbox 由业务明确，跨业务提交与入队仍需调用方处理一致性。

## 授权与升级的占位边界

`FEATURE_LICENSE`、`FEATURE_UPDATER` 仅接受 true/false，默认均为 false。Make 将两项分别映射为 Go 的 license/updater build tag，Vite 在构建时替换常量并输出 features.json。独立授权服务器适配 port 是 LicenseProvider，版本查询 port 是 ReleaseProvider；关闭时对应 port 文件不参与编译，相关 UI 被裁掉，不创建客户端或发出外部请求。CLI 始终不声明这些能力。

开启后，bootstrap.capabilities 只表示占位模块已编入；不代表授权有效或 OTA 可执行。卡片明确“待对接”，检测/检查版本按钮禁用，更新日志为空。当前不注册授权/升级 API，不创建 license_state/upgrade_history 表，不接受许可证密钥、不联系服务器、不安装更新。后续接入真实服务、返回真实 Update Log 及签名/部署方式校验后才能启用操作，见 [ADR-0010](../adr/ADR-0010-settings-edition.md)。

构建与接入入口见 [部署手册](../03-runbooks/deployment.md)，验收和未测范围见 [设置验收](../04-ai/acceptance-settings.md)。
