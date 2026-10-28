// Author: yunnuo <ymz@ebox.vip>
// Description: Prepare signed updates outside the installation, then hand off to an isolated helper.
package updateinstall

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/updatechannel"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updates"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Options struct {
	DataDir, InstallDir, Deployment, Version, RestartMode, Executable string
	Args                                                              []string
	Target                                                            func() updates.Target
	Trust                                                             updates.Trust
	Provider                                                          updates.Provider
	Shutdown                                                          func()
}
type Installer struct {
	Options
	mu             sync.Mutex
	reason         string
	Root, StateDir string
}
type Plan struct {
	ID                 string          `json:"id"`
	Root               string          `json:"root"`
	DataDir            string          `json:"data_dir"`
	Stage              string          `json:"stage"`
	NewRoot            string          `json:"new_root"`
	Executable         string          `json:"executable"`
	RelativeExecutable string          `json:"relative_executable"`
	Args               []string        `json:"args"`
	Directory          string          `json:"directory"`
	RestartMode        string          `json:"restart_mode"`
	OldVersion         string          `json:"old_version"`
	Target             updates.Target  `json:"target"`
	Payload            updates.Payload `json:"payload"`
	Nonce              string          `json:"nonce"`
}

func New(options Options) *Installer {
	i := &Installer{Options: options}
	var err error
	i.DataDir, err = canonicalDirectory(options.DataDir)
	if err != nil {
		i.reason = "无法解析实例数据目录，更新安装已禁用"
		return i
	}
	i.StateDir = filepath.Join(i.DataDir, "updates")
	if i.Executable == "" {
		i.Executable, _ = os.Executable()
	}
	i.Executable, _ = filepath.EvalSymlinks(i.Executable)
	if options.Deployment == "docker" {
		i.reason = "容器由宿主机替换镜像，应用内不覆盖容器程序"
		return i
	}
	if options.Target().Profile == "desktop" {
		i.Root = filepath.Dir(i.Executable)
		if runtime.GOOS == "darwin" {
			for directory := i.Root; directory != filepath.Dir(directory); directory = filepath.Dir(directory) {
				if strings.HasSuffix(directory, ".app") {
					i.Root = directory
					break
				}
			}
			if !strings.HasSuffix(i.Root, ".app") {
				i.reason = "请从正式解压的应用包运行系统更新"
			}
		}
	} else {
		if options.InstallDir == "" || options.Deployment != "tar" {
			i.reason = "此运行方式支持检查更新；Tar 自动安装需配置 APP_UPDATE_INSTALL_DIR"
			return i
		}
		i.Root = options.InstallDir
	}
	i.Root, _ = filepath.Abs(i.Root)
	i.Root, _ = filepath.EvalSymlinks(i.Root)
	if i.Root == "" || i.Root == filepath.Dir(i.Root) || !within(i.Root, i.Executable) || within(i.Root, i.DataDir) || within(i.DataDir, i.Root) {
		i.reason = "安装目录必须明确，实例数据必须保存在安装目录之外"
		return i
	}
	if runtime.GOOS != "darwin" || options.Target().Profile != "desktop" {
		data, e := os.ReadFile(filepath.Join(i.Root, "VERSION"))
		if e != nil || strings.TrimSpace(string(data)) != options.Version {
			i.reason = "安装目录缺少匹配的发行版本文件，请使用完整发行包"
			return i
		}
	}
	if os.Getenv("INVOCATION_ID") != "" && options.RestartMode != "supervisor" {
		i.reason = "systemd 更新需要启用 supervisor 重启配置"
		return i
	}
	probe, e := os.CreateTemp(filepath.Dir(i.Root), ".unicore-update-probe-")
	if e != nil {
		i.reason = "安装目录不可写，请调整安装权限或手动更新"
		return i
	}
	name := probe.Name()
	_ = probe.Close()
	_ = os.Remove(name)
	return i
}

