// Author: yunnuo <ymz@ebox.vip>
// Description: Small terminal management menu backed by exactly the same operational commands.
package webmanage

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/yunnuo/unicore/internal/buildinfo"
)

func menu(ctx context.Context, args []string, c Console) error {
	fs := flag.NewFlagSet("manage", flag.ContinueOnError)
	fs.SetOutput(c.Out)
	configuration := fs.String("config", "", "startup configuration")
	data := fs.String("data-dir", "", "instance directory override")
	name := fs.String("name", buildinfo.CLIRootCommand, "service name")
	user := fs.Bool("user", false, "per-user systemd")
	if e := fs.Parse(args); e != nil {
		if errors.Is(e, flag.ErrHelp) {
			return nil
		}
		return e
	}
	if fs.NArg() != 0 {
		return errors.New("unexpected menu arguments")
	}
	common := []string{"--name", *name}
	if *configuration != "" {
		common = append(common, "--config", *configuration)
	}
	if *data != "" {
		common = append(common, "--data-dir", *data)
	}
	if *user {
		common = append(common, "--user")
	}
	reader := bufio.NewReader(c.In)
	line := func(label string) (string, error) {
		fmt.Fprint(c.Out, label)
		value, e := reader.ReadString('\n')
		if len(value) > 8192 {
			return "", errors.New("input too long")
		}
		return strings.TrimSpace(value), e
	}
	for {
		if e := ctx.Err(); e != nil {
			return e
		}
		fmt.Fprintf(c.Out, `
%s 管理菜单 / Web management
 1 启动 Start             2 停止 Stop             3 重启 Restart
 4 服务状态 Service      5 最近日志 Logs         6 安装守护服务 Install
 7 开机自启 Enable       8 关闭自启 Disable      9 卸载服务 Uninstall
10 实例信息 Instance    11 离线检查 Doctor      12 管理员列表 Admins
13 重置管理员密码       14 更换后台路径          15 检查数据库
16 更换数据库连接       17 开启维护模式          18 关闭维护模式
19 撤销账号会话         20 更换站点地址          21 查看启动配置
22 校验启动配置          0 退出 Exit
离线修改前先停止服务；Docker 请在宿主机管理容器。
`, buildinfo.CLIRootCommand)
		choice, e := line("选择 / Select: ")
		if errors.Is(e, io.EOF) || choice == "0" {
			return nil
		}
		if e != nil {
			return e
		}
		commands := map[string][]string{"1": {"start"}, "2": {"stop"}, "3": {"restart"}, "4": {"service", "status"}, "5": {"logs"}, "6": {"service", "install"}, "7": {"service", "enable"}, "8": {"service", "disable"}, "9": {"service", "uninstall"}, "10": {"status"}, "11": {"doctor"}, "12": {"admin", "list"}, "13": {"admin", "reset-password"}, "14": {"admin", "set-path"}, "15": {"database", "check"}, "16": {"database", "configure"}, "17": {"maintenance", "on"}, "18": {"maintenance", "off"}, "19": {"sessions", "revoke"}, "20": {"site", "set-url"}, "21": {"config", "show"}, "22": {"config", "check"}}
		command, ok := commands[choice]
		if !ok {
			fmt.Fprintln(c.Out, "无效选择 / Invalid choice")
			continue
		}
		switch choice {
		case "13", "19":
			username, e := line("用户名 / Username: ")
			if e != nil {
				return e
			}
			if username != "" {
				command = append(command, "--username", username)
			}

		case "14":
			value, e := line("新后台路径 / New admin path (e.g. /manage): ")
			if e != nil {
				return e
			}
			command = append(command, "--path", value)
		case "17":
			value, e := line("维护提示 / Maintenance message: ")
			if e != nil {
				return e
			}
			command = append(command, "--message", value)
		case "20":
			value, e := line("新站点地址 / New origin (https://example.com): ")
			if e != nil {
				return e
			}
			command = append(command, "--url", value)
		case "9":
			value, e := line("仅卸载服务，保留数据。继续？ / Remove service only? [y/N]: ")
			if e != nil {
				return e
			}
			if strings.ToLower(value) != "y" {
				continue
			}
		}
		if e = Run(ctx, append(command, common...), c); e != nil {
			fmt.Fprintln(c.Err, "操作失败 / Failed:", e)
		}
	}
}
