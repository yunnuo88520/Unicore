<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品分发边界

manifest.json 是 user-release、project-template、public-wiki 三个出口的唯一选择清单，不从目录扫描或 git ls-files 自动扩展。documents 复用同一源文件并声明 audience；template_files 枚举源码/资源与模板映射。增加项目代码后若需要被后续创建器导出，显式更新清单并验证，不靠 Git 跟踪状态决定分发。

用户发行文档由 release.mjs 调用 copyDistribution 复制；许可证始终保留。Wiki 从 public-wiki 文档生成并验证正文链接闭包；维护者流程与用户指南分开，研发过程材料不进入源码文档或产品。

项目模板保留业务源码、四 Profile 装配、构建/质量脚本与新旧迁移资产；替换根协作入口/manifest 为应用级版本，使用一个按任务触发的应用开发 Skill。历史比较器与其专用隔离采集器不属于派生项目模板，因此不复制上游七份历史 JSON；原仓库七份 JSON、比较器与全部 SQL 均保持原样。不要将这项分发决定误读成删除原始测试输入。

创建器默认拒绝选中 Git 输入的未提交修改；显式 --allow-dirty 只表示调用者已审阅，仍不绕过白名单、敏感路径、链接和目标目录保护。provenance 记录精确输入 SHA-256、原 revision 和选择范围/整体工作区状态。源码归档无 Git 时标记 unversioned，不伪造 revision。生成索引由可信渲染函数完成，不执行来源项目的脚本或安装依赖。

隔离验证使用 node scripts/verify-distribution.mjs --source /明确候选源码 --output /新的候选输出。它生成发行文档 payload（不构建二进制）、派生项目、公开 Wiki 和逐文件 SHA-256 清单，不发布或触碰真实数据库。普通质量门禁 pnpm test:tooling 包含分发、创建器和 Wiki 回归；继续运行 pnpm check:docs / check:authors / check:migrations。

新增文档先判断受众。研发审计、验收、实验、结构快照、一次性采集器、本机环境记录和秘密不得进用户出口。白名单规则不是秘密检测的替代品，变更清单必须审阅内容和依赖；不通过关闭检查或删除必要测试解决分发问题。
