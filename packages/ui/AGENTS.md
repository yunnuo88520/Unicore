<!-- Author: yunnuo <ymz@ebox.vip> -->
# ui 域内约定

共享原语组件。组件参考见 [UI 组件参考](../../docs/product/ui-components.md)，根 [AGENTS](../../AGENTS.md) 优先。

- 原语不依赖业务包与网络层；文案经 `i18n.ts` 的翻译桩（setTranslator）保持双语。
- 样式变体用 cva 组织，`cn` 合并类名；不内联一次性样式体系。
- 可访问性基线：label 关联、aria-invalid、焦点可见；表单控件与 `@unicore/form` 的 AppField 协作。
- 行为测试用 testing-library 断言用户可观察结果，不测实现细节。
