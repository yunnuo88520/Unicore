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
5. 按 profile 展示；SMTP 未就绪不能开启必需邮件流程。

## output

定义、校验、适配或迁移、UI、审计和恢复文档。

## forbidden

散落硬编码设置；明文 secret；回传完整密码；把安装 profile 当成可随时切换的设置。

## validation

测试权限、错类型、不适用 profile、密钥缺失、掩码和保存失败；make test 与相关构建。
