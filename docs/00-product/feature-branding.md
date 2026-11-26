<!-- Author: yunnuo <ymz@ebox.vip> -->
# 实例品牌

运行时实例品牌包含浅色 Logo、深色 Logo、站点图标与展示方式。`icon-title`（默认）显示自适应 Logo 和站点名，展开导航优先使用当前主题 Logo，未配置时使用 favicon；`wordmark` 让完整字标独占品牌区域，不重复站点名，未上传任何 Logo（浅色或深色）时该选项禁用并注明前置条件。紧凑导航使用 favicon，没有时使用编译品牌图标，不将横版 Logo 缩成难以辨认的小图，也不用站点名首字块冒充应用图标。深色 Logo 为空时使用浅色 Logo，深色槽位的原图预览在未设置时明确标注沿用浅色而不是显示编译图标；自定义品牌图加载失败时，`icon-title` 回退到站点名首字，`wordmark` 回退到站点名文本。展开品牌区仅在未配置自定义品牌时使用编译品牌图标；紧凑导航在未上传站点图标时始终使用编译品牌图标。每项支持选择后预览、明确保存、取消预览和确认恢复默认；有 pending/错误/成功反馈。

完整字标模式适合自带文字的横版 Logo；导航中的高度上限不会随上传图片增加。竖版或复杂 Logo 建议采用默认图标与站点名组合，并配置独立站点图标，避免整图缩小后文字不可读。允许上传不代表所有比例都适合横向字标版位；品牌面板用真实组件预览实际效果。

工作台展开导航在图标或显示名称时使用横向、垂直居中的品牌行：Logo 容器高度 32px、宽度自适应且不可收缩，`.logo-mode-icon` 限宽 32px，侧栏 `.logo-mode-text` 限宽 100px（登录页与首页的完整字标容器仍按 120px 上限）；图片保留自然比例、完整显示、不裁切。正方形 Logo 保持 32×32px，横版 Logo 自动向横向扩展，无需重新上传或保存展示方式。名称/版本区域使用 `flex: 1; min-width: 0`，标题单行省略，版本与名称左对齐。右侧收起按钮固定 32×32px 且不可收缩。完整字标模式（`.logo-mode-text` 且无 `.show-title`）隐藏重复站点名，品牌区保持单行：`brand-info` 以 `flex: 0 1 auto` 让版本号紧贴 Logo 同行垂直居中，收起按钮继续参与横向 Flex 布局，不存在绝对定位覆盖品牌。折叠态只居中显示 32×32px 的站点图标，未上传站点图标时使用编译品牌图标，不用站点名首字冒充应用图标；折叠态隐藏文字和头部按钮，展开操作移到顶栏，支持键盘操作。移动抽屉保持展开布局。品牌面板、公开登录页和首页复用同一自适应 Logo 组件。

| Profile | 行为 | 服务端边界 |
| --- | --- | --- |
| web-platform | 管理页预览/替换/恢复；登录页公开展示 | GET settings:read；PUT settings:write + super_admin + CSRF/Origin |
| web-standalone | 使用构建品牌，不提供运行时修改 | 品牌写接口 404 |
| desktop | 使用构建品牌，不提供运行时修改 | 不暴露品牌桥接方法 |
| cli | 不提供实例品牌 | 不引入 SQL/Wails/HTTP |

图片契约以 OpenAPI 的 Branding/BrandingInput/BrandingResponse 与两个品牌管理 JSON operation 为准。展示方式通过登记的 `branding.display_mode` 设置保存，只接受 `icon-title` 与 `wordmark`，默认 `icon-title`。图片 content 是原始 base64，空字符串仅恢复指定 slot；不接受客户端文件名或路径。Logo 原始文件最多 500 KB，仅 PNG/JPEG，不按固定边长或比例限制；服务端在解码前按像素位深和扫描行保守估算 128 MiB 内存预算，并串行执行解码和规范化，避免并发上传放大内存分配。小文件的高分辨率 Logo 在预算内可以上传；超预算与文件超过 500 KB、图片损坏分别给出不同错误。PNG 会移除完全透明的外围留白（不裁切不透明底色或可见像素），规范化输出采用高质量等比例缩放至最长边 1024 像素，编码结果不超过 512 KB。favicon 另支持 ICO 的 PNG/未压缩 DIB frame（16–256 像素，见 [设置规范](feature-settings.md)），继续居中在透明正方形画布。SVG/GIF/WebP 不在当前上传范围；编译品牌仍可生成 SVG/多尺寸 ICO。

引用保存于 branding.logo/logo_dark/favicon；这三项登记于设置注册表，但普通 PATCH settings 不可写，必须经过图片服务。规范化图片的 SHA-256 PNG 名作为稳定品牌引用；平台经 files.BrandStore 和 blob.Store 保存到当前存储位置，数据库维护 file_id、location_id 与实际对象键，不把大段 base64 放进 SQL，也不在品牌业务拼本地路径。旧 brand-assets/ 文件通过 legacy-brand 位置惰性登记，保留兼容。平台 bootstrap 返回受限相对 URL，本地形态不读取这些引用；公开图片 GET 仅接受当前引用的哈希 PNG，固定 image/png + nosniff，无目录列表。浏览器 favicon/touch links 和动态 manifest 使用实例图标；恢复默认后还原编译资源。

服务端先通过存储接口保存内容与元数据，再事务保存设置引用和现有 settings.updated 审计；数据库保存失败保留有效引用，清理只依据已确认的持久引用。品牌服务串行更新/读取，跨 slot 共用内容保留；未引用图片经文件服务登记延迟清理，不扫描整桶。元数据、私有目录、实例密钥与云对象需要成套备份；细节见 [存储手册](../03-runbooks/storage.md) 和 [备份手册](../03-runbooks/backup.md)。品牌图片为管理员显式公开的例外，普通文件仍通过权限检查和临时签名访问。

邮件在创建时将浅色 Logo 按原比例缩放至最多 320×84 像素，PNG 字节不超过 16 KB，邮件按 2x 像素密度显示且最大为 160×42 CSS 像素；方形 mark 仍保持方形，横版字标不再塞入正方形。图片复制到加密队列载荷，SMTP 用 CID 内嵌，预览用相同邮件副本的 data URI。邮件头为站点名称保留独立空间。换图/恢复不会改变已有队列邮件；旧队列没有图片字段时兼容使用编译 Logo。邮件主题配色仍来自全局 tokens，不从上传像素推导。旧长链接兼容 API 保持原有纯文本邮件。

实例品牌不会改变已安装应用包的图标、bundle ID、可执行文件名或编译主题色。修改这些入口继续使用 assets/brand/identity.json、assets/theme/tokens.json 与重新构建；用户上传文件不会进入源码生成链。

品牌适用范围以 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 为准；平台使用统一文件存储，单机/桌面只在构建时配置品牌，不提供运行时品牌管理。

单机范围已按 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 收敛；历史本地品牌文件/行保留但不使用，原 M3b 原生品牌验收属于历史能力。

开发入口与生产入口均通过同源 `/brand-assets/` 读取已保存的图片；Vite 需同时代理 `/api`、`/brand-assets` 和 `/site.webmanifest`。展开导航优先显示当前主题 Logo，站点图标用于浏览器、折叠导航及无 Logo 时的回退。保存验收包含原图解码、当前侧栏替换、横版 Logo 实际宽度、刷新及重新登录，不以成功提示代替实际图像；同时验证两种展示方式、折叠图标与未配置图标时的名称首字回退。
