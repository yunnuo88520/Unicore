<!-- Author: yunnuo <ymz@ebox.vip> -->
# 实例品牌

运行时实例品牌包含浅色 Logo、深色 Logo、站点图标。网站工作台、登录/账号页与新建六位码邮件共用；站点名、版权继续沿用 SettingDefinition。深色 Logo 为空时使用浅色 Logo，图片缺失或浏览器加载失败回退编译品牌。每项支持选择后预览、明确保存、取消预览和确认恢复默认；有 pending/错误/成功反馈。

| Profile | 行为 | 服务端边界 |
| --- | --- | --- |
| web-platform | 管理页预览/替换/恢复；登录页公开展示 | GET settings:read；PUT settings:write + super_admin + CSRF/Origin |
| web-standalone | 使用构建品牌，不提供运行时修改 | 品牌写接口 404 |
| desktop | 使用构建品牌，不提供运行时修改 | 不暴露品牌桥接方法 |
| cli | 不提供实例品牌 | 不引入 SQL/Wails/HTTP |

唯一契约是 OpenAPI 的 Branding/BrandingInput/BrandingResponse 与两个管理 JSON operation。content 是原始 base64，空字符串仅恢复指定 slot；不接受客户端文件名或路径。图片原始大小不超过 256 KiB，Logo 仅 PNG/JPEG，宽高 16–2048；favicon 另支持 ICO 的 PNG/未压缩 DIB frame（16–256 像素，见 [设置规范](feature-settings.md)）；先检查尺寸，再解码像素、等比例缩小至最多 256 像素，居中在透明正方形画布，重新编码为 PNG。SVG/GIF/WebP 不在当前上传范围；编译品牌仍可生成 SVG/多尺寸 ICO。

引用保存于 branding.logo/logo_dark/favicon；这三项登记于设置注册表，但普通 PATCH settings 不可写，必须经过图片服务。规范化图片的 SHA-256 PNG 名作为稳定品牌引用；平台经 files.BrandStore 和 blob.Store 保存到当前存储位置，数据库维护 file_id、location_id 与实际对象键，不把大段 base64 放进 SQL，也不在品牌业务拼本地路径。旧 brand-assets/ 文件通过 legacy-brand 位置惰性登记，保留兼容。平台 bootstrap 返回受限相对 URL，本地形态不读取这些引用；公开图片 GET 仅接受当前引用的哈希 PNG，固定 image/png + nosniff，无目录列表。浏览器 favicon/touch links 和动态 manifest 使用实例图标；恢复默认后还原编译资源。

服务端先通过存储接口保存内容与元数据，再事务保存设置引用和现有 settings.updated 审计；数据库保存失败保留有效引用，清理只依据已确认的持久引用。品牌服务串行更新/读取，跨 slot 共用内容保留；未引用图片经文件服务登记延迟清理，不扫描整桶。元数据、私有目录、实例密钥与云对象需要成套备份；细节见 [存储手册](../03-runbooks/storage.md) 和 [备份手册](../03-runbooks/backup.md)。品牌图片为管理员显式公开的例外，普通文件仍通过权限检查和临时签名访问。

邮件在创建时将浅色 Logo 缩为最多 64 像素 PNG，复制到加密队列载荷，SMTP 用 CID 内嵌，预览用相同邮件副本的 data URI。换图/恢复不会改变已有队列邮件；旧队列没有图片字段时兼容使用编译 Logo。邮件主题配色仍来自全局 tokens，不从上传像素推导。旧长链接兼容 API 保持原有纯文本邮件。

实例品牌不会改变已安装应用包的图标、bundle ID、可执行文件名或编译主题色。修改这些入口继续使用 assets/brand/identity.json、assets/theme/tokens.json 与重新构建；用户上传文件不会进入源码生成链。

早期品牌验证见 [M3b 验收](../04-ai/acceptance-m3b.md)；平台统一存储及单机裁剪后的当前范围见 [文件验收](../04-ai/acceptance-storage.md)、[双入口验收](../04-ai/acceptance-surfaces.md) 和 [开发基座验收](../04-ai/acceptance-developer-kit.md)。早期原生运行时品牌修改不代表当前仍提供该功能。

单机范围已按 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 收敛；历史本地品牌文件/行保留但不使用，原 M3b 原生品牌验收属于历史能力。
