<!-- Author: yunnuo <ymz@ebox.vip> -->
# 中英文与本地外观

所有图形入口右上角共用语言、明暗与主题设置按钮。设置从右侧打开，选择立即应用并保存在当前浏览器或 WebView；不上传至服务器，不影响其他用户。语言菜单可用方向键、Home/End、Enter 和 Escape。抽屉按 Escape 关闭并回到原按钮；手机上占满可用宽度，选项独立滚动，底部重置保持可见。

## 框架扩展入口

- 全局构建主题：`assets/theme/tokens.json`。默认主色改 `brand.accent`；可选配色改 `presets`，运行 `pnpm design:generate`。它继续驱动品牌、邮件与原生资源，客户端配色只作用于当前 UI。
- 本地默认偏好：`packages/web-ui/src/preferences.ts` 的 `defaultPreferences`。新增选项先扩展白名单、类型和默认值，再接入共享控件与主题应用；不要在业务组件直接操作存储或写死颜色。
- 偏好 API：从 `@unicore/web-ui/preferences` 导入 `usePreferences`、`setPreferences`、`resetAppearance`。后者重置外观并保留语言，`resetPreferences` 才恢复全部默认值。
- 中英文：从 `@unicore/web-ui/i18n` 导入 `useI18n` 或 `useLocale`/`t`。例如 `const {t}=useI18n(); t('下载 {{v0}}',{v0:file.original_name})`。新增界面文案同步 `src/locales/en.json`；license/updater 专属词条放对应文件并保持编译裁剪。日期通过 `formatDate` 或 `currentLocale` 格式化。
- 共享交互：`@unicore/web-ui/client-controls` 的 `ClientControls`；`@unicore/web-ui/appearance` 的 `AppearanceDrawer` 和 `AppearanceControls`。自定义入口先装配共享 Workspace/useTheme 与 CSS，不复制抽屉和状态。
- 文档外链：`packages/web-ui/src/shell-tools.tsx` 的 `workspaceLinks`。派生应用替换这一个对象；版本仍来自统一 `VERSION` 与 bootstrap，不另设常量。

只翻译系统界面和已知错误，不把业务内容交给 `t()`；笔记正文、文件名、站点名称、第三方身份提供商名称和更新日志保持原文。切换语言不得给表单加 locale key 或重建业务状态。新页面须检查英文长标签、无横向溢出、浅深色与 375px。

偏好键为 `unicore.preferences.v1`，旧 `unicore.theme` 兼容迁移；存储被禁用时仅当前进程生效。浏览器相同 origin 的标签自动同步；不同 origin、不同浏览器或设备各自独立。退出登录不重置设备外观，不在偏好中保存身份或凭据。服务端安全与更新权限见 [ADR-0019](../adr/ADR-0019-local-preferences-i18n.md)。

运行 `make docs`、`make test`、`make build-web`，再运行 `make test-e2e`；原生共享界面修改还需 `make build-desktop` 和实际窗口验收。新交互专项在 `tests/e2e/preferences.spec.ts`，使用随机临时实例，不接触日常数据。

布局复用 `@unicore/web-ui/layout` 的 `WorkspaceLayout`，只传 navigation/header/children/overlays；不要自行计算侧栏宽度或左右 margin。主题抽屉的 `dir=ltr` 固定内部选项和关闭按钮顺序，工作区固定 LTR，旧 RTL 字段由白名单忽略。静态路由/选项用 `defineMessages({...})` 登记并在渲染时 `t(label)`；`pnpm check:i18n` 递归检查新增目录、设置/权限元数据与契约错误，未翻译的新中文会使 Web/GUI 构建和 CI 失败。详见 [基础封装](frontend-foundations.md)。
