<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0002：显式契约生成与轻量共享 UI

状态：接受 · 日期：2026-10-26 · 作者：yunnuo / ymz@ebox.vip

决定：OpenAPI JSON 作为线格式唯一来源，仓库脚本生成受支持 schema 子集的 Go 与 TS 类型；不引入 generated handler，HTTP 与原生 Bridge 使用相同 DTO。双 transport 的真实 Go 测试与 TS SDK 测试约束一致性。

前端采用 React 19、Vite、TanStack Query、Lucide 与原生语义组件/CSS tokens。M1 页面规模小，无图表历史数据，因此暂不引入 ECharts、Zustand、Tailwind/shadcn；这与设计推荐工具表有所调整。响应式、主题与状态验收保持一致。后续业务确需时通过 ADR 引入，不能展示假统计。

原因：手写薄 adapter 与本地生成器便于保持 CLI 依赖隔离，不需要让 Wails 或 CLI 引用 HTTP；目前 schema 简单且生成器会拒绝未支持类型。重型自动客户端或全套 UI 基础库在当前闭环中收益有限。

后果：后续 schema 增加 union/security/nullability 必须扩展生成器或迁移成熟生成工具；尚无完整 JSON schema 运行时校验。UI 使用 hash 导航支持浏览器与 Wails custom protocol。产品 widget 注入 registry，不能改框架首页制造耦合。
