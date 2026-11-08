// Author: yunnuo <ymz@ebox.vip>
// Description: Unified Web operations; business CLI remains independent of identity and SQL.
package webmanage

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/config"
	"golang.org/x/term"
)

type Console struct {
	In         io.Reader
	Out, Err   io.Writer
	Getenv     func(string) string
	Executable string
	directory  string
}
type options struct {
	config, data, listen, name, runAs, username, realm, path, url, message           string
	user, json, yes, passwordStdin, dsnStdin, all, follow, link, now, enable, dryRun bool
	lines                                                                            int
	envFile                                                                          string
}

func (c Console) defaults() Console {
	if c.In == nil {
		c.In = os.Stdin
	}
	if c.Out == nil {
		c.Out = os.Stdout
	}
	if c.Err == nil {
		c.Err = os.Stderr
	}
	if c.Getenv == nil {
		c.Getenv = os.Getenv
	}
	return c
}
func (c Console) emit(value any) error {
	e := json.NewEncoder(c.Out)
	e.SetIndent("", "  ")
	return e.Encode(value)
}
func (c Console) hidden(label string, stdin bool) (string, error) {
	if stdin {
		raw, e := io.ReadAll(io.LimitReader(c.In, 8193))
		if e != nil || len(raw) > 8192 {
			return "", errors.New("secret input is too long")
		}
		value := strings.TrimSuffix(strings.TrimSuffix(string(raw), "\n"), "\r")
		if strings.ContainsAny(value, "\r\n\x00") {
			return "", errors.New("secret must occupy one line")
		}
		return value, nil
	}
	f, ok := c.In.(*os.File)
	if !ok || !term.IsTerminal(int(f.Fd())) {
		return "", errors.New("interactive secret input requires a terminal; use --password-stdin or --dsn-stdin for automation")
	}
	fmt.Fprint(c.Err, label)
	raw, e := term.ReadPassword(int(f.Fd()))
	fmt.Fprintln(c.Err)
	return string(raw), e
}
func (c Console) confirm(label string, yes bool) error {
	if yes {
		return nil
	}
	fmt.Fprint(c.Err, label+" [y/N]: ")
	line, e := bufio.NewReader(c.In).ReadString('\n')
	if e != nil || strings.ToLower(strings.TrimSpace(line)) != "y" {
		return errors.New("cancelled")
	}
	return nil
}

