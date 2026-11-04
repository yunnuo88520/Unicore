// Author: yunnuo <ymz@ebox.vip>
// Description: Linux systemd supervision and discoverable instance bindings; no shell or container socket.
package webmanage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"

	"github.com/yunnuo/unicore/internal/buildinfo"
	"go.yaml.in/yaml/v3"
)

const unitMarker = "# Managed by Unicore Web service manager v1"

var servicePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func validServiceName(name string) bool { return servicePattern.MatchString(name) }

type serviceRecord struct {
	Name            string `json:"name"`
	Executable      string `json:"executable"`
	Config          string `json:"config"`
	Directory       string `json:"working_directory"`
	RunAs           string `json:"run_as"`
	Link            string `json:"command_link,omitempty"`
	EnvironmentFile string `json:"environment_file,omitempty"`
}

func servicePaths(o options, c Console) (unit, record, configuration string) {
	base := "/etc/" + buildinfo.CLIRootCommand + "/services"
	units := "/etc/systemd/system"
	if o.user {
		home := c.Getenv("XDG_CONFIG_HOME")
		if home == "" {
			home = filepath.Join(c.Getenv("HOME"), ".config")
		}
		base = filepath.Join(home, buildinfo.CLIRootCommand, "services")
		units = filepath.Join(home, "systemd", "user")
	}
	return filepath.Join(units, o.name+".service"), filepath.Join(base, o.name+".json"), filepath.Join(base, o.name+".yaml")
}
func readService(o options, c Console) (serviceRecord, error) {
	_, path, _ := servicePaths(o, c)
	raw, e := os.ReadFile(path)
	if e != nil {
		return serviceRecord{}, e
	}
	var record serviceRecord
	if json.Unmarshal(raw, &record) != nil || record.Name != o.name || !filepath.IsAbs(record.Config) {
		return record, errors.New("invalid service binding")
	}
	return record, nil
}
func unitQuote(value string) (string, error) {
	if strings.ContainsAny(value, "\r\n\x00") {
		return "", errors.New("service paths cannot contain control characters")
	}
	return strconv.Quote(strings.ReplaceAll(value, "%", "%%")), nil
}
func renderUnit(r serviceRecord, userMode bool) (string, error) {
	exe, e := unitQuote(r.Executable)
	if e != nil {
		return "", e
	}
	cfg, e := unitQuote(r.Config)
	if e != nil {
		return "", e
	}
	work, e := unitQuote(r.Directory)
	if e != nil {
		return "", e
	}
	// WorkingDirectory is parsed as a path, unlike the quoted argv in ExecStart.
	if strings.TrimSpace(r.Directory) != r.Directory {
		return "", errors.New("working directory cannot have surrounding whitespace")
	}
	work = strings.ReplaceAll(r.Directory, "%", "%%")
	var out strings.Builder
	fmt.Fprintf(&out, "%s\n[Unit]\nDescription=%s Web service\nAfter=network.target\nStartLimitIntervalSec=60\nStartLimitBurst=5\n\n[Service]\nType=simple\nWorkingDirectory=%s\nExecStart=%s serve --config %s\nRestart=always\nRestartSec=3\nKillMode=process\nTimeoutStopSec=135\nNoNewPrivileges=true\nEnvironment=APP_UPDATE_RESTART=supervisor\n", unitMarker, buildinfo.CLIRootCommand, work, strings.ReplaceAll(exe, "$", "$$"), strings.ReplaceAll(cfg, "$", "$$"))
	if !userMode {
		if !servicePattern.MatchString(r.RunAs) {
			return "", errors.New("invalid service account")
		}
		fmt.Fprintf(&out, "User=%s\n", r.RunAs)
	}
	if r.EnvironmentFile != "" {
		_, e := unitQuote(r.EnvironmentFile)
		if e != nil {
			return "", e
		}
		if strings.TrimSpace(r.EnvironmentFile) != r.EnvironmentFile {
			return "", errors.New("environment file cannot have surrounding whitespace")
		}
		// Like WorkingDirectory, systemd parses this directive as a literal path.
		fmt.Fprintf(&out, "EnvironmentFile=%s\n", strings.ReplaceAll(r.EnvironmentFile, "%", "%%"))
	}
	target := "multi-user.target"
	if userMode {
		target = "default.target"
	}
	fmt.Fprintf(&out, "\n[Install]\nWantedBy=%s\n", target)
	return out.String(), nil
}
func serviceAvailable(c Console) error {
	if runtime.GOOS != "linux" {
		return errors.New("service management requires Linux/systemd; use foreground startup on this OS")
	}
	if c.Getenv("APP_DEPLOYMENT_KIND") == "docker" {
		return errors.New("manage Docker services on the host with docker/compose; no systemd is installed inside the container")
	}
	if _, e := exec.LookPath("systemctl"); e != nil {
		return errors.New("systemctl is not installed; use foreground startup or install systemd on the host")
	}
	return nil
}
func process(ctx context.Context, c Console, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdin = c.In
	cmd.Stdout = c.Out
	cmd.Stderr = c.Err
	if e := cmd.Run(); e != nil {
		return fmt.Errorf("%s failed; inspect permissions, service state and logs", name)
	}
	return nil
}
func systemctl(ctx context.Context, o options, c Console, args ...string) error {
	if e := serviceAvailable(c); e != nil {
		return e
	}
	if o.user {
		args = append([]string{"--user"}, args...)
	}
	return process(ctx, c, "systemctl", args...)
}
func serviceAction(ctx context.Context, command string, o options, c Console) error {
	if e := serviceAvailable(c); e != nil {
		return e
	}
	if command == "service uninstall" {
		return uninstallService(ctx, o, c)
	}
	if command == "logs" {
		if o.lines < 1 || o.lines > 10000 {
			return errors.New("lines must be between 1 and 10000")
		}
		args := []string{"--no-pager", "-u", o.name + ".service", "-n", strconv.Itoa(o.lines)}
		if o.user {
			args = append(args, "--user")
		}
		if o.follow {
			args = append(args, "-f")
		}
		return process(ctx, c, "journalctl", args...)
	}
	action := strings.TrimPrefix(command, "service ")
	if action == "status" && o.json {
		var output strings.Builder
		capture := c
		capture.Out = &output
		if e := systemctl(ctx, o, capture, "show", o.name+".service", "--property=LoadState,ActiveState,SubState,UnitFileState,MainPID"); e != nil {
			return e
		}
		result := map[string]string{"service": o.name}
		for _, line := range strings.Split(output.String(), "\n") {
			key, value, ok := strings.Cut(line, "=")
			if ok {
				result[key] = value
			}
		}
		return c.emit(result)
	}
	return systemctl(ctx, o, c, action, o.name+".service", "--no-pager")
}
func installService(ctx context.Context, o options, c Console) error {
	if e := serviceAvailable(c); e != nil {
		return e
	}
	if !o.user && os.Geteuid() != 0 && !o.dryRun {
		return errors.New("system service installation requires root; use sudo or --user")
	}
	if o.envFile != "" {
		raw, e := os.ReadFile(o.envFile)
		if e != nil {
			return e
		}
		if len(raw) > 65536 {
			return errors.New("environment file is too large")
		}
		values, e := parseEnvironment(string(raw))
		if e != nil {
			return e
		}
		for _, key := range []string{"APP_CONFIG", "APP_LISTEN", "APP_DATA_DIR", "APP_PROFILE", "APP_DEPLOYMENT_KIND", "APP_LOG_LEVEL", "APP_LOG_FORMAT", "APP_MONITOR_LISTEN", "APP_SHUTDOWN_TIMEOUT", "APP_READINESS_TIMEOUT", "APP_API_DOCS"} {
			if _, ok := values[key]; ok {
				return errors.New("put startup options in --config or service install flags, not --env-file")
			}
		}
		if key := c.Getenv("APP_SECRET_KEY"); key != "" && values["APP_SECRET_KEY"] != key {
			return errors.New("service EnvironmentFile must contain the same APP_SECRET_KEY as the existing instance")
		}
	}
	web, _, e := resolve(o, c)
	if e != nil {
		return e
	}
	if web.Deployment == "docker" {
		return errors.New("Docker uses its host restart policy; refusing to install systemd")
	}
	web.Deployment = "tar"
	work, e := os.Getwd()
	if e != nil {
		return e
	}
	executable := c.Executable
	if executable == "" {
		executable, e = os.Executable()
		if e != nil {
			return e
		}
	}
	executable, e = filepath.Abs(executable)
	if e != nil {
		return e
	}
	if e = regularExecutable(executable); e != nil {
		return e
	}
	unit, binding, cfg := servicePaths(o, c)
	r := serviceRecord{Name: o.name, Executable: executable, Config: cfg, Directory: work, RunAs: o.runAs}
	if !o.user && r.RunAs == "" {
		r.RunAs = c.Getenv("SUDO_USER")
		if r.RunAs == "" || r.RunAs == "root" {
			r.RunAs = buildinfo.CLIRootCommand
		}
	}
	if o.envFile != "" {
		r.EnvironmentFile, e = filepath.Abs(o.envFile)
		if e != nil {
			return e
		}
		if e = regular(r.EnvironmentFile); e != nil {
			return e
		}
	}
	if c.Getenv("APP_SECRET_KEY") != "" && r.EnvironmentFile == "" {
		return errors.New("APP_SECRET_KEY is set: supply --env-file with the same external key; shell secrets are never copied into a unit")
	}
	if o.link {
		root := "/usr/local/bin"
		if o.user {
			root = filepath.Join(c.Getenv("HOME"), ".local", "bin")
		}
		r.Link = filepath.Join(root, buildinfo.CLIRootCommand)
	}
	rendered, e := renderUnit(r, o.user)
	if e != nil {
		return e
	}
	if o.dryRun {
		_, e = io.WriteString(c.Out, rendered)
		return e
	}
	for _, p := range []string{unit, binding, cfg} {
		if _, err := os.Lstat(p); !errors.Is(err, os.ErrNotExist) {
			return errors.New("service/configuration already exists; inspect it before installing")
		}
	}
	if r.Link != "" {
		if _, err := os.Lstat(r.Link); err == nil {
			existing, err := os.Readlink(r.Link)
			if err != nil || existing != executable {
				return errors.New("command path already exists; use --link=false or resolve the conflict")
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if !o.user {
		account, err := user.Lookup(r.RunAs)
		if err != nil {
			if r.RunAs != buildinfo.CLIRootCommand {
				return errors.New("--run-as account does not exist")
			}
			if e = process(ctx, c, "useradd", "--system", "--user-group", "--no-create-home", "--shell", "/usr/sbin/nologin", r.RunAs); e != nil {
				return e
			}
			account, e = user.Lookup(r.RunAs)
			if e != nil {
				return e
			}
		}
		uid, e := strconv.Atoi(account.Uid)
		if e != nil {
			return e
		}
		gid, e := strconv.Atoi(account.Gid)
		if e != nil {
			return e
		}
		if _, err := os.Stat(web.DataDir); errors.Is(err, os.ErrNotExist) {
			if e = os.MkdirAll(web.DataDir, 0700); e != nil {
				return e
			}
			if e = os.Chown(web.DataDir, uid, gid); e != nil {
				return e
			}
		}
		for _, path := range []string{executable, work} {
			if e = process(ctx, c, "runuser", "-u", r.RunAs, "--", "test", "-x", path); e != nil {
				return errors.New("service account cannot access the program/working directory; move it to an accessible installation directory or select --run-as")
			}
		}
		// Never recursively change ownership of an existing user-selected directory.
		if e = process(ctx, c, "runuser", "-u", r.RunAs, "--", "test", "-w", web.DataDir); e != nil {
			return errors.New("service account cannot write data_dir; select its owner with --run-as or fix permissions explicitly")
		}
	} else {
		if e = os.MkdirAll(web.DataDir, 0700); e != nil {
			return e
		}
	}
	for _, p := range []string{filepath.Dir(unit), filepath.Dir(binding)} {
		if e = os.MkdirAll(p, 0755); e != nil {
			return e
		}
	}
	configuration, e := yaml.Marshal(webFile(web))
	if e != nil {
		return e
	}
	metadata, e := json.MarshalIndent(r, "", "  ")
	if e != nil {
		return e
	}
	created := []string{}
	complete := false
	defer func() {
		if !complete {
			for _, p := range created {
				_ = os.Remove(p)
			}
		}
	}()
	for _, f := range []struct {
		path string
		data []byte
	}{{cfg, configuration}, {binding, append(metadata, '\n')}, {unit, []byte(rendered)}} {
		file, e := os.OpenFile(f.path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
		if e != nil {
			return e
		}
		created = append(created, f.path)
		if e = file.Chmod(0644); e != nil {
			_ = file.Close()
			return e
		}
		_, e = file.Write(f.data)
		e = errors.Join(e, file.Close())
		if e != nil {
			return e
		}
	}
	if r.Link != "" {
		if _, err := os.Lstat(r.Link); errors.Is(err, os.ErrNotExist) {
			if e = os.MkdirAll(filepath.Dir(r.Link), 0755); e != nil {
				return e
			}
			if e = os.Symlink(executable, r.Link); e != nil {
				return e
			}
			created = append(created, r.Link)
		}
	}
	if e = systemctl(ctx, o, c, "daemon-reload"); e != nil {
		return e
	}
	complete = true
	if o.enable {
		if e = systemctl(ctx, o, c, "enable", o.name+".service"); e != nil {
			return e
		}
	}
	if o.now {
		if e = systemctl(ctx, o, c, "start", o.name+".service"); e != nil {
			return e
		}
	}
	return c.emit(map[string]any{"status": "ok", "service": o.name, "unit": unit, "configuration": cfg, "data_dir": web.DataDir, "command_link": r.Link, "enabled": o.enable, "started": o.now, "user_mode": o.user})
}
func regularExecutable(path string) error {
	info, e := os.Stat(path)
	if e != nil {
		return e
	}
	if !info.Mode().IsRegular() || info.Mode()&0111 == 0 {
		return errors.New("service executable must be an existing executable file")
	}
	return nil
}
func uninstallService(ctx context.Context, o options, c Console) error {
	r, e := readService(o, c)
	if e != nil {
		return e
	}
	unit, binding, cfg := servicePaths(o, c)
	raw, e := os.ReadFile(unit)
	if e != nil || !strings.HasPrefix(string(raw), unitMarker+"\n") {
		return errors.New("refusing to remove a service not created by this manager")
	}
	if e = systemctl(ctx, o, c, "disable", "--now", o.name+".service"); e != nil {
		return e
	}
	for _, p := range []string{unit, binding, cfg} {
		if e = os.Remove(p); e != nil {
			return e
		}
	}
	if r.Link != "" {
		target, e := os.Readlink(r.Link)
		if e == nil && target == r.Executable {
			if e = os.Remove(r.Link); e != nil {
				return e
			}
		}
	}
	if e = systemctl(ctx, o, c, "daemon-reload"); e != nil {
		return e
	}
	return c.emit(map[string]any{"status": "ok", "service_removed": o.name, "user_data": "preserved"})
}
