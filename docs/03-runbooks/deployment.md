<!-- Author: yunnuo <ymz@ebox.vip> -->
# M1 运行与开发部署

M1 是没有账号与持久化的开发预览。以下模板用于验证交付形态，不能视为已满足 v1 生产部署、备份或升级验收。无需数据库，输入只在内存处理。

## 本机

`make install`，分别运行 `make dev-server` 与 `make dev-web`，访问 `http://127.0.0.1:5173`。直接 Go 服务的静态文件未构建时返回 503，先 `make build-web` 再执行 `build/bin/server`。可用 `APP_PROFILE=web-platform` 或 `--profile` 选择 Web 元信息；`APP_DEPLOYMENT_KIND` 接受 development/tar/docker。

桌面需要 Wails v2.12.0 与本 OS 的原生开发库，`make dev-desktop` 使用端口 5174 的 Vite 与 Wails bridge；直接浏览器打开桌面入口会显示 bridge unavailable，不模拟 HTTP。`make build-desktop` 使用本机工具链生成应用。Linux 需 WebKitGTK 4.0（Ubuntu 22.04），4.1 环境须给 Wails 追加 webkit2_41 tag。Windows 需 WebView2，macOS 需 Xcode command line tools。M1 尚不创建 SQLite 文件。

## tar 开发预览

`make release` 在 `build/releases/` 生成 CLI 双架构三系统和 Linux 双架构的两种 Web profile 包。每包包括 metadata，外部 manifest 包括 SHA-256；M1 未签名，不用于在线更新。可通过 `RELEASE_TARGETS=linux/amd64 make release` 缩小本机验证矩阵。Web 包内有嵌入静态资源的 server、供 Nginx 分离托管的 web/ 和 deploy/ 模板。

将 Web 包部署到 `/opt/unicore/current`，Nginx root 指向 `web/`，反向代理 `/api/` 到 loopback:8080。API 不可用时不能回退 index.html。示例端口 8088 与 Nginx 均限定 loopback，远程访问必须先完成后续安全能力及受控访问入口。systemd 使用 unicore 专用用户；先由运维创建用户和 `/var/lib/unicore`，不要以 root 运行 server。

## Docker 开发预览

```sh
docker compose -f deploy/docker/compose.yaml up --build -d
curl http://127.0.0.1:8088/api/v1/bootstrap
docker compose -f deploy/docker/compose.yaml down
```

多阶段镜像：React 构建 → Go 嵌入 → 非 root distroless。容器内部监听 0.0.0.0，宿主只映射 loopback。M1 不需要卷、不包含 DB；后续加入持久化必须外置 volume，禁止将真实 secret bake 到镜像。替换方式为运维在外部执行 `docker compose ... pull` 与 `up -d`；不挂 socket、不在容器覆盖自身程序。当前 compose 本地 build 模板不提供远程 image，需部署方配置正式仓库后才能 pull。

## 故障与恢复边界

- 前端连接失败：检查 Go 服务/代理目标；用 `/api/v1/health/live` 和 `/ready` 检查无状态进程。
- 编译缺少 embed 文件：保留两个 static/.gitkeep，构建 UI 后再构建 Go。
- 主题异常：只删除本机 `unicore.theme`，无需清业务数据。
- M1 无 DB/配置密钥/上传数据，无备份恢复命令；未来必须新增 SQLite 一致性备份、外部 DB 原生备份、SecretStore 密钥保管、迁移兼容与恢复演练。
- M1 不执行版本替换/升级。发布包未签名，不承诺仅回滚二进制能恢复未来不可逆 schema。tar 辅助升级器及 Docker 升级演练属于 M4。

正式发布须补齐上面的缺口，通过原设计 AC-01～AC-15，签名密钥由外部受控流程提供。