// Run handles only management commands; callers keep foreground startup unchanged.
func Run(ctx context.Context, args []string, console Console) error {
	c := console.defaults()
	if len(args) == 0 {
		return errors.New("management command is required")
	}
	command := args[0]
	args = args[1:]
	if command == "manage" || command == "menu" {
		return menu(ctx, args, c)
	}
	if command == "service" || command == "admin" || command == "database" || command == "sessions" || command == "maintenance" || command == "site" || command == "config" {
		if len(args) == 0 {
			return errors.New("a subcommand is required; use help")
		}
		command += " " + args[0]
		args = args[1:]
	}
	o := options{}
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(c.Out)
	fs.StringVar(&o.config, "config", "", "startup YAML/JSON configuration")
	fs.StringVar(&o.data, "data-dir", "", "override instance directory; otherwise use configuration/service/default ./data")
	fs.StringVar(&o.listen, "listen", "", "HTTP listen address for service installation")
	fs.StringVar(&o.name, "name", buildinfo.CLIRootCommand, "systemd service name")
	fs.BoolVar(&o.user, "user", false, "use per-user systemd service")
	fs.BoolVar(&o.json, "json", false, "structured output (instance operations always return JSON)")
	fs.BoolVar(&o.yes, "yes", false, "confirm a database connection or URL change")
	fs.BoolVar(&o.passwordStdin, "password-stdin", false, "read new password from stdin")
	fs.BoolVar(&o.dsnStdin, "dsn-stdin", false, "read candidate database DSN from stdin")
	fs.StringVar(&o.username, "username", "", "exact account username; one administrator is selected automatically")
	fs.StringVar(&o.realm, "realm", "administrator", "legacy workspace alias (administrator/user); account sessions are shared")
	fs.BoolVar(&o.all, "all", false, "revoke every account session in the shared store")
	fs.StringVar(&o.path, "path", "", "new administrator path, e.g. /manage")
	fs.StringVar(&o.url, "url", "", "new external HTTP(S) origin")
	fs.StringVar(&o.message, "message", "", "maintenance message")
	fs.StringVar(&o.runAs, "run-as", "", "system service account (default sudo caller, otherwise dedicated unicore account)")
	fs.StringVar(&o.envFile, "env-file", "", "optional existing systemd EnvironmentFile; secrets are never copied from the shell")
	fs.BoolVar(&o.link, "link", true, "create a command symlink in /usr/local/bin or ~/.local/bin")
	fs.BoolVar(&o.now, "now", true, "start after installing the service")
	fs.BoolVar(&o.enable, "enable", true, "enable installed service at boot/login")
	fs.BoolVar(&o.dryRun, "dry-run", false, "print systemd unit without installing")
	fs.BoolVar(&o.follow, "follow", false, "follow service logs")
	fs.IntVar(&o.lines, "lines", 100, "number of journal lines")
	if e := fs.Parse(args); e != nil {
		if errors.Is(e, flag.ErrHelp) {
			return nil
		}
		return e
	}
	if fs.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	if !validServiceName(o.name) {
		return errors.New("invalid service name")
	}
	if command != "service install" && command != "service uninstall" && o.config == "" && o.data == "" && c.Getenv("APP_CONFIG") == "" && c.Getenv("APP_DATA_DIR") == "" {
		var err error
		c, err = boundEnvironment(o, c)
		if err != nil {
			return err
		}
	}
	switch command {
	case "start", "stop", "restart", "reload", "logs", "service status", "service enable", "service disable", "service uninstall":
		return serviceAction(ctx, command, o, c)
	case "service install":
		return installService(ctx, o, c)
	case "config check", "config show":
		web, source, e := resolve(o, c)
		if e != nil {
			return e
		}
		return c.emit(map[string]any{"status": "ok", "configuration": source, "effective": webFile(web)})
	case "status", "doctor", "database check", "database configure", "admin list", "admin reset-password", "admin path", "admin set-path", "sessions revoke", "maintenance on", "maintenance off", "site set-url":
		return instanceCommand(ctx, command, o, c)
	default:
		return errors.New("unknown management command; use help")
	}
}
func resolve(o options, c Console) (config.Web, string, error) {
	args := []string{}
	source := "flags / APP_* / defaults"
	if c.Getenv("APP_CONFIG") != "" {
		source = c.Getenv("APP_CONFIG")
	}
	if o.config != "" {
		args = append(args, "--config", o.config)
		source = o.config
	} else if c.Getenv("APP_CONFIG") == "" && o.data == "" && c.Getenv("APP_DATA_DIR") == "" {
		record, err := readService(o, c)
		if err == nil {
			args = append(args, "--config", record.Config)
			source = record.Config
		} else if !errors.Is(err, os.ErrNotExist) {
			return config.Web{}, "", err
		}
	}
	if o.data != "" {
		args = append(args, "--data-dir", o.data)
	}
	if o.listen != "" {
		args = append(args, "--listen", o.listen)
	}
	web, e := config.LoadWeb(args, c.Getenv)
	if e != nil {
		return web, source, e
	}
	if !filepath.IsAbs(web.DataDir) && c.directory != "" {
		web.DataDir = filepath.Join(c.directory, web.DataDir)
	}
	web.DataDir, e = filepath.Abs(web.DataDir)
	return web, source, e
}
func webFile(w config.Web) config.File {
	return config.File{Listen: w.Listen, Profile: w.Profile, DataDir: w.DataDir, Deployment: w.Deployment, LogLevel: w.Log.Level, LogFormat: w.Log.Format, MonitorListen: w.MonitorListen, ShutdownTimeout: w.ShutdownTimeout.String(), ReadinessTimeout: w.ReadinessTimeout.String(), APIDocs: w.APIDocs}
}
