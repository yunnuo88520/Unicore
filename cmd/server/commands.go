// Author: yunnuo <ymz@ebox.vip>
// Description: Web server management commands, separate from the database-free business CLI.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"syscall"

	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/config"
	"github.com/yunnuo/unicore/internal/maintenance"
	"github.com/yunnuo/unicore/internal/webmanage"
)

func management(args []string, output io.Writer) (bool, error) {
	if len(args) == 0 {
		return false, nil
	}
	switch args[0] {
	case "help", "--help", "-h", buildinfo.CLIRootCommand + "help":
		fmt.Fprintf(output, "%s %s · Web/API 服务\n\n用法 / Usage:\n  %s [启动参数]          启动服务 / Start server (configuration optional)\n  %s help                 显示帮助 / Show help\n\n命令 / Commands:\n  help                         显示帮助 / Show help\n  config generate [--output PATH]  生成配置，拒绝覆盖 / Generate configuration\n  version                      显示版本 / Show version\n  backup|verify|restore         离线备份与恢复，追加 --help / Offline maintenance\n  manage                       交互管理菜单 / Interactive management\n  start|stop|restart            systemd 服务启停 / Service control\n  service install|uninstall|status|enable|disable  服务与开机自启\n  logs [--follow]              查看服务日志 / Service logs\n  status|doctor                实例信息 / Offline diagnostics\n  config check|show            检查或查看启动配置\n  admin list|reset-password|path|set-path  管理员恢复与后台路径\n  database check|configure     检查或更换数据库连接（不迁移数据）\n  sessions revoke              离线撤销指定身份域会话\n  maintenance on|off            离线维护模式\n  site set-url                 更换对外站点地址\n\n管理命令追加 --help 查看参数；默认 ./data，服务安装后自动复用其配置。\n  serve [启动参数]             显式前台启动 / Foreground server\n\n兼容别名 / Alias:\n  generate-config              等同于 config generate\n\n首次安装 / First install: /install\n\n", theme.Current.Brand.Name, buildinfo.Version, buildinfo.CLIRootCommand, buildinfo.CLIRootCommand)
		fmt.Fprint(output, config.WebUsage)
		return true, nil
	case "version":
		if len(args) != 1 {
			return true, errors.New("version takes no arguments")
		}
		fmt.Fprintf(output, "%s %s (%s)\n", theme.Current.Brand.Name, buildinfo.Version, buildinfo.Commit)
		return true, nil
	case "backup", "verify", "restore":
		ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		return true, maintenance.Command(ctx, args, output, os.Getenv, buildinfo.CLIRootCommand)
	case "manage", "menu", "start", "stop", "restart", "logs", "status", "doctor", "service", "admin", "database", "sessions", "maintenance", "site":
		ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		executable := os.Args[0]
		if located, e := exec.LookPath(executable); e == nil {
			executable = located
		}
		return true, webmanage.Run(ctx, args, webmanage.Console{In: os.Stdin, Out: output, Err: os.Stderr, Getenv: os.Getenv, Executable: executable})
	case "config", "generate-config":
		rest := args[1:]
		if args[0] == "config" && len(rest) > 0 && (rest[0] == "check" || rest[0] == "show") {
			return true, webmanage.Run(context.Background(), args, webmanage.Console{Out: output, Err: os.Stderr, Getenv: os.Getenv})
		}
		if args[0] == "config" {
			if len(rest) == 0 || rest[0] != "generate" {
				return true, errors.New("use config generate [--output PATH]")
			}
			rest = rest[1:]
		}
		flags := flag.NewFlagSet("config generate", flag.ContinueOnError)
		flags.SetOutput(output)
		path := flags.String("output", config.DefaultFileName, "new configuration path; existing files are refused")
		if err := flags.Parse(rest); err != nil {
			return true, commandError(err)
		}
		if flags.NArg() != 0 {
			return true, errors.New("unexpected configuration arguments")
		}
		if err := config.Generate(*path); err != nil {
			return true, err
		}
		fmt.Fprintf(output, "配置已生成 / Configuration created: %s\n使用 / Run: %s --config <path>\n", *path, buildinfo.CLIRootCommand)
		return true, nil
	}
	return false, nil
}

func commandError(err error) error {
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	return err
}

func managementMain() (bool, error) { return management(os.Args[1:], os.Stdout) }
