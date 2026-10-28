<!-- Author: yunnuo <ymz@ebox.vip> -->
# 配置、生命周期、日志与监控

Web 配置由 internal/config.LoadWeb 加载并验证：flag > APP_* 环境 > 默认值。已安装的 profile/数据库/设置以私有持久配置为准，启动 profile 只是安装初始选择。SecretKey、BootstrapToken、AdminPath 继续由组合根注入，不打印完整有效配置。

| Flag | 环境变量 | 默认/限制 |
| --- | --- | --- |
| --listen | APP_LISTEN | 127.0.0.1:8080 |
| --profile | APP_PROFILE | 空，由安装选择 web-platform/web-standalone |
| --data-dir | APP_DATA_DIR | data |
| --deployment | APP_DEPLOYMENT_KIND | development；另支持 tar/docker |
| --log-level | APP_LOG_LEVEL | info；debug/info/warn/error |
| --log-format | APP_LOG_FORMAT | json；json/text |
| --shutdown-timeout | APP_SHUTDOWN_TIMEOUT | 5s；100ms–2m |
| --readiness-timeout | APP_READINESS_TIMEOUT | 2s；100ms–10s |
| --api-docs | APP_API_DOCS | false |
| --monitor-listen | APP_MONITOR_LISTEN | 关闭；只允许字面量回环 IP:端口 |

`build/bin/server --help` 查看参数。CLI/桌面共享日志的环境选项，日志发 stderr，CLI stdout 保持业务 JSON。Web 日志发 stdout，包含 event/service/profile、请求 ID、method、路由模板、状态码和耗时；不记录原始 URL/query、请求内容、凭据或 panic 值。安全审计仍通过既有持久审计记录处理，不以请求日志代替。

组合根先校验配置、打开存储、绑定全部 listener，再启动 worker 和 HTTP。启动失败会逆序关闭已创建组件，清理失败合并返回。退出先排空 HTTP，再停监控/worker，最后关闭存储；到达截止时间关闭连接并取消请求 context，handler 和外部调用必须遵守取消。内部 Stack 不进入 CLI，避免引入 net/http。桌面 Wails 返回后执行存储清理，main 最后决定退出码。

Windows 桌面是无控制台 GUI；普通启动失败除 stderr 外还显示原生「启动失败」弹窗与错误详情，关闭后退出码为 1。更新 helper 仍使用自己的任务诊断，不弹出交互框阻塞回滚。排查时可在终端设置 APP_DATA_DIR 为独立临时目录再运行 exe，不删除真实 AppData 或安装标记。SQLite 接收绝对本地路径，构造空 authority 的 file URI（Windows 为 file:///C:/...），并转义中文、空格、#、% 等路径字符；不能将盘符作为 host。

`/api/v1/health/live` 表示进程能响应；`/api/v1/health/ready` 在完成安装且 DB Ping 在独立超时内成功时返回 200，否则 503。示例：`APP_MONITOR_LISTEN=127.0.0.1:9090 build/bin/server` 开启独立 `/metrics`，支持 Prometheus HTTP 请求计数、活动数、耗时直方图及 DB 连接池/等待计数。标签仅使用路由模板、标准方法、状态码，未知路径统一 unmatched。监控端口不开放业务 API、不默认映射容器公网；通过受控同机采集使用。默认不启用 tracing，OpenTelemetry 与外部日志/告警平台后续按实际部署接入。

数据库沿用 [ADR-0003](../adr/ADR-0003-m2-install-storage-identity.md) 的 database/sql + Repository + 嵌入式分方言 SQL；连接池/Ping/迁移与 checksum 已有，不叠加 GORM AutoMigrate。数据库变更使用 [db-migration](../../.agents/skills/db-migration/SKILL.md)，部署、密钥和恢复边界见 [运行手册](../03-runbooks/deployment.md)。
