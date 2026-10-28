<!-- Author: yunnuo <ymz@ebox.vip> -->
# Security

请通过仓库的 GitHub Private Vulnerability Reporting 提交可复现问题；如果该入口未启用，可联系维护者 ymz@ebox.vip。不要在公开 Issue 粘贴密钥、备份、安装凭据或用户数据。请提供受影响提交/profile、最小复现和影响范围。

当前仍为 0.x 开发预览，仅维护 main 的修复，不承诺历史版本安全支持或响应 SLA。修复后在 CHANGELOG 标明影响、升级和数据恢复要求。

持续检查包括 Go 可达漏洞扫描、生产前端依赖审计、契约/权限/三方言测试。扫描通过不代表没有漏洞；发布候选的 GitHub 构建来源证明也不能替代升级兼容性与运行验收。发布前按 docs/03-runbooks/release.md 验证。
