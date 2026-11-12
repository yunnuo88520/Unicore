<!-- Author: yunnuo <ymz@ebox.vip> -->
# 参与应用开发

先阅读 [协作约定](AGENTS.md) 与 [开发规范](docs/product/development.md)。每项变更说明可观察行为、四 Profile 影响、权限/迁移/恢复风险与真实测试结果。

运行 make docs、make test 和受影响构建，页面同时中英文，不跳过质量/安全检查。新 Git 提交标题与正文使用英文，不改历史提交。大改先评审设计，保护已有工作区修改。

漏洞请私下联系本项目维护者，见 [安全政策](SECURITY.md)。公开发布与生产变更另行授权。

疑似通用框架问题按[上游协作流程](docs/product/framework-upgrade.md)最小复现，临时补丁与业务改动分开。提交框架 PR 使用干净上游分支，只携带通用修复及测试；修复发布到模板后再同步回本应用。AI 辅助遵循 framework-upstream，贡献者须审核并验证结果。
