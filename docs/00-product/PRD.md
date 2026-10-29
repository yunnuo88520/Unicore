<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品基线与当前范围

Unicore · yunnuo / ymz@ebox.vip。完整目标见 [design-v1.1.md](design-v1.1.md)。当前基线包含多形态业务基座、平台双入口/固定身份、统一私有文件存储和可派生开发工具，仍为开发预览，不等同完整 v1。当前规则以本表及 ADR-0012～0018 为准，旧里程碑在下方保留为历史。

基础能力本轮收尾：统一会话/缓存边界、路由/表单、契约文档/校验、运行配置/观测与 AI 开发入口，当前范围见 [基础能力审计](../04-ai/foundation-audit.md) 和 [验收](../04-ai/acceptance-ai-foundations.md)。

| 能力 | web-platform | web-standalone | desktop | cli |
| --- | --- | --- | --- | --- |
| 共享文本分析 Core | 已实现 | 已实现 | 已实现 | 已实现 |
| 持久化个人笔记样板 | 已实现，普通用户/管理员身份域隔离 | 已实现，local scope | 已实现，原生桥接 | 不装配 |
| React / 三态主题 | 已实现 | 已实现 | 已实现 | 不适用 |
| 一次性安装 | 已实现 | 已实现，无管理员 | 自动初始化，无安装页 | 不装配 |
| 数据库 | MySQL/PostgreSQL 推荐；小型 SQLite 可选 | MySQL/PostgreSQL 推荐；SQLite 可选 | SQLite | 禁止强依赖 |
| 登录/RBAC/用户管理/固定两角色 | 已实现，管理员/普通用户 | 不装配 | 不装配 | 不装配 |
| 持久化设置 | 全局仅管理端；外观仅本客户端 | 仅外观 | 仅外观 | 不装配 |
| SMTP / 六位验证码注册、登录、找回密码 | 已实现，需测试 SMTP 后显式启用 | 不装配 | 不装配 | 不装配 |
| 统一设计源 / Logo、ICO、原生图标 | 已实现 | 已实现 | 已实现，macOS 实测 | 不适用 |
| AI 文档/Skills/契约生成与检查 | 已实现 | 已实现 | 已实现 | 已实现 |
| OIDC 企业登录 / 账号绑定 | 已实现，默认关闭 | 不装配 | 不装配 | 不装配 |
| 实例品牌上传/恢复默认 | 已实现，仅管理端 | 构建品牌 | 构建品牌 | 不适用 |
| 文件/对象存储、直传与临时访问 | 已实现，本地默认；MinIO 真实云验收 | 不装配 | 不装配 | 不装配 |
| 备案页脚 / SMTP 别名 / 系统通知 port | 已实现 | 不提供全局配置 | 不提供全局配置 | 不适用 |
| 授权占位及编译裁剪 | 默认关闭，管理员 | 不装配 | 不装配 | 不装配 |
| 离线加密备份恢复 | 已实现，独立 ops | 已实现，独立 ops | 已实现，独立 ops | 不装配 |
| 签名 OTA / 离线版本日志 | 管理员；Tar 更新，Docker 仅检查 | loopback；Tar 更新 | 原生更新 | 不装配 |
| 系统签名 / 公证 | 发行流程已接入，等待开发者凭据 | 同左 | 同左 | 不适用 |

MIT、创建器、doctor、文档/Skills 和候选发版随源码分发；GitHub 设置与首次公开发行另见 [开源维护](../03-runbooks/open-source.md)。最近三数据库、页面、部署及原生验证见 [开发基座验收](../04-ai/acceptance-developer-kit.md)。

## 历史里程碑与后续修订

以下按实现阶段记录；后续双入口、物理拆表、本地形态裁剪与开发基座决策取代早期描述，不将早期权限或设置范围作为当前产品规则。

M2a：首次选择 Web 两模式，安装后固定；私有安装凭据、文件锁、DB 唯一安装标记与事务 seed，失败可恢复。平台默认开启图形验证码，不开放注册；内置 super_admin/user，服务端逐 API 权限与 CSRF，保护最后超管；用户搜索/分页/创建/启停/角色关联。持久设置通过 SettingDefinition 注册表管理，覆盖站点基础、主题、安全和后台路径。桌面自动 SQLite，平台身份与外部驱动不进入桌面组合。

M1：共享无状态文本分析（Unicode 字符/空白分隔词/行/字节/原始 SHA-256），跨入口相同 DTO 与结果；CLI 依赖图无 SQL/HTTP/Wails。业务文本不持久化，运行记录仅在当前前端会话。

M2b：SMTP 支持强制 STARTTLS/验证证书 TLS，本机可用明文测试；敏感设置加密、读取只返回配置状态。通过当前配置的真实测试邮件后才允许启用注册/恢复。注册默认关闭且仅授予 user，邮箱验证后启用。令牌一次性/分用途/哈希保存，邮件内容加密队列，失败最多 5 次重试。重置事务撤销全部旧 session，并阻止旧密码并发登录重新创建会话。

M3a：OIDC PKCE/state/nonce、显式绑定与最低权限 JIT 已实现，见 [需求](feature-oidc.md) 和 [验收](../04-ai/acceptance-m3a.md)。M3b 实例品牌见 [需求](feature-branding.md) 和 [验收](../04-ai/acceptance-m3b.md)；M4：备份恢复、签名 manifest、条件编译启用、受控 tar updater、Docker 镜像替换演练。v1 多用户不是多租户。

