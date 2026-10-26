<!-- Author: yunnuo <ymz@ebox.vip> -->
# AI 开发任务模板

任务：描述用户可观察的问题、目标和不包含范围。

影响矩阵：web-platform / web-standalone / desktop / cli 分别说明变更、依赖、权限、存储。先读 framework.manifest.json、context.gen.md、PRD 与相关 ADR，选择仓库内对应 Skill。

设计与验收：列出输入、输出、错误码、正常/失败/重试行为、UI 状态；明确哪些 API/权限/设置/迁移需增加，及可验证完成条件。

文件清单与实现：依赖向内，生成文件从源修改；源码作者头；数据库变更附兼容与回滚策略；禁止真实凭据。

验证：执行 make docs、make test、相关 profile build；涉及 UI 跑真实后端 E2E 与 375px；桌面在可用原生 OS 验证。只报告执行过的命令与结果。

文档与交付：同步 PRD、架构、OpenAPI、运行手册，重大选择加 ADR。验收报告列出已通过、未验证、下一里程碑，不把后续目标标成实现。

中断交接：分支/提交、未提交文件、已完成与失败/未执行的检查、证据路径、下一步；不粘贴凭据或整段历史对话。