func canonicalDirectory(directory string) (string, error) {
	if directory == "" {
		return "", errors.New("instance data directory is required")
	}
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if os.IsNotExist(err) {
		if _, statErr := os.Lstat(absolute); statErr == nil {
			return "", err
		}
		parent := filepath.Dir(absolute)
		if parent == absolute {
			return "", err
		}
		resolved, err = canonicalDirectory(parent)
		if err == nil {
			resolved = filepath.Join(resolved, filepath.Base(absolute))
		}
	}
	return resolved, err
}
func within(parent, child string) bool {
	relative, e := filepath.Rel(parent, child)
	return e == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
func (i *Installer) Readiness() string { return i.reason }
func (i *Installer) Job() contracts.UpdateJob {
	if i.StateDir == "" {
		return contracts.UpdateJob{Status: "idle"}
	}
	var job contracts.UpdateJob
	data, e := os.ReadFile(filepath.Join(i.StateDir, "state.json"))
	if e == nil {
		_ = json.Unmarshal(data, &job)
	}
	if job.Status == "" {
		job.Status = "idle"
	}
	return job
}
func (i *Installer) write(job contracts.UpdateJob) error {
	if i.StateDir == "" {
		return updates.ErrUnavailable
	}
	data, e := json.Marshal(job)
	if e != nil {
		return e
	}
	return updatechannel.Atomic(filepath.Join(i.StateDir, "state.json"), data)
}
func (i *Installer) progress(job contracts.UpdateJob, status, message string, n int) contracts.UpdateJob {
	job.Status = status
	job.Message = message
	job.Progress = n
	_ = i.write(job)
	return job
}
func busy(s string) bool {
	return s == "downloading" || s == "preparing" || s == "restarting" || s == "swapping" || s == "awaiting_health" || s == "rolling_back"
}
func (i *Installer) Start(payload updates.Payload) (contracts.UpdateJob, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.reason != "" {
		return contracts.UpdateJob{}, updates.ErrRejected
	}
	if e := os.MkdirAll(i.StateDir, 0700); e != nil {
		return contracts.UpdateJob{}, e
	}
	lock := flock.New(filepath.Join(i.StateDir, "prepare.lock"))
	locked, e := lock.TryLock()
	if e != nil || !locked {
		return contracts.UpdateJob{}, updates.ErrBusy
	}
	if busy(i.Job().Status) {
		_ = lock.Unlock()
		return contracts.UpdateJob{}, updates.ErrBusy
	}
	if e := updates.VerifyPayload(payload, i.Trust, i.Version, i.Target(), time.Now()); e != nil {
		_ = lock.Unlock()
		return contracts.UpdateJob{}, e
	}
	random := make([]byte, 16)
	if _, e = rand.Read(random); e != nil {
		_ = lock.Unlock()
		return contracts.UpdateJob{}, e
	}
	id := hex.EncodeToString(random)
	job := contracts.UpdateJob{ID: id, Version: payload.Version, Status: "downloading", Message: "正在下载并验证更新包", StartedAt: time.Now().UTC().Format(time.RFC3339)}
	if e = i.write(job); e != nil {
		_ = lock.Unlock()
		return contracts.UpdateJob{}, e
	}
	go func() {
		defer lock.Unlock()
		if e := i.prepare(job, payload); e != nil {
			job.Status = "failed"
			job.Message = "更新准备失败，当前程序和数据未改变，请检查网络、签名与安装权限"
			job.FinishedAt = time.Now().UTC().Format(time.RFC3339)
			_ = i.write(job)
		}
	}()
	return job, nil
}
func (i *Installer) prepare(job contracts.UpdateJob, payload updates.Payload) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	directory := filepath.Join(i.StateDir, "jobs", job.ID)
	if e := os.MkdirAll(directory, 0700); e != nil {
		return e
	}
	archivePath := filepath.Join(directory, "release.tar.gz")
	file, e := os.OpenFile(archivePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	hash := sha256.New()
	last := int64(-1)
	e = i.Provider.Download(ctx, payload.URL, io.MultiWriter(file, hash), payload.Artifact.Size, func(n int64) {
		percent := n * 70 / payload.Artifact.Size
		if percent != last {
			last = percent
			i.progress(job, "downloading", "正在下载并验证更新包", int(percent))
		}
	})
	closeErr := file.Close()
	if e != nil {
		return e
	}
	if closeErr != nil {
		return closeErr
	}
	if hex.EncodeToString(hash.Sum(nil)) != payload.Artifact.SHA256 {
		return updates.ErrRejected
	}
	job = i.progress(job, "preparing", "签名与摘要通过，正在准备重启", 75)
	if e = i.write(job); e != nil {
		return e
	}
	stage, e := os.MkdirTemp(filepath.Dir(i.Root), ".unicore-update-"+job.ID+"-")
	if e != nil {
		return e
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.RemoveAll(stage)
		}
	}()
	root, e := Extract(archivePath, stage, payload)
	if e != nil {
		return e
	}
	relative, e := filepath.Rel(i.Root, i.Executable)
	if e != nil || !within(i.Root, i.Executable) {
		return updates.ErrRejected
	}
	newRoot := root
	if i.Target().Profile == "desktop" && runtime.GOOS == "darwin" {
		entries, e := os.ReadDir(root)
		if e != nil {
			return e
		}
		newRoot = ""
		for _, entry := range entries {
			if entry.IsDir() && strings.HasSuffix(entry.Name(), ".app") {
				if newRoot != "" {
					return updates.ErrRejected
				}
				newRoot = filepath.Join(root, entry.Name())
			}
		}
		if newRoot == "" {
			return updates.ErrRejected
		}
	}
	if _, e = os.Stat(filepath.Join(newRoot, relative)); e != nil {
		return e
	}
	nonce := make([]byte, 24)
	if _, e = rand.Read(nonce); e != nil {
		return e
	}
	cwd, e := os.Getwd()
	if e != nil {
		return e
	}
	if within(i.Root, cwd) {
		cwd = filepath.Dir(i.Root)
	}
	plan := Plan{ID: job.ID, Root: i.Root, DataDir: i.DataDir, Stage: stage, NewRoot: newRoot, Executable: i.Executable, RelativeExecutable: relative, Args: i.Args, Directory: cwd, RestartMode: i.RestartMode, OldVersion: i.Version, Target: i.Target(), Payload: payload, Nonce: hex.EncodeToString(nonce)}
	raw, _ := json.Marshal(plan)
	if e = updatechannel.Atomic(filepath.Join(directory, "plan.json"), raw); e != nil {
		return e
	}
	helper := filepath.Join(directory, "helper")
	if runtime.GOOS == "windows" {
		helper += ".exe"
	}
	if e = copyFile(i.Executable, helper, 0700); e != nil {
		return e
	}
	command := exec.Command(helper, "--internal-apply-update", filepath.Join(directory, "plan.json"))
	command.Dir = directory
	command.Env = os.Environ()
	detach(command)
	if e = command.Start(); e != nil {
		return e
	}
	_ = command.Process.Release()
	for deadline := time.Now().Add(8 * time.Second); time.Now().Before(deadline); time.Sleep(100 * time.Millisecond) {
		if _, e = os.Stat(filepath.Join(directory, "helper.ready")); e == nil {
			keep = true
			job = i.progress(job, "restarting", "更新包已就绪，正在重启并等待启动确认", 85)
			if e = i.write(job); e != nil {
				return e
			}
			i.Shutdown()
			return nil
		}
	}
	return errors.New("update helper unavailable")
}
func copyFile(source, destination string, mode os.FileMode) error {
	in, e := os.Open(source)
	if e != nil {
		return e
	}
	defer in.Close()
	out, e := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if e != nil {
		return e
	}
	_, e = io.Copy(out, in)
	if e == nil {
		e = out.Sync()
	}
	closeErr := out.Close()
	if e != nil {
		return e
	}
	return closeErr
}

