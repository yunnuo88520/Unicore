<!-- Author: yunnuo <ymz@ebox.vip> -->
# 设置清单验收（2026-10-27）

> 本文保留该阶段的验收记录；系统更新、签名流程及其后续验证以 [更新验收](acceptance-updates.md) 为准，早期占位与未实现描述不再代表当前能力。

影响 Web 两模式和真实 Wails 桌面；CLI 不装配设置且授权/升级能力始终关闭。补齐 ICP 公共页脚、SMTP 别名、favicon ICO、系统通知模板/内部队列与可独立裁剪的授权/升级占位。来源见 [设置需求](../00-product/feature-settings.md) 和 [ADR-0010](../adr/ADR-0010-settings-edition.md)。

复用 system_settings/mail_jobs，无 schema 迁移；历史迁移 checksum 不变。OpenAPI 仅增加两个可选公开 bootstrap 字段并扩展 favicon 格式说明，无新授权/升级 API。

## 交互与清单

设置只有一层业务 Tabs，切换时显示当前内容；键盘方向键/Home/End 可切换，URL 保留主标签。基础信息、安全与 SMTP 表单按组保存，跨标签保留草稿，未保存分组有提示；品牌图片的预览也跨标签保留。品牌恢复原来的浅色 Logo、深色 Logo、站点图标三张卡片；邮件模板用下拉选择类型。外观直接复用原工作空间的三张主题预览卡片，移除侧栏重复入口，旧 #settings 指向同一个外观标签；保存默认主题同时应用到当前设备，顶部快捷切换仍为设备偏好。

| 要求 | 已验证结果 |
| --- | --- |
| Logo / Favicon ICO | PNG/JPEG 原有链路保持；ICO PNG/DIB 边界校验和重编码测试通过；真实页面预览、保存、刷新、恢复及只读角色通过 |
| 名称、版权、ICP | 工作台标题/品牌/页脚与账号页共用；保存、刷新、空备案隐藏和危险链接拒绝通过；长站点名不与 FRAMEWORK 重叠 |
| 安全与管理路径 | 登录/注册图形验证码默认开启；/admin 改为 /control 后旧路径 404、新路径 200；后端权限检查保持 |
| SMTP | 主机/端口/TLS/账号/加密密钥/发件邮箱/别名可配置，掩码读取；实际 loopback SMTP 验证别名及账号邮件，不使用真实凭据 |
| 系统通知 | 第五套 HTML/纯文本主题模板、内部 Notify 入队，重启后队列投递并保留 Logo 快照；未添加任意公开发信接口 |
| 授权与升级 | 四种独立编译组合、Go 文件选择、前端文本排除、features.json 和真实 PC/375px 页面通过；占位按钮禁用、空 Update Log、不注册检查/OTA API |

## 自动与页面验证

- `make docs`、`make test`：文档/契约/设计/作者/依赖边界、Go vet/race、TypeScript、28 项 Vitest 通过。
- `GOCACHE=/private/tmp/unicore-go-cache PLAYWRIGHT_BROWSERS_PATH=/private/tmp/unicore-playwright make test-e2e`：28 项通过；PC 和 375px 覆盖安装、账号、权限、OIDC、真实 Go 调用及设置交互。增加单层标签、草稿保留、跨组保存隔离、主题卡片持久化、旧外观地址兼容和常用桌面保存按钮可见检查。
- 同一缓存环境运行 `make test-features`：11 / 10 / 01 / 00 四组合均通过，每组合两项真实浏览器用例；验证对应能力与编译裁剪，最终 Web 构建恢复默认 00。
- `add-setting`、`release-cross-platform` 两个 Skill 通过 quick_validate；设置扩展约定明确登记单层标签与保存范围。

实际截图已检查并归档：[基础信息](evidence-settings/web-site-light.png)、[三张品牌卡片](evidence-settings/web-brand-light.png)、[外观浅色](evidence-settings/web-appearance-light.png)、[外观深色](evidence-settings/web-appearance-dark.png)、[手机外观](evidence-settings/mobile-appearance-dark.png)、[SMTP](evidence-settings/web-smtp-light.png)、[授权升级](evidence-settings/web-edition-light.png)、[手机授权升级](evidence-settings/mobile-edition-dark.png)、[通知模板](evidence-settings/web-platform-notification.png)、[深色通知](evidence-settings/web-notification-dark.png)、[公开账号页脚](evidence-settings/mobile-public-footer.png)。模板证据直接截取已显示内容的 iframe，避免离屏全页截图产生空白预览。

## 原生验证

macOS arm64 分别构建默认版和 FEATURE_LICENSE=true / FEATURE_UPDATER=true 版真实 Wails。打包后 bundle ID vip.ebox.unicore、名称、可执行文件和五种 ICNS 分辨率品牌像素校验通过。使用独立 `/private/tmp/unicore-settings-native/data`，不通过 HTTP 模拟。

已用真实窗口验证：基本设置保存后跨重启保留；单层标签和三张品牌卡片；原生文件选择器选择项目 ICO、预览/保存、重启后读取；恢复默认；外观卡片保存后立即切换浅色；启用版显示禁用的授权/升级占位。最终恢复默认版并核对模块隐藏、主题与恢复值持久化；真实 Core 再次返回 61 字符 / 9 词 / 3 行。

证据：[基本设置](evidence-settings/native-site-tabs.png)、[品牌与持久 ICO](evidence-settings/native-ico-saved.png)、[恢复图标](evidence-settings/native-ico-restored.png)、[统一外观](evidence-settings/native-appearance-cards.png)、[启用占位](evidence-settings/native-edition-tabs.png)、[默认版重启](evidence-settings/native-default-settings.png)。

## 边界

真实授权服务、版本服务/Update Log 和 OTA 执行按要求仅占位；业务通知的订阅、具体触发与跨事务 outbox、备份/恢复、签名发行仍为后续。本轮未重测 PostgreSQL/MySQL、其他 OS 原生显示、完整 Docker 镜像或 release 全矩阵；Docker 模板已补齐品牌/契约生成所需脚本、资源、Wails 配置与 gofmt，仍需镜像构建/运行验收。本轮不发送外部邮件、不上传发行产物。
