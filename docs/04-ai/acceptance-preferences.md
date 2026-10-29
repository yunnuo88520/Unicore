<!-- Author: yunnuo <ymz@ebox.vip> -->
# 客户端偏好与双语验收

日期：2026-10-29。需求、实现和兼容见 [ADR-0019](../adr/ADR-0019-local-preferences-i18n.md) 与 [使用/扩展指南](../03-runbooks/client-preferences.md)。本轮不改变服务端契约、身份或数据库结构，没有数据库迁移。

影响 web-platform 用户与管理员、web-standalone 和 desktop；CLI 无界面，仅验证依赖边界。侧栏采用顶部版本气泡/状态点、底部文档与关于。共享前端新增 preferences/i18n、ClientControls、AppearanceDrawer、Tooltip 与 VersionBadge；既有页面接入文案目录，tokens 源新增预设，生成器输出浅深配色和运行时尺度。

## 验证结果

- `make docs` 与 `make test` 通过，包含契约/设计/作者头/依赖边界检查、Go vet 与 race、46 项前端测试。偏好测试覆盖旧主题迁移、白名单、坏 JSON、禁止存储、写入额度耗尽、跨标签同步和重置；语言目录测试检查词条、插值和已知 API 错误文案。
- 四种 license/updater 编译组合全部通过 `make test-features`，验证功能裁剪及 PC/375px 页面；最终恢复默认 license=false、updater=true。
- 浏览器全量回归的 60 个场景中，50 个首次通过、4 个企业登录场景修正中文按钮插值后专项复验通过，合计 54 个可运行场景通过。6 个依赖 MySQL/PostgreSQL 或 MinIO 的场景因本轮未配置外部服务而跳过，不计为实测。偏好/企业登录专项 10 项通过，最终 PC 截图专项 3 项通过。
- 真实 Go 隔离实例验证中英切换、全部管理页面英文巡检、安装与登录入口、表单草稿保留、刷新/跨标签持久化、浅深配色、布局/侧栏/全宽/RTL、375px 无横向溢出、抽屉滚动/关闭/回焦及外观重置保留语言。普通用户不显示版本，也不请求更新概览；气泡状态不触发外网检查。
- Web、CLI 和 macOS Wails 原生构建通过，原生品牌图标五尺寸检查通过。真实 Wails 窗口使用独立 bundle ID 与临时数据目录，验证中文/英文、浅深色/海洋色、退出并重新启动后的语言与外观保留、重置外观保留语言、Escape 关闭回到主题按钮。没有用 HTTP 页面替代原生验证；未修改日常实例数据。隔离预览仅 ad-hoc 签名，不是 Developer ID 签名或 Apple 公证。

## 文件与证据

状态与语言入口为 `preferences.ts`、`i18n.ts` 与 `locales/`；共享交互为 `client-controls.tsx`、`appearance-drawer.tsx`、`tooltip.tsx`、`shell-tools.tsx`、`preferences.css` 和既有外观页。`App.tsx` 与现有共享业务页面统一接入，`assets/theme/tokens.json` / `scripts/generate-theme.mjs` 生成运行时配色和尺度。测试位于对应前端测试与 `tests/e2e/preferences.spec.ts`；开发规范、任务 Skill、文档入口、manifest、Wiki 源和 CHANGELOG 同步更新。

保留的真实原生截图：[中文工作台](evidence-preferences/native-workspace-zh.png)、[中文主题抽屉](evidence-preferences/native-drawer-zh.png)。其它 PC/375px/深色/RTL 截图与页面输出位于 `build/acceptance/preferences/`，隔离数据目录不进入源码。

边界：发布日志、实例名称、用户笔记和文件名保持原文；本地存储被系统拒绝时仅进程内生效；不同 origin 的浏览器偏好相互独立。原生标题栏/系统菜单不属于网页主题与语言切换。Windows/Linux 原生窗口尚未以本机 macOS 验证代替；本轮不合并、不发布新的 Release。
