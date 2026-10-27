<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0016：管理端与用户端独立入口

状态：采用。取代 ADR-0014 的请求头选域、同一 SPA，以及 ADR-0009 的单机/桌面运行时品牌范围。

web-platform 的普通用户是产品使用者，管理员是独立身份域。共享视觉不代表共享管理入口。Web 使用 index.html/main.tsx（用户）和 admin.html/admin.tsx（管理员）两个构建入口。管理员页面在 admin-app.tsx 装配，用户入口不导入这些页面；两端复用 Workspace、主题、表单、Modal、消息、文件和业务组件。默认用户端提供概览、Core、我的文件、本地外观、本人账号及明确的业务占位。

用户 /、/login、/register 只调用 /api/v1/bootstrap、auth/*、account/*、files/*、core/execute。管理员可配置页面路径（默认 /admin），使用 /api/v1/admin/bootstrap、auth/*、account/*、files/*、core/execute。设置、用户、管理员、存储等管理资源继续在 /api/v1/admin/*。身份由固定路径选择，X-Unicore-Identity 不再参与认证。独立表和 Cookie 保留，无身份回退。管理员认证前的 bootstrap/策略/验证码/登录可公开读取最小投影；本人账号操作必须有对应管理员会话，管理业务操作继续声明固定管理员权限和 CSRF。普通用户 Cookie 访问管理端拒绝，管理员 Cookie 也不能访问用户账号接口。

管理员创建的普通用户立即 active，可在用户登录页使用初始密码登录，无需邮件激活；两域即使账号名相同，密码也不能互通。注册默认关闭，开关在安全与控制；开启前必须真实测试 SMTP。注册仍六位邮箱码验证后 active，不开放管理员自注册。所有布尔设置统一 Switch。登录、注册、找回共用左右布局及移动端单列，用户页不显示管理入口。

管理员 OIDC redirect URI 更新为 /api/v1/admin/auth/oidc/callback；普通 callback 保持 /api/v1/auth/oidc/callback。部署升级时必须先更新 IdP 白名单及外部 API 客户端；旧请求头不再选域，旧管理员 callback 返回 JSON 404。现存管理员/用户会话沿用独立 Cookie；会话表、文件身份域不变。

web-standalone、desktop 只装配本地业务和外观，不提供管理导航、站点名/Logo 修改、邮件、对象存储、用户或授权升级页面。本地 settings 仅接受 appearance 分组；UI 外观只存当前客户端。构建品牌来自 assets/brand/identity.json、assets/theme/tokens.json；旧 site/branding 行及文件保留但不读取，不做删除迁移。Wails 移除运行时品牌方法，仍是原生桥接，无 HTTP 模拟。CLI 无变化。

上传复用统一弹窗，隐藏浏览器原生控件，提供拖拽/浏览、类型图标、名称/大小、替换/移除和取消。SDK 报告实际 uploading/confirming 阶段，不虚构进度百分比。用户只见本人文件信息，不展示底层位置、对象键或内部 ID。文件访问、直传和清理边界沿用 ADR-0015。

无数据库 schema 变更，平台迁移 level 9 不变。升级部署需整体替换前后端，不能混用旧 SDK。恢复时停服恢复匹配程序、DB、私有目录和密钥；不会自动回滚数据或清理历史品牌。
