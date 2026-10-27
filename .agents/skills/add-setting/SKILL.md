---
name: add-setting
description: 向 Unicore SettingDefinition 增加分组设置、profile 范围、校验与敏感值处理。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-setting

## trigger

新增服务器持久设置；本机主题偏好不需要服务器注册。

## inputs

键、类型、分组、默认值、敏感性、profile、权限、校验与恢复。

## steps

1. 阅读原始设计第 8 节、ADR-0003，沿用 internal/settings 的 SettingDefinition 注册表与既有持久化 port。
2. 在统一注册表登记定义，后端校验类型、范围及权限，契约变更后生成。
3. 敏感值通过 SecretStore 加密，密钥外置；读取掩码，区分清空和保持不变。
4. 敏感更新写审计但不记录原值；管理路径校验保留字并有恢复入口。
5. 按 profile 展示；平台全局设置的读取与修改均需固定管理员，普通用户不挂载该组件或请求管理接口。平台外观只用当前客户端 localStorage，不注册 appearance 分组、不保存服务器默认主题；单机/桌面保留本地默认主题。SMTP 未就绪不能开启必需邮件流程。

## output

定义、校验、适配或迁移、UI、审计和恢复文档。

## forbidden

散落硬编码设置；明文 secret；回传完整密码；把安装 profile 当成可随时切换的设置。

## validation

测试权限、错类型、不适用 profile、密钥缺失、掩码和保存失败；make test 与相关构建。

## 托管品牌图片

修改 branding.* 时阅读 [品牌规范](../../../docs/00-product/feature-branding.md) 和 [ADR-0009](../../../docs/adr/ADR-0009-runtime-branding.md)。引用登记于 Definitions，但普通 PATCH 不可写；通过 internal/branding 校验并重编码，再原子写文件、提交引用、按已确认引用清理。不要把图片 base64 存入设置值或改生成资源。Web 返回哈希 URL，Wails 返回 data URI；邮件创建时快照图片。验证替换失败、共用文件、默认恢复、重启和实际页面/桌面。

## 公共站点与邮件设置

备案号/HTTPS 查询链接、SMTP 别名和通知约定见 [设置规范](../../../docs/00-product/feature-settings.md)。公开设置变化同时检查 HTTP/Wails bootstrap 与工作台/账号页页脚；不公开敏感值。mail.from_name 是显示名，不参与连接指纹；主机/端口/TLS/账号/密钥仍需重新测试。系统通知调用内部 Notify，复用加密队列，不添加任意公开发信 API 或默认群发订阅。favicon 另支持有边界的 ICO→PNG 解码，Logo 仍仅 PNG/JPEG。

## 标签与保存约定

新增设置分组必须登记 settings-page.tsx 的业务标签映射与 profile 过滤，不能静默遗漏新分组。沿用共享单层 Tabs，不嵌套子标签；品牌保留三张卡片，主题复用 appearance.tsx 预览卡片、基础设置中不建重复外观入口。每次只展示当前任务，表单草稿和图片预览切换保留；只 PATCH 当前分组，不能连带保存其他标签。验证键盘切换、草稿保留、保存隔离、刷新主标签恢复、375px 无页面横溢和桌面常用操作可见。不要把 Tabs 做成长页锚点。

当前页面分工见 [ADR-0014](../../../docs/adr/ADR-0014-separate-identities-management.md)：基础设置保留单层业务标签；SMTP/账号流程和测试合在独立邮件设置页，无子标签，测试收件人用弹窗；审计/投递在系统日志，不展示模板配置。授权与更新是独立占位页，实际集成卡片仍编译裁剪。全局设置变更需保持当前管理员入口，后台改名同步地址。

设置/品牌保存与 SMTP 测试反馈使用 useMessage，默认顶部 3 秒，保存按钮保持尺寸与位置；字段校验就地显示。单机与 Wails 不出现账号头像/操作。验证浅深主题、375px、三秒消失及失败反馈。
