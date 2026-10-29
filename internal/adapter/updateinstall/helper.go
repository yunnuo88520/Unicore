// Author: yunnuo <ymz@ebox.vip>
// Description: Detached, signature-verifying installation transaction with startup acknowledgement and rollback.
package updateinstall

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/adapter/updatechannel"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updates"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var jobID = regexp.MustCompile(`^[a-f0-9]{32}$`)

func loadPlan(path string, trust updates.Trust, helperVersion string) (Plan, error) {
	var p Plan
	raw, e := os.ReadFile(path)
	if e != nil || len(raw) > 512*1024 || json.Unmarshal(raw, &p) != nil {
		return p, updates.ErrRejected
	}
	if !jobID.MatchString(p.ID) || p.OldVersion != helperVersion || p.Target.OS != runtime.GOOS || p.Target.Arch != runtime.GOARCH || p.Nonce == "" || !filepath.IsAbs(p.Root) || !filepath.IsAbs(p.DataDir) || !filepath.IsAbs(p.Stage) || filepath.Dir(p.Stage) != filepath.Dir(p.Root) || !strings.HasPrefix(filepath.Base(p.Stage), ".unicore-update-"+p.ID+"-") || !within(p.Stage, p.NewRoot) || within(p.Root, p.DataDir) || within(p.DataDir, p.Root) || p.Root == filepath.Dir(p.Root) {
		return p, updates.ErrRejected
	}
	expected := filepath.Join(p.DataDir, "updates", "jobs", p.ID, "plan.json")
	resolved, e := filepath.Abs(path)
	if e != nil || resolved != expected {
		return p, updates.ErrRejected
	}
	if !within(p.Root, p.Executable) || filepath.Join(p.Root, p.RelativeExecutable) != p.Executable || p.RelativeExecutable == "." || filepath.IsAbs(p.RelativeExecutable) {
		return p, updates.ErrRejected
	}
	for _, directory := range []string{p.Root, p.Stage, filepath.Dir(path)} {
		info, e := os.Lstat(directory)
		if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return p, updates.ErrRejected
		}
	}
	if e = updates.VerifyPayload(p.Payload, trust, p.OldVersion, p.Target, time.Now()); e != nil {
		return p, e
	}
	return p, nil
}
func fileHash(path string) (string, error) {
	f, e := os.Open(path)
	if e != nil {
		return "", e
	}
	defer f.Close()
	hash := sha256.New()
	_, e = io.Copy(hash, f)
	return hex.EncodeToString(hash.Sum(nil)), e
}
func lockInstance(p Plan) (*flock.Flock, error) {
	lock := flock.New(filepath.Join(p.DataDir, "instance.lock"))
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	ok, e := lock.TryLockContext(ctx, 100*time.Millisecond)
	if e != nil || !ok {
		return nil, updates.ErrBusy
	}
	return lock, nil
}
func planInstaller(p Plan) *Installer {
	return &Installer{Options: Options{DataDir: p.DataDir}, Root: p.Root, StateDir: filepath.Join(p.DataDir, "updates")}
}
func writeJob(i *Installer, job contracts.UpdateJob, status, message string) contracts.UpdateJob {
	job.Status = status
	job.Message = message
	if status == "completed" || status == "rolled_back" || status == "failed" {
		job.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_ = i.write(job)
	return job
}

// RunHelper is only invoked before normal server/Wails initialization by a private copied executable.
func RunHelper(path string, trust updates.Trust, version string, recovering bool) error {
	p, e := loadPlan(path, trust, version)
	if e != nil {
		return e
	}
	i := planInstaller(p)
	job := i.Job()
	if job.ID != p.ID {
		return updates.ErrRejected
	}
	applyLock := flock.New(filepath.Join(i.StateDir, "apply.lock"))
	locked, e := applyLock.TryLock()
	if e != nil || !locked {
		return updates.ErrBusy
	}
	defer applyLock.Unlock()
	directory := filepath.Dir(path)
	if recovering {
		hash, err := fileHash(filepath.Join(directory, "release.tar.gz"))
		if err != nil || hash != p.Payload.Artifact.SHA256 {
			writeJob(i, job, "failed", "恢复包摘要校验失败，请停服后人工恢复保留的备份")
			return updates.ErrRejected
		}
		return recoverPlan(p, i, job)
	}
	if job.Status != "preparing" && job.Status != "restarting" {
		return updates.ErrRejected
	}
	hash, e := fileHash(filepath.Join(directory, "release.tar.gz"))
	if e != nil || hash != p.Payload.Artifact.SHA256 {
		return updates.ErrRejected
	}
	// Re-extract into a private staging directory instead of trusting previously prepared executable bytes.
	relativeStage, e := filepath.Rel(p.Stage, p.NewRoot)
	if e != nil {
		return e
	}
	archiveRoot := filepath.Join(p.Stage, strings.Split(relativeStage, string(filepath.Separator))[0])
	if e = os.RemoveAll(archiveRoot); e != nil {
		return e
	}
	extracted, e := Extract(filepath.Join(directory, "release.tar.gz"), p.Stage, p.Payload)
	if e != nil {
		return e
	}
	if p.Target.Profile == "desktop" && runtime.GOOS == "darwin" {
		p.NewRoot = filepath.Join(extracted, filepath.Base(p.NewRoot))
	} else {
		p.NewRoot = extracted
	}
	if e = verifyPlatform(p, trust); e != nil {
		return e
	}
	if _, e = os.Stat(filepath.Join(p.NewRoot, p.RelativeExecutable)); e != nil {
		return e
	}
	if e = updatechannel.Atomic(filepath.Join(directory, "helper.ready"), []byte(p.Nonce)); e != nil {
		return e
	}
	lock, e := lockInstance(p)
	if e != nil {
		return e
	}
	job = i.Job()
	if job.ID != p.ID || job.Status != "restarting" {
		_ = lock.Unlock()
		return updates.ErrRejected
	}
	job = writeJob(i, job, "swapping", "正在原子切换程序")
	if e = i.write(job); e != nil {
		_ = lock.Unlock()
		writeJob(i, job, "failed", "无法持久化更新状态，旧程序保留")
		_, _ = start(p)
		return e
	}
	if runtime.GOOS == "windows" {
		if e = copyFile(p.Executable, filepath.Join(p.Stage, "previous.exe"), 0700); e != nil {
			_ = lock.Unlock()
			writeJob(i, job, "failed", "无法备份旧程序，旧程序保留")
			_, _ = start(p)
			return e
		}
		e = replaceWindows(filepath.Join(p.NewRoot, p.RelativeExecutable), p.Executable)
		if e == nil {
			e = windowsMetadata(p, false)
		}
	} else {
		e = exchange(p.Root, p.NewRoot)
	}
	if e != nil {
		_ = lock.Unlock()
		if runtime.GOOS == "windows" {
			return rollback(p, i, job, nil)
		}
		writeJob(i, job, "failed", "安装切换失败，旧程序保留")
		_, _ = start(p)
		return e
	}
	job = writeJob(i, job, "awaiting_health", "新程序已安装，正在等待启动确认")
	if e = i.write(job); e != nil {
		_ = lock.Unlock()
		return rollback(p, i, job, nil)
	}
	_ = lock.Unlock()
	child, e := start(p)
	if e != nil {
		return rollback(p, i, job, nil)
	}
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		var ack struct {
			Nonce, Version string
			Target         updates.Target
		}
		raw, e := os.ReadFile(filepath.Join(directory, "healthy.json"))
		if e == nil && json.Unmarshal(raw, &ack) == nil && ack.Nonce == p.Nonce && ack.Version == p.Payload.Version && ack.Target == p.Target {
			time.Sleep(2 * time.Second)
			if child != nil && processExited(child) {
				break
			}
			job.Progress = 100
			job = writeJob(i, job, "completed", "更新完成，新版本已通过启动确认")
			if e = i.write(job); e != nil {
				return rollback(p, i, job, child)
			}
			_ = os.Remove(filepath.Join(directory, "release.tar.gz"))
			return nil
		}
		if child != nil && processExited(child) {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	return rollback(p, i, job, child)
}

// Child status is tracked by Wait, preventing PID-reuse based termination.
type childProcess struct {
	command *exec.Cmd
	done    chan struct{}
}

func processExited(p *childProcess) bool {
	select {
	case <-p.done:
		return true
	default:
		return false
	}
}
func start(p Plan) (*childProcess, error) {
	if p.RestartMode == "supervisor" {
		return nil, nil
	}
	command := exec.Command(p.Executable, p.Args...)
	command.Env = os.Environ()
	command.Dir = p.Directory
	detach(command)
	if e := command.Start(); e != nil {
		return nil, e
	}
	child := &childProcess{command: command, done: make(chan struct{})}
	go func() { _ = command.Wait(); close(child.done) }()
	return child, nil
}
func replaceWindows(source, destination string) error {
	var err error
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); time.Sleep(100 * time.Millisecond) {
		err = os.Rename(source, destination)
		if err == nil {
			return nil
		}
	}
	return err
}
func rollback(p Plan, i *Installer, job contracts.UpdateJob, child *childProcess) error {
	job = writeJob(i, job, "rolling_back", "新版本未通过启动确认，正在恢复旧程序")
	if e := i.write(job); e != nil {
		return e
	}
	if child != nil && !processExited(child) {
		_ = child.command.Process.Kill()
		select {
		case <-child.done:
		case <-time.After(10 * time.Second):
		}
	}
	// Supervisor-owned processes respond to the persisted rollback request before opening the database.
	lock, e := lockInstance(p)
	if e != nil {
		writeJob(i, job, "failed", "无法获得实例锁，请停服后按恢复手册处理保留的程序备份")
		return e
	}
	if runtime.GOOS == "windows" {
		e = replaceWindows(filepath.Join(p.Stage, "previous.exe"), p.Executable)
		if e == nil {
			e = windowsMetadata(p, true)
		}
	} else {
		e = exchange(p.Root, p.NewRoot)
	}
	_ = lock.Unlock()
	if e != nil {
		writeJob(i, job, "failed", "旧程序恢复失败，备份已保留，请按恢复手册处理")
		return e
	}
	job.Progress = 0
	writeJob(i, job, "rolled_back", "新版本启动未确认，已恢复旧程序；实例数据保留")
	_, e = start(p)
	return e
}

// Windows replaces only the exited executable; synchronize release metadata with recoverable copies.
func windowsMetadata(p Plan, restore bool) error {
	for _, name := range []string{"VERSION", "manifest.json"} {
		backup := filepath.Join(p.Stage, name+".previous")
		if !restore {
			if e := copyFile(filepath.Join(p.Root, name), backup, 0600); e != nil {
				return e
			}
		}
		source := filepath.Join(p.NewRoot, name)
		if restore {
			source = backup
		}
		raw, e := os.ReadFile(source)
		if restore && os.IsNotExist(e) {
			continue
		}
		if e != nil {
			return e
		}
		if e = updatechannel.Atomic(filepath.Join(p.Root, name), raw); e != nil {
			return e
		}
	}
	return nil
}
func recoverPlan(p Plan, i *Installer, job contracts.UpdateJob) error {
	// Directory exchange never removes the installation path. A surviving signed target is rolled back conservatively.
	if job.Status == "swapping" || job.Status == "awaiting_health" || job.Status == "rolling_back" {
		hash, e := fileHash(p.Executable)
		targetHash, _ := archiveExecutableHash(filepath.Join(filepath.Dir(filepath.Join(p.DataDir, "updates", "jobs", p.ID, "plan.json")), "release.tar.gz"), p)
		if e == nil && hash == targetHash {
			return rollback(p, i, job, nil)
		}
	}
	writeJob(i, job, "failed", "上次更新已中断，当前程序保留；请重新检查更新")
	_, e := start(p)
	return e
}

// Guard is called before opening storage. It resumes an orphaned helper, blocks old binaries mid-switch,
// and requests shutdown if a supervisor-owned unconfirmed process must relinquish its instance lock.
func Guard(dataDir, version string) error {
	var err error
	dataDir, err = canonicalDirectory(dataDir)
	if err != nil {
		return err
	}
	state := filepath.Join(dataDir, "updates")
	i := &Installer{StateDir: state}
	job := i.Job()
	if !busy(job.Status) && job.Status != "rolling_back" {
		return nil
	}
	lock := flock.New(filepath.Join(state, "apply.lock"))
	free, e := lock.TryLock()
	if e != nil {
		return e
	}
	if free {
		_ = lock.Unlock()
		if job.Status == "downloading" || job.Status == "preparing" {
			prepare := flock.New(filepath.Join(state, "prepare.lock"))
			available, _ := prepare.TryLock()
			if !available {
				return nil
			}
			_ = prepare.Unlock()
			writeJob(i, job, "failed", "上次更新准备已中断，当前程序保留")
			return nil
		}
		helper := filepath.Join(state, "jobs", job.ID, "helper")
		if runtime.GOOS == "windows" {
			helper += ".exe"
		}
		command := exec.Command(helper, "--internal-recover-update", filepath.Join(state, "jobs", job.ID, "plan.json"))
		command.Env = os.Environ()
		detach(command)
		if e = command.Start(); e == nil {
			_ = command.Process.Release()
		}
		return updates.ErrBusy
	}
	if job.Status == "rolling_back" || job.Status == "swapping" || job.Version != version {
		return updates.ErrBusy
	}
	return nil
}
func MarkHealthy(dataDir, version string, target updates.Target) {
	var err error
	dataDir, err = canonicalDirectory(dataDir)
	if err != nil {
		return
	}
	i := &Installer{StateDir: filepath.Join(dataDir, "updates")}
	job := i.Job()
	if job.Status != "awaiting_health" || job.Version != version || !jobID.MatchString(job.ID) {
		return
	}
	path := filepath.Join(dataDir, "updates", "jobs", job.ID, "plan.json")
	var p Plan
	raw, e := os.ReadFile(path)
	if e != nil || json.Unmarshal(raw, &p) != nil || p.Payload.Version != version || p.Target != target {
		return
	}
	ack, _ := json.Marshal(struct {
		Nonce, Version string
		Target         updates.Target
	}{p.Nonce, version, target})
	_ = updatechannel.Atomic(filepath.Join(filepath.Dir(path), "healthy.json"), ack)
}

// RollbackRequested lets a supervisor-started process drain normally instead of the helper killing a guessed PID.
func RollbackRequested(dataDir string) bool {
	return (&Installer{StateDir: filepath.Join(dataDir, "updates")}).Job().Status == "rolling_back"
}
