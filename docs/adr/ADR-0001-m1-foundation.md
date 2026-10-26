<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0001：先完成跨形态最小闭环

状态：接受 · 日期：2026-10-26 · 作者：yunnuo / ymz@ebox.vip

背景：原始 v1.1 第 19 节要求先证明 Core 复用，再引入安装/账号/升级；仓库初始为空。

决定：本次交付 M1，而非将完整 v1 功能做成模拟界面。以可验证摘要和 Unicode 边界的文本分析为共享用例；Chi、Cobra、Wails v2.12.0 各自 adapter。Desktop 入口使用 build tag，桥接可在无 GUI 环境测试。Web 两 profile 在 M1 仅有运行元信息差异，能力明确 false。

替代：一次加入平台数据库/身份会掩盖依赖耦合；用 HTTP 模拟桌面无法验证本地 bridge；CLI 连接本地 server 违背独立运行约束。均不采用。

后果：M1 无数据库，无安装页、登录或线上更新。原设计 AC-01～04、06～10、12 的可开关启用分支、13～14 的生产部署恢复部分尚未满足。后续开发必须新 ADR 冻结 DB、多方言迁移与鉴权。

Wails 的 bindings 生成步骤会移除内置 desktop tag，因此原生入口约束为 `desktop || bindings`，既支持生成器，也让默认 Go 测试排除原生 GUI 入口。