// Extract accepts only regular files/directories inside one root; links and archive bombs are rejected.
func Extract(archivePath, destination string, payload updates.Payload) (string, error) {
	file, e := os.Open(archivePath)
	if e != nil {
		return "", e
	}
	defer file.Close()
	gzipReader, e := gzip.NewReader(file)
	if e != nil {
		return "", e
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	root := ""
	seen := map[string]bool{}
	var total int64
	count := 0
	for {
		header, e := reader.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return "", e
		}
		count++
		name := strings.TrimSuffix(header.Name, "/")
		if count > 20000 || name == "" || path.IsAbs(name) || strings.Contains(name, "\\") || strings.Contains(name, ":") || path.Clean(name) != name || strings.Contains(name, "\x00") {
			return "", updates.ErrRejected
		}
		parts := strings.Split(name, "/")
		for _, part := range parts {
			if part == ".." || part == "." || strings.HasPrefix(part, "._") {
				return "", updates.ErrRejected
			}
		}
		if root == "" {
			root = parts[0]
		}
		if parts[0] != root || seen[name] {
			return "", updates.ErrRejected
		}
		seen[name] = true
		output := filepath.Join(destination, filepath.FromSlash(name))
		if !within(destination, output) {
			return "", updates.ErrRejected
		}
		if header.Typeflag == tar.TypeDir {
			if e = os.MkdirAll(output, 0755); e != nil {
				return "", e
			}
			continue
		}
		if header.Typeflag != tar.TypeReg || header.Size < 0 || header.Size > 256*1024*1024 {
			return "", updates.ErrRejected
		}
		total += header.Size
		if total > 1024*1024*1024 {
			return "", updates.ErrRejected
		}
		if e = os.MkdirAll(filepath.Dir(output), 0755); e != nil {
			return "", e
		}
		mode := os.FileMode(0644)
		if header.Mode&0111 != 0 {
			mode = 0755
		}
		f, e := os.OpenFile(output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if e != nil {
			return "", e
		}
		_, e = io.CopyN(f, reader, header.Size)
		closeErr := f.Close()
		if e != nil {
			return "", e
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	if root == "" {
		return "", updates.ErrRejected
	}
	directory := filepath.Join(destination, root)
	version, e := os.ReadFile(filepath.Join(directory, "VERSION"))
	if e != nil || strings.TrimSpace(string(version)) != payload.Version {
		return "", updates.ErrRejected
	}
	var metadata struct {
		Version, Profile, OS, Arch, Commit string
		Migration                          int                             `json:"migration_level"`
		BusinessMigration                  int                             `json:"business_migration_level"`
		Features                           struct{ License, Updater bool } `json:"features"`
	}
	raw, e := os.ReadFile(filepath.Join(directory, "manifest.json"))
	if e != nil || json.Unmarshal(raw, &metadata) != nil || metadata.Version != payload.Version || metadata.Profile != payload.Artifact.Profile || metadata.OS != payload.Artifact.OS || metadata.Arch != payload.Artifact.Arch || !strings.HasPrefix(payload.Commit, metadata.Commit) || len(metadata.Commit) < 7 || metadata.Migration != payload.Artifact.Migration || metadata.BusinessMigration != payload.Artifact.BusinessMigration || metadata.Features.License != payload.Artifact.License || metadata.Features.Updater != payload.Artifact.Updater {
		return "", updates.ErrRejected
	}
	return directory, nil
}
