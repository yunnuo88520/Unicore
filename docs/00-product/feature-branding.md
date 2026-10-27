<!-- Author: yunnuo <ymz@ebox.vip> -->
# M3b 实例品牌

运行时实例品牌包含浅色 Logo、深色 Logo、站点图标。网站工作台、登录/账号页与新建六位码邮件共用；站点名、版权继续沿用 SettingDefinition。深色 Logo 为空时使用浅色 Logo，图片缺失或浏览器加载失败回退编译品牌。每项支持选择后预览、明确保存、取消预览和确认恢复默认；有 pending/错误/成功反馈。

| Profile | 行为 | 服务端边界 |
| --- | --- | --- |
| web-platform | 管理页预览/替换/恢复；登录页公开展示 | GET settings:read；PUT settings:write + super_admin + CSRF/Origin |
| web-standalone | 使用构建品牌，不提供运行时修改 | 品牌写接口 404 |
| desktop | 使用构建品牌，不提供运行时修改 | 不暴露品牌桥接方法 |
| cli | 不提供实例品牌 | 不引入 SQL/Wails/HTTP |

唯一契约是 OpenAPI 的 Branding/BrandingInput/BrandingResponse 与两个管理 JSON operation。content 是原始 base64，空字符串仅恢复指定 slot；不接受客户端文件名或路径。图片原始大小不超过 256 KiB，Logo 仅 PNG/JPEG，宽高 16–2048；favicon 另支持 ICO 的 PNG/未压缩 DIB frame（16–256 像素，见 [设置规范](feature-settings.md)）；先检查尺寸，再解码像素、等比例缩小至最多 256 像素，居中在透明正方形画布，重新编码为 PNG。SVG/GIF/WebP 不在当前上传范围；编译品牌仍可生成 SVG/多尺寸 ICO。

引用保存于 branding.logo/logo_dark/favicon；这三项登记于设置注册表，但普通 PATCH settings 不可写，必须经过图片服务。图片按 SHA-256 存放在实例数据目录 brand-assets/，不把大段 base64 放进 SQL。平台 bootstrap 返回受限相对 URL，本地形态不读取这些引用；公开图片 GET 仅接受当前引用的哈希 PNG，固定 image/png + nosniff，无目录列表。浏览器 favicon/touch links 和动态 manifest 使用实例图标；恢复默认后还原编译资源。

服务端先原子保存 0600 文件，再事务保存引用和现有 settings.updated 审计；数据库保存失败保留有效引用，清理只依据已确认的持久引用。服务串行更新/读取，文件删除只处理自己生成的哈希文件，跨 slot 共用内容保留；成功替换/恢复清理未引用图片。进程在写文件后崩溃可能留下孤立文件，下次成功保存时清理。数据目录保持私有，文件和 DB 必须成套备份。

邮件在创建时将浅色 Logo 缩为最多 64 像素 PNG，复制到加密队列载荷，SMTP 用 CID 内嵌，预览用相同邮件副本的 data URI。换图/恢复不会改变已有队列邮件；旧队列没有图片字段时兼容使用编译 Logo。邮件主题配色仍来自全局 tokens，不从上传像素推导。旧长链接兼容 API 保持原有纯文本邮件。

实例品牌不会改变已安装应用包的图标、bundle ID、可执行文件名或编译主题色。修改这些入口继续使用 assets/brand/identity.json、assets/theme/tokens.json 与重新构建；用户上传文件不会进入源码生成链。

验收包含格式伪装、尺寸/体积/非法路径、失败保存、共用文件及并发、三 profile、权限/CSRF、不适用接口 JSON 404、重启、PC/375px 三态主题、登录页/邮件/站点图标、只读账号、恢复默认与真实 Wails。证据和未测范围见 [M3b 验收](../04-ai/acceptance-m3b.md)。

单机范围已按 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 收敛；历史本地品牌文件/行保留但不使用，原 M3b 原生品牌验收属于历史能力。
