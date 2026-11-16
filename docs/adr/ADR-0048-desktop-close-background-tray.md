<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0048：桌面窗口关闭后台运行与托盘选型

状态：采纳（macOS 原生实测；Windows/Linux 托盘路径待目标系统实测，见验证边界）。

## 功能声明

- 功能领域 / 归属层：运行载体实现（桌面壳窗口生命周期），[形态规范](../00-product/product-forms.md)第 5 节载体差异「窗口关闭行为」。
- 功能定位与操作对象：Standalone GUI 点关闭按钮后进程保持后台运行（监控告警、文件清理、更新服务不停）；按 OS 惯例恢复窗口与真正退出。
- Platform 适用性：不适用（浏览器形态无窗口概念）。
- Standalone 两载体适用性：Web 载体不适用（标签关闭只断开会话，服务进程本就独立运行）；GUI 载体新增。两载体业务功能与页面呈现保持等效，本差异仅限载体层并已登记第 5 节清单。
- CLI 适用性：不适用（无 UI）。
- 访问主体：本机用户；无权限面、无契约影响（不动 OpenAPI）、无持久化（不新增表与设置键）。
- 菜单与页面呈现：应用内无页面/菜单/仪表盘变化；Windows/Linux 新增通知区域图标（原生菜单，非共享前端，不进 i18n 目录）。
- 运行环境与依赖条件：新依赖 `github.com/energye/systray v1.0.3`（MIT，getlantern/systray 去 GTK 分支）：Windows 纯 win32 syscall，Linux 经 D-Bus StatusNotifierItem/AppIndicator（纯 Go，无新增 CGO）。macOS 托盘为自写 cgo Cocoa（见修订），与 Wails 同为 darwin 原生构建既有 cgo 面。托盘图标 Windows 用 `assets/brand/favicon.ico`（`LoadImage` 仅识别 .ico，新增 embed `brand.AppIconICO`），Linux 用 `brand.AppIcon`（PNG），macOS 用单色模板 `cmd/desktop/menubar-template.png`。

## 决策

1. 关闭=隐藏后台：用 Wails `HideWindowOnClose: true`，不用 `OnBeforeClose` 拦截。三端均为原生隐藏路径（Windows WM_CLOSE→`WindowHide`、Linux `gtk_widget_hide_on_delete`、macOS `[NSApp hide:nil]`），不进入 `Frontend.Quit()`，因此 OTA 更新与回滚的 `wailsruntime.Quit`、正常关闭链（SQLite/日志/监控收尾）均不受影响，无需绕行标志。
2. macOS 走原生习惯：红点=应用级隐藏（Cmd-H 语义），点 Dock 图标由 AppKit 原生恢复（应用级隐藏不依赖 reopen 代理；Wails 未实现窗口级 `orderOut` 后的 Dock 恢复，故不用 `WindowHide`）。Cmd+Q 与 Dock「退出」为真正退出。

## 修订（同日，实测反馈后）

维护者实测后修订两点：

1. **macOS 也加载菜单栏图标**（不再托盘仅 Windows/Linux）：手写 cgo `NSStatusItem`（`cmd/desktop/tray_darwin.go/.m/.h`），不使用 energye/systray 的 darwin 路径——Wails 独占主线程 runloop，而 OnStartup 在独立 goroutine（v2.17.1 darwin `frontend.go:248`），第三方库的 `nativeStart` 无法安全落位；自实现经 `dispatch_async_f` 主队列回调创建状态项。左键/右键均弹出菜单（「打开 Unicore」「退出」，`NSLocale` 语言判定）；图标用品牌 U 形单色 alpha 模板（`menubar-template.png`，`NSImage.template=YES`，自动适配明暗菜单栏）。菜单动作经 `//export` 回调 Go 后立即转 goroutine，避免占用主线程。
2. **窗口内容全尺寸**：`mac.TitleBar{FullSizeContent, HideTitle, TitlebarAppearsTransparent}` 消除标准标题栏与内容之间的分隔线。标题栏高度由应用自绘：`shell.css` 对 `:root[data-desktop=mac]`（仅 `apps/desktop` 入口写入该标记，Web 载体不受影响）加 `padding-block-start: 28px` 顶条并作为窗口拖拽区（`--wails-draggable: drag`，后代元素显式 `no-drag` 防继承误拖），固定定位的侧栏顶部同步下移到 40px，红绿灯悬浮于顶条内、不与应用内容重叠。
3. Windows/Linux 托盘：`energye/systray`，`OnStartup` 中 `go systray.Run(...)` 启动（build tag `(desktop || bindings) && !darwin`，darwin 走上述自实现文件，与 `updates_enabled/disabled` 模式一致）。左键/Activate=恢复窗口（`Show`+`WindowShow`）；右键默认菜单两项：「打开 Unicore」「退出」；「退出」调 `wailsruntime.Quit` 走正常关闭链；`OnShutdown` 调 `systray.Quit` 收尾。
4. 不做设置开关：桌面形态无设置页（`Capabilities.Settings=false`），行为固定为后台运行；如需开关须先补桌面设置面，属后续迭代。
5. 托盘菜单语言按系统：Windows `GetUserDefaultUILanguage` 主语言判定，POSIX 环境读 `LC_ALL`/`LC_MESSAGES`/`LANG`，仅中文/英文两档；原生菜单不属共享前端 i18n 约束。
6. 已知边界：单实例二次启动仍因 `local.Open` 的 flock 报错（与既有行为一致，非回归；后续可评估 Wails `SingleInstanceLock` 实现二次启动恢复窗口）；GNOME 无 StatusNotifier 支持时托盘不可见，属桌面环境限制，如实记录于发布 runbook。

## 验证边界

macOS 原生构建实测（辅助访问脚本驱动）：点关闭后进程存活且 `Hidden=true`、Dock/菜单栏图标恢复、托盘「打开 Unicore」恢复（`Hidden=false`）、托盘「退出」与 Cmd+Q 干净退出（无 stop_failed）；全尺寸内容顶条与侧栏下移为实测截图确认。Windows：`GOOS=windows` 交叉编译通过（仅类型检查，非运行验证），托盘恢复/退出需 Windows 原生构建实测。Linux：`energye/systray` 包 `GOOS=linux` 编译通过，完整 GUI 构建与托盘行为需 Linux 原生环境（GTK 栈）实测。`make test-go`、`scripts/check-boundaries` 通过（wails/systray 仅进入 `cmd/desktop`）。
