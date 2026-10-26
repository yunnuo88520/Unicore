<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0005：统一设计源、原生品牌与六位邮件码

状态：接受 · 日期：2026-10-26 · 作者：yunnuo / ymz@ebox.vip

M2c 补齐跨形态品牌和邮件体验。Web/桌面共用设计源；SMTP、挑战与账号模块仍只进入 web-platform，CLI 维持独立 Core。

`assets/theme/tokens.json` 是主题代码入口，包含品牌名称/主色、两种模式的语义色、字体、字号比例、圆角比例、间距单位、图标线宽、动效和布局。主色自动派生浅深主题、交互状态和品牌配色，前景色按亮度选择。组件只引用 CSS 变量；`check:design` 阻止组件重新写入十六进制/RGB 色。设计源生成 CSS 与 Go 可嵌入的 resolved JSON；邮件、图形验证码、原生窗口背景也使用同一份配色。未来运行时自定义主题可基于同一语义接口扩展，目前只承诺代码配置后重建。

`assets/brand/identity.json` 单独维护 U/core 几何。Resvg 在构建时离线生成 SVG、PNG、ICO；同步 Web/Desktop favicon、touch icon、manifest、Wails appicon、Windows ICO 和 macOS plist。Makefile 在 Wails 运行前生成资源，避免首次构建落入默认图标。原生 macOS About/Linux window icon 显式嵌入品牌 PNG；macOS bundle identifier 保留原值，保护已有偏好存储。操作系统的静态图标随构建主题变化，运行时 light/dark 只切换界面。Windows/Linux 的原生显示仍需各自系统验收。

注册、邮箱验证码登录和找回密码使用 6 位数字，支持前导零。crypto/rand 均匀抽样；高熵 challenge ID 与用途绑定，实例密钥派生 HMAC-SHA256 保存摘要，防止只拿到数据库就枚举短码。10 分钟有效、每用途 60 秒重发间隔、每 challenge 最多 5 次错误；错误次数必须提交事务。IP/邮箱仍有额外限流。未知/不适用账号返回同形随机挑战，不暴露账号是否存在；重启后持久冷却期内不重复发信，客户端须等待后重新申请。

平台新增 0004 email_challenges，保留旧迁移 checksum。消费验证码与启用账号/改密/签发会话同事务，支持并发且最多一次成功。新码撤销同用途旧码和待投递邮件；重置密码与用户权限/状态变化撤销全部待用码，改密同时撤销旧 session。旧 M2b 长链接 API 标记 deprecated，保留已签发链接/旧客户端兼容，新表单只申请数字验证码。

邮件采用响应式 table、内联 CSS、深色媒体查询、UTF-8 编码头、quoted-printable 文本/HTML alternative 与 related CID PNG。模板经过 html/template 转义。后台预览复用生产模板，受 settings:read 保护，iframe sandbox 禁止脚本，示例码固定且不包含真实账号。SMTP 凭据仍加密/掩码；任务成功、终止、取消会清除载荷。SMTP 接受与收件端收到分开记录。

迁移属于只新增表的向前兼容扩展，平台升级先停 worker，保存 DB、配置和原密钥的一致备份。MySQL DDL 可重试；SQLite/PostgreSQL 事务迁移。回退需关闭三项邮件策略并停止新 worker；旧 binary 无法消费新挑战，应成套恢复，不承诺只换 binary 即可回滚。单机/桌面继续仅 framework migration 1。
