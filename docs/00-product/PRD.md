<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品基线与当前范围

正式名称 Unicore，命令 unicore，作者 yunnuo / ymz@ebox.vip。完整基线见 [design-v1.1.md](design-v1.1.md)，本文件区分目标与已实现能力。

## 形态矩阵

| 能力 | web-platform | web-standalone | desktop | cli |
| --- | --- | --- | --- | --- |
| 共享文本分析 Core | M1 | M1 | M1 | M1 |
| React / 三态主题 | M1 | M1 | M1 | 不适用 |
| 传输 | Chi HTTP | Chi HTTP | Wails bridge | 直接调用 |
| 安装 / DB | M2 待实现 | M2 待实现 | M2 自动 SQLite 待实现 | 禁止强依赖 |
| 用户 / RBAC | M2 待实现 | 不装配 | 不装配 | 不装配 |
| SMTP | M2 待实现 | 不装配 | 不装配 | 不装配 |
| OIDC | M3 待实现 | 不装配 | 不装配 | 不装配 |
| 备份 / 正式发布 / 升级 | M4 待实现 | M4 待实现 | 后续 | 后续 |

M1 运行模式从启动配置确认，不提供 UI 模式切换。未来持久化实例禁止无损切换 profile。v1 是单实例多用户，不是多租户 SaaS。

## M1 验收

1. 同一输入在 HTTP、桥接、CLI 返回完全一致的 Unicode 字符数、空白分隔词数、行数、字节数与 SHA-256；无存储、无模拟结果。
2. CLI transitive dependencies 不包含 HTTP/Wails/SQL/平台账号模块；Core 不依赖 adapter。
3. 浏览器通过 HttpTransport、桌面通过 WailsTransport 使用同一个工作台；桌面不启动业务 HTTP server。
4. 空白/超限输入明确报错；加载、错误、空结果、执行成功可见；375px 不横向溢出，主题本机保存。
5. `make test`、Web 与 CLI 构建通过；本机 Wails 构建及浏览器 E2E 独立记录。未执行跨 OS GUI 测试不得声称通过。

## 后续阶段

M2：冻结 SQL 适配方案，一次性 bootstrap token 安装状态机、profile 隔离的迁移、平台本地认证/RBAC、SettingDefinition、SMTP；GUI 自动初始化 SQLite。M3：OIDC PKCE/state/nonce、严格绑定策略、可访问性与桌面体验。M4：签名 manifest、受控 updater、tar 恢复演练、Docker 外部替换、数据备份恢复。没有真实服务端前不伪造授权/更新成功。