详细命令与实际平台验证记录见 [M2b 验收](../04-ai/acceptance-m2b.md) 与 [M2a 验收](../04-ai/acceptance-m2a.md)。

M2c：主题、字号/字体、圆角、间距、图标线宽、动效集中配置；品牌轮廓统一生成 Web/原生图标。四套中文 HTML/纯文本邮件与后台预览；新表单注册验证、邮箱登录、找回密码均用 6 位数字，10 分钟有效、60 秒重发、5 次错误上限，实例 HMAC 摘要及事务一次性消费。QQ SMTP 四种邮件已实际投递，收件人确认显示正常。旧长链接 API 仅保留兼容。验收见 [M2c](../04-ai/acceptance-m2c.md)。

当前权限：M2d 业务角色由固定管理员/普通用户方案取代。菜单、页面和全部管理 API 仅管理员；普通用户可使用 Core、本人账号和本地外观，不能读取全局设置。角色/状态变化撤销会话与验证码，最后管理员受保护。迁移 0007 规范旧角色并撤销存量凭据；见 [角色需求](feature-roles.md)、[ADR-0012](../adr/ADR-0012-fixed-platform-roles.md) 和 [验收](../04-ai/acceptance-permissions.md)。

设置按业务域 Tabs 展示，保持单层标签，品牌用三张卡片、外观复用主题预览卡片并移除侧栏重复入口，保留草稿并只保存当前分组，减少页面滚动。设置清单补齐：ICP/独立发件人别名、ICO favicon、共用系统通知模板和内部队列；授权仍为编译占位；升级以 ADR-0018 的签名 OTA 与内置日志取代占位。具体范围见 [设置需求](feature-settings.md) 与 [设置验收](../04-ai/acceptance-settings.md)。

交付基座：VERSION 单源生成各端版本、Changelog 准备、按 target/profile 快速归档和镜像/Compose 入口。Nginx 保留安装/后台/品牌路由边界；实际运行范围见 [部署验收](../04-ai/acceptance-deployment.md) 与 [ADR-0011](../adr/ADR-0011-release-deployment.md)。签名 OTA 与可配置系统签名/公证流程见 [更新需求](feature-updates.md)，公开发布仍需授权，实际开发者凭据待提供；离线备份恢复见 ADR-0017。

首次安装改为 MySQL 默认、结构化数据库字段、三方言连接测试、非空库精确确认初始化；自动记录访问 origin，凭据可经当前凭据验证后换新，已安装实例缺失 DB/标记时拒绝启动。需求见 [安装规范](feature-installation.md)，三数据库/PC/375px/重启证据见 [安装验收](../04-ai/acceptance-installation.md)。

管理体验增量：管理员/普通用户物理拆表、独立登录与恢复，禁止角色转换；导航分用户管理/系统管理、固定侧栏与弹窗新增、头像改密退出，移除重复仪表盘。邮件配置/测试合一，投递迁系统日志，模板仅内部生成。当前 [角色规范](feature-roles.md)、[ADR-0014](../adr/ADR-0014-separate-identities-management.md) 与 [管理验收](../04-ai/acceptance-management.md) 优先于上方历史阶段说明。

共享管理 UI：二级导航缩进并使用统一矢量图标，无 Emoji；短暂成功/错误反馈顶部显示，默认 3 秒消失，支持五种语义状态。单机与桌面不显示用户头像或账号菜单。

对象存储与私有文件：在线平台新增本地/MinIO/S3/OSS/COS 位置、直传与签名访问、文件元数据和清理。桌面/单机使用构建品牌；详见 [文件存储需求](feature-storage.md)、[ADR-0015](../adr/ADR-0015-file-storage.md) 与 [存储手册](../03-runbooks/storage.md)。

当前页面/API 分离以 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 为准。管理端独立 HTML 入口与 admin API；用户端只有个人业务、文件、账号和本地外观。单机/桌面不提供任何全局配置页面或运行时品牌修改。

开发基座增量以 [ADR-0017](../adr/ADR-0017-developer-kit-business-backup.md) 为准：MIT、源码创建器/doctor/开发依赖、三种有 DB 形态的笔记纵向样板、独立业务迁移、离线加密备份恢复与手动发布候选。当前状态与实测边界见 [开发基座验收](../04-ai/acceptance-developer-kit.md)。

## 客户端语言与外观

Web 用户/管理员、单机和桌面共用中英文切换、明暗快捷按钮与右侧主题抽屉。配色、圆角、密度、侧栏、布局与内容宽度即时生效，仅保存在当前客户端；重置外观保留语言，不影响业务草稿或全局设置。版本气泡使用统一版本源与状态点，普通在线用户不显示版本或请求更新。详见 [ADR-0019](../adr/ADR-0019-local-preferences-i18n.md)、[扩展指南](../03-runbooks/client-preferences.md) 与 [验收](../04-ai/acceptance-preferences.md)。

布局切换必须保持导航与正文互不遮挡；阅读方向选项已移除，工作区固定 LTR 并忽略旧 RTL 偏好；主题抽屉内部顺序固定。新增界面的中英文是交付条件，由构建检查拒绝中文直写、缺失英文词条及插值不一致。前端基础封装和验收入口见 [使用约定](../03-runbooks/frontend-foundations.md)。
