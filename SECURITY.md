<!-- Author: yunnuo <ymz@ebox.vip> -->
# Security

请通过仓库的 [GitHub 私密漏洞报告](https://github.com/yunnuo88520/Unicore/security/advisories/new) 提交可复现问题；无法使用该入口时，可联系维护者 ymz@ebox.vip。不要在公开 Issue 粘贴密钥、备份、安装凭据或用户数据。请提供受影响提交/profile、最小复现和影响范围。

当前仍为 0.x 开发预览，仅维护 main 的修复，不承诺历史版本安全支持或响应 SLA。修复后在 CHANGELOG 标明影响、升级和数据恢复要求。

持续检查包括 Go 可达符号/导入包扫描、前端生产及开发依赖审计、契约/权限测试和配置了隔离数据库时的三方言测试。扫描通过不代表零告警或所有环境通过；实时结果查看仓库安全页与当前 CI，支持边界见 [支持范围](docs/support.md)。发布候选的 GitHub 构建来源证明不能替代升级兼容性与运行验证。发布前按 docs/03-runbooks/release.md 验证。
