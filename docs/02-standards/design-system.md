<!-- Author: yunnuo <ymz@ebox.vip> -->
# 主题和品牌修改入口

所有形态默认使用 Unicore 品牌。主题代码入口为 `assets/theme/tokens.json`；图形轮廓源为 `assets/brand/identity.json`。站点运行时名称仍由实例设置覆盖，不能用修改产品默认名覆盖已有安装的站点设置。

只换主题色时修改 `brand.accent`，使用六位十六进制颜色；无需逐页修改。浅深模式的 primary/soft/border、按钮 hover/focus、banner、Logo、favicon、邮件配色均自动派生。状态色、文字、表面和边框可在 modes 中独立调整。主题提供三态 light/dark/system，系统模式实时响应设备变化；浏览器 theme-color 同步更新。

字体入口是 typography.sans/mono；typography.scale 全局缩放字号。shape.scale 缩放组件圆角，spacing.scale 缩放间距，icons.strokeWidth 统一 Lucide 线宽，motion 管理速度并尊重 reduced-motion，layout 管理布局宽度。响应式断点和组件结构属于布局实现，新增交互仍需 375px 验证。邮件客户端有独立排版约束，其品牌/语义配色和字体共享源，邮件专用结构保持 table/内联样式。

运行 `pnpm design:generate` 生成全套资源；`pnpm build`、Web/Desktop 的 build/dev、`make build-desktop`/`make dev-desktop` 都自动执行。生成不依赖浏览器或网络，Resvg 随 pnpm 依赖安装。原生包须重建后才会更新 OS 图标。

| 生成产物 | 使用方 |
| --- | --- |
| packages/web-ui/src/tokens.gen.css | 共享 React 页面 |
| assets/theme/resolved.gen.json | Go 邮件/验证码/窗口背景及前端 theme-color |
| assets/brand/mark.svg、wordmark.svg、icon-*.png、favicon.ico | 可维护品牌资产，邮件 CID |
| apps/{web,desktop}/public | favicon、触屏/安装图标、manifest |
| build/desktop/appicon.png、windows/icon.ico、darwin/Info{.dev,}.plist | Wails 原生打包，开发/生产独立身份 |

`pnpm check:design` 检查生成结果和图标同步，并阻止组件写入独立色值。不要手改 *.gen.* 和复制出来的图标。新增组件优先使用 --text/--muted/--surface/--border/--primary/--danger 等语义变量，避免用具体颜色名表示用途。

`pnpm test:theme` 是串行的完整替换验证：暂存原配置，临时替换主色/字号/圆角，构建真实服务，验证按钮、页面标志、SVG/PNG favicon、邮件模板、全工作区页面和 375px，最后恢复原文件并重建。不要与其他构建并行运行。截图与结果位于 build/acceptance/theme-proof。

当前默认色通过相应前景色选择保证按钮对比度；任意自定义配色仍需视觉和可访问性检查，不承诺随机配置都满足 WCAG。macOS 系统关于窗口已实测品牌图；Windows/Linux 原生显示没有以 macOS 构建代替实测。

原生标题栏和系统弹窗继续遵循操作系统外观；Wails v2 的 macOS/Linux 运行时窗口主题方法当前为空实现，不能把正文主题切换宣称为已改变 OS 窗口外观。

原生 bundle ID 入口为 `assets/brand/identity.json` 的 bundleId，当前 vip.ebox.unicore；开发版追加 .dev。共享 plist 模板同步产生两个文件，开发版仅增加本机 Vite 网络权限。Wails preBuildHook 也会预生成品牌输入，防止直接运行 Wails 时回落到默认资源；品牌/产品名变更优先使用 `make build-desktop`，确保 Wails 读取配置前已同步名称。

`pnpm check:native --bundle` 检查原生输入；macOS 额外读取真实 app 的身份及 ICNS，检查 5 个分辨率和解码后的品牌像素。`make build-desktop` 与 native CI 自动执行；开发模式包使用 `pnpm check:native --bundle --dev`。图标验收应同时检查 Finder/系统窗口及真实应用包，不能仅以页面内 Logo 或系统 About 代替全部原生位置。

M3b 运行时图片使用 [实例品牌规范](../00-product/feature-branding.md)：内页/登录页经 BrandProvider/BrandMark 共用，编译矢量是默认回退；不要在页面拼图片路径。BrandingPanel 通过 AppClient 和 Query 刷新 bootstrap/品牌/模板，图片选择先预览再提交。原生包图标仍由编译源生成，上传不影响签名或应用标识。

导航与反馈使用统一 Lucide/SVG 图标，禁止用 Emoji/表情符号替代；`check:design` 扫描共享 UI 源码并校验 message.css 的颜色均来自 tokens。全局消息样式在 `packages/web-ui/src/message.css`，语义颜色、字体、圆角与动效随全局主题；接入与反馈生命周期见 [前端规范](frontend.md)。
