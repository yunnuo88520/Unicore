<!-- Author: yunnuo <ymz@ebox.vip> -->
# 客户端偏好与双语验收

日期：2026-10-29。当前约定见 [ADR-0019](../adr/ADR-0019-local-preferences-i18n.md)、[偏好扩展](../03-runbooks/client-preferences.md) 与 [前端基础封装](../03-runbooks/frontend-foundations.md)。维护者最终要求移除阅读方向：工作区和主题抽屉统一 LTR，旧存储中的 direction 字段忽略，其他外观与语言选择保留。早期 RTL 截图和验证仅为历史调试，不代表当前支持范围。

## 需求与影响

| Profile | 本轮影响 | 验收方式 |
| --- | --- | --- |
| web-platform 用户 | 共享布局、本地外观和双语；不增加管理或版本权限 | 真实 Go 服务、登录与越权页面回归 |
| web-platform 管理员 | 同源布局、管理页双语与版本气泡 | PC/375px 管理页巡检 |
| web-standalone | 布局切换、旧偏好兼容与本地双语 | 布局矩形、表单、刷新和跨标签测试 |
| desktop | 同源 UI、真实原生主题抽屉 | macOS Wails 构建与实际窗口操作 |
| cli | 无 UI/API/数据库改动 | 依赖边界检查 |

无服务端契约、身份、数据库或迁移变更。回退只需还原前端版本；忽略旧方向字段不删除其他偏好。

## 实现与文件

- `workspace-layout.tsx` / `workspace-layout.css` 统一 navigation/header/children/overlays 插槽、固定导航占位、767px 断点、侧栏与内容宽度；App 组合内容，移除散落偏移。全宽和移动导航可真实打开、跳转与关闭，隐藏导航不进入键盘/可访问树。
- `preferences.ts` / `theme.ts` / `appearance-drawer.tsx` 移除阅读方向 schema、控件与样式；旧 RTL 自动恢复 LTR，抽屉选项由单一偏好 schema 管理。`tooltip.tsx` 使用 portal 和视口边界定位，避免窄屏气泡扩大页面、按下与抬起时按钮移位。
- `i18n.ts` / `locales/` / `scripts/check-i18n.mjs` 约束 t/defineMessages、英文目录、插值、设置/权限标签与契约错误；递归扫描新目录，Web/GUI 构建和 make test/CI 必跑。`check-i18n.test.mjs` 验证中文直写、缺词条、动态模板 key、插值缺失和嵌套目录会被拒绝。示例业务文本放 `packages/web-ui/fixtures/analyze-sample.ts`，保持用户内容原文。公开样例不能放通用排除的 data 目录，避免 Docker 构建漏文件；Docker 前端阶段同时复制设置/权限定义，保持与本地相同的双语检查范围。
- `tests/e2e/layout.spec.ts` / `preferences.spec.ts` 与前端偏好测试覆盖旧数据恢复、布局几何和英文界面。AGENTS、页面/设置/文档 Skills、PRD、架构、ADR、前端规范、manifest、文档入口、Wiki 源和 CHANGELOG 同步更新。

## 最终验证

- `make docs`、`make test` 通过：契约/设计/作者头/依赖边界、Go vet/race、46 项前端测试与 9 项工具测试，其中 4 项验证双语门禁。
- 浏览器全量 62 个场景，56 通过、6 跳过、0 失败。跳过的是本轮未配置的外部 MySQL/PostgreSQL/MinIO，不计为实测。布局最终矩阵为 6 个宽度 × 3 种布局 × 3 种侧栏 × 2 种内容宽度，共 108 组合；旧 RTL 偏好启动后 HTML 固定 LTR，正文与固定导航的实际矩形不重叠。
- 四种 license/updater 组合全部通过 `make test-features`，最终恢复 license=false、updater=true。Web 与 macOS Wails 原生构建通过，原生图标五尺寸检查通过。
- 真实页面检查中文/英文、管理页品牌标签、安装/登录控件、业务草稿保留、刷新与跨标签持久化、浅深配色、375px、全宽导航点击及抽屉关闭/回焦。普通在线用户不显示版本，不请求更新概览；版本气泡不自动连接外网。
- Wails 使用独立 bundle ID、临时数据目录与真实原生桥接，未触碰日常实例。最终构建重启后确认侧栏在左、抽屉无阅读方向、布局/语言选项完整，Escape 关闭后焦点回到主题按钮。先前原生验证的语言/外观重启保留和重置保留语言继续适用。没有以 HTTP 模拟原生窗口；测试副本仅 ad-hoc 签名。

最终原生证据：[工作区](evidence-preferences/native-workspace-final.jpg)、[主题抽屉](evidence-preferences/native-drawer-final.jpg)、[布局与语言选项](evidence-preferences/native-options-final.jpg)。浏览器结果在 `build/acceptance/layout/`，隔离数据不进入源码。

边界：本轮 Windows/Linux 新 UI 未做原生窗口验收；macOS 结果不能代替。Developer ID/Apple 公证仍待开发者凭据。外部更新日志、实例名称、笔记和文件名不自动翻译；存储受限时只在进程内保留偏好，不同 origin 互相独立；原生标题栏/系统菜单不属于网页语言设置。本轮保留草稿 PR，不合并、不发布新 Release。
