// Author: yunnuo <ymz@ebox.vip>
package updateinstall

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/gofrs/flock"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updates"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 && (os.Args[1] == "--internal-apply-update" || os.Args[1] == "--internal-recover-update") && os.Getenv("UNICORE_UPDATE_FIXTURE") == "1" {
		var trust updates.Trust
		_ = json.Unmarshal([]byte(os.Getenv("UNICORE_UPDATE_FIXTURE_TRUST")), &trust)
		if e := RunHelper(os.Args[2], trust, "1.0.0", os.Args[1] == "--internal-recover-update"); e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(2)
		}
		os.Exit(0)
	}
	if len(os.Args) > 1 && os.Args[1] == "--fixture-app" && os.Getenv("UNICORE_UPDATE_FIXTURE") == "1" {
		data := os.Getenv("UNICORE_UPDATE_FIXTURE_DATA")
		exe, _ := os.Executable()
		versionFile := filepath.Join(filepath.Dir(exe), "..", "VERSION")
		if runtime.GOOS == "windows" {
			versionFile = filepath.Join(filepath.Dir(exe), "VERSION")
		}
		b, _ := os.ReadFile(versionFile)
		v := strings.TrimSpace(string(b))
		if v == os.Getenv("UNICORE_UPDATE_FIXTURE_FAIL") {
			os.Exit(3)
		}
		if Guard(data, v) != nil {
			os.Exit(4)
		}
		lock := flock.New(filepath.Join(data, "instance.lock"))
		if ok, _ := lock.TryLock(); !ok {
			os.Exit(5)
		}
		profile := "web-standalone"
		if runtime.GOOS == "windows" {
			profile = "desktop"
		}
		MarkHealthy(data, v, updates.Target{Profile: profile, OS: runtime.GOOS, Arch: runtime.GOARCH, Migration: 1, BusinessMigration: 1, Updater: true})
		_ = os.WriteFile(filepath.Join(data, "running"), []byte(v), 0600)
		cwd, _ := os.Getwd()
		_ = os.WriteFile(filepath.Join(data, "working-directory"), []byte(cwd), 0600)
		for {
			if _, e := os.Stat(filepath.Join(data, "stop")); e == nil {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
		_ = lock.Unlock()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type diskProvider struct{ archive string }

func (p diskProvider) Name() string                                        { return "fixture" }
func (p diskProvider) Releases(context.Context) ([]updates.Release, error) { return nil, nil }
func (p diskProvider) Read(context.Context, string, int64) ([]byte, error) { return nil, nil }
func (p diskProvider) Download(_ context.Context, _ string, w io.Writer, _ int64, progress func(int64)) error {
	f, e := os.Open(p.archive)
	if e != nil {
		return e
	}
	defer f.Close()
	n, e := io.Copy(w, f)
	progress(n)
	return e
}
func archive(t *testing.T, destination string, entries map[string][]byte) {
	t.Helper()
	f, e := os.Create(destination)
	if e != nil {
		t.Fatal(e)
	}
	z := gzip.NewWriter(f)
	w := tar.NewWriter(z)
	for name, b := range entries {
		mode := int64(0644)
		if strings.HasSuffix(name, "/bin/server") {
			mode = 0755
		}
		if e = w.WriteHeader(&tar.Header{Name: name, Size: int64(len(b)), Mode: mode}); e != nil {
			t.Fatal(e)
		}
		if _, e = w.Write(b); e != nil {
			t.Fatal(e)
		}
	}
	_ = w.Close()
	_ = z.Close()
	_ = f.Close()
}
func installFixture(t *testing.T) (*Installer, updates.Payload, string) {
	t.Helper()
	// The fixture manages its own child processes, independently of a CI runner's service.
	t.Setenv("INVOCATION_ID", "")
	base := t.TempDir()
	root := filepath.Join(base, "current")
	data := filepath.Join(base, "data")
	_ = os.MkdirAll(filepath.Join(root, "bin"), 0755)
	_ = os.MkdirAll(data, 0700)
	executable, _ := os.Executable()
	executableName := "bin/server"
	profile := "web-standalone"
	if runtime.GOOS == "windows" {
		executableName = "server.exe"
		profile = "desktop"
	}
	if e := copyFile(executable, filepath.Join(root, executableName), 0755); e != nil {
		t.Fatal(e)
	}
	_ = os.WriteFile(filepath.Join(root, "VERSION"), []byte("1.0.0"), 0644)
	_ = os.WriteFile(filepath.Join(data, "sentinel"), []byte("preserve data"), 0600)
	target := updates.Target{Profile: profile, OS: runtime.GOOS, Arch: runtime.GOARCH, Migration: 1, BusinessMigration: 1, Updater: true}
	pub, key, _ := ed25519.GenerateKey(rand.Reader)
	trust := updates.Trust{AllowUnsignedPlatform: true, Application: "test.unicore.app", Keys: map[string]string{"test": base64.StdEncoding.EncodeToString(pub)}}
	meta, _ := json.Marshal(map[string]any{"version": "1.0.1", "profile": target.Profile, "os": target.OS, "arch": target.Arch, "commit": strings.Repeat("a", 40), "migration_level": 1, "business_migration_level": 1, "features": map[string]bool{"license": false, "updater": true}})
	oldMeta := bytes.Replace(meta, []byte(`"version":"1.0.1"`), []byte(`"version":"1.0.0"`), 1)
	_ = os.WriteFile(filepath.Join(root, "manifest.json"), oldMeta, 0644)
	binary, e := os.ReadFile(executable)
	if e != nil {
		t.Fatal(e)
	}
	file := filepath.Join(base, "fixture.tar.gz")
	archive(t, file, map[string][]byte{"release/VERSION": []byte("1.0.1\n"), "release/manifest.json": meta, "release/" + executableName: binary})
	raw, _ := os.ReadFile(file)
	sum := sha256.Sum256(raw)
	a := updates.Artifact{Target: target, Name: "fixture.tar.gz", Size: int64(len(raw)), SHA256: hex.EncodeToString(sum[:]), PlatformSignature: "unsigned"}
	manifest := updates.Manifest{Schema: 1, Application: trust.Application, Version: "1.0.1", Commit: strings.Repeat("a", 40), IssuedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour), Artifacts: []updates.Artifact{a}}
	signed, _ := json.Marshal(manifest)
	sig, _ := json.Marshal(updates.Signature{KeyID: "test", Algorithm: "ed25519", Value: base64.StdEncoding.EncodeToString(ed25519.Sign(key, signed))})
	payload := updates.Payload{Version: manifest.Version, Commit: manifest.Commit, Artifact: a, Manifest: signed, Signature: sig, URL: "fixture"}
	trustBytes, _ := json.Marshal(trust)
	t.Setenv("UNICORE_UPDATE_FIXTURE", "1")
	t.Setenv("UNICORE_UPDATE_FIXTURE_TRUST", string(trustBytes))
	t.Setenv("UNICORE_UPDATE_FIXTURE_DATA", data)
	lock := flock.New(filepath.Join(data, "instance.lock"))
	ok, e := lock.TryLock()
	if !ok || e != nil {
		t.Fatal(e)
	}
	installer := New(Options{DataDir: data, InstallDir: root, Deployment: "tar", Version: "1.0.0", Executable: filepath.Join(root, executableName), Args: []string{"--fixture-app"}, Target: func() updates.Target { return target }, Trust: trust, Provider: diskProvider{file}, Shutdown: func() { _ = lock.Unlock() }})
	t.Cleanup(func() {
		_ = lock.Unlock()
		_ = os.WriteFile(filepath.Join(data, "stop"), nil, 0600)
		time.Sleep(100 * time.Millisecond)
	})
	return installer, payload, file
}
func TestRealHelperUpgradeAndRollback(t *testing.T) {

	for _, fail := range []bool{false, true} {
		t.Run(strconv.FormatBool(fail), func(t *testing.T) {
			i, p, _ := installFixture(t)
			t.Chdir(i.Root)
			if fail {
				t.Setenv("UNICORE_UPDATE_FIXTURE_FAIL", "1.0.1")
			}
			if i.Readiness() != "" {
				t.Fatal(i.Readiness())
			}
			if _, e := i.Start(p); e != nil {
				t.Fatal(e)
			}
			expected := "completed"
			version := "1.0.1"
			if fail {
				expected = "rolled_back"
				version = "1.0.0"
			}
			deadline := time.Now().Add(20 * time.Second)
			for time.Now().Before(deadline) {
				job := i.Job()
				if job.Status == expected {
					break
				}
				if job.Status == "failed" {
					t.Fatal(job)
				}
				time.Sleep(50 * time.Millisecond)
			}
			if job := i.Job(); job.Status != expected {
				t.Fatal(job)
			}
			b, _ := os.ReadFile(filepath.Join(i.Root, "VERSION"))
			if strings.TrimSpace(string(b)) != version {
				t.Fatal("wrong program", string(b))
			}
			b, _ = os.ReadFile(filepath.Join(i.DataDir, "sentinel"))
			if string(b) != "preserve data" {
				t.Fatal("data changed")
			}
			if !fail {
				b, e := os.ReadFile(filepath.Join(i.DataDir, "working-directory"))
				if e != nil || string(b) != i.Root {
					t.Fatal("restart changed the working directory", string(b), e)
				}
			}
		})
	}
}
func TestExtractRejectsUnsafeArchiveAndMetadata(t *testing.T) {
	i, p, _ := installFixture(t)
	_ = i
	for _, name := range []string{"../escape", "/escape", "root/../escape", "root/evil:exe", "root/._fork"} {
		t.Run(name, func(t *testing.T) {
			f := filepath.Join(t.TempDir(), "bad.tar.gz")
			archive(t, f, map[string][]byte{name: []byte("x")})
			if _, e := Extract(f, t.TempDir(), p); e == nil {
				t.Fatal("unsafe archive accepted")
			}
		})
	}
	f := filepath.Join(t.TempDir(), "bad.tar.gz")
	archive(t, f, map[string][]byte{"root/VERSION": []byte(p.Version), "root/manifest.json": []byte(`{"version":"1.0.1"}`)})
	if _, e := Extract(f, t.TempDir(), p); e == nil {
		t.Fatal("incompatible metadata accepted")
	}
}

func TestDataDirectoryAliasesCannotEnterInstallation(t *testing.T) {
	i, _, _ := installFixture(t)
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(i.Root, alias); err != nil {
		if runtime.GOOS == "windows" {
			t.Skip("Windows symlinks require privileges: " + err.Error())
		}
		t.Fatal(err)
	}
	options := i.Options
	options.DataDir = filepath.Join(alias, "new-data", "nested")
	blocked := New(options)
	if blocked.Readiness() == "" {
		t.Fatal("data alias inside the replaceable installation was accepted")
	}
	options.DataDir = ""
	blocked = New(options)
	if blocked.Readiness() == "" || blocked.StateDir != "" || blocked.Job().Status != "idle" {
		t.Fatal("invalid data directory must disable installation without relative state access")
	}
}

func TestSystemdRequiresExplicitSupervisor(t *testing.T) {
	i, _, _ := installFixture(t)
	t.Setenv("INVOCATION_ID", "fixture-systemd")
	options := i.Options
	if reason := New(options).Readiness(); !strings.Contains(reason, "systemd") {
		t.Fatal("systemd must require an explicit restart policy", reason)
	}
	options.RestartMode = "supervisor"
	if reason := New(options).Readiness(); reason != "" {
		t.Fatal(reason)
	}
}

func TestHealthyAcknowledgementRequiresExactTarget(t *testing.T) {
	i, payload, _ := installFixture(t)
	id := strings.Repeat("b", 32)
	directory := filepath.Join(i.StateDir, "jobs", id)
	_ = os.MkdirAll(directory, 0700)
	p := Plan{Payload: payload, Target: payload.Artifact.Target, Nonce: "test-nonce"}
	raw, _ := json.Marshal(p)
	_ = os.WriteFile(filepath.Join(directory, "plan.json"), raw, 0600)
	_ = i.write(contracts.UpdateJob{ID: id, Status: "awaiting_health", Version: payload.Version})
	wrong := p.Target
	wrong.Updater = false
	MarkHealthy(i.DataDir, payload.Version, wrong)
	if _, err := os.Stat(filepath.Join(directory, "healthy.json")); !os.IsNotExist(err) {
		t.Fatal("mismatched feature target acknowledged")
	}
	MarkHealthy(i.DataDir, payload.Version, p.Target)
	if _, err := os.Stat(filepath.Join(directory, "healthy.json")); err != nil {
		t.Fatal(err)
	}
}
func TestInterruptedSignedSwapRestoresPreviousProgram(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix exchange fixture")
	}
	i, p, file := installFixture(t)
	stage, e := os.MkdirTemp(filepath.Dir(i.Root), ".unicore-update-"+strings.Repeat("a", 32)+"-")
	if e != nil {
		t.Fatal(e)
	}
	newRoot, e := Extract(file, stage, p)
	if e != nil {
		t.Fatal(e)
	}
	id := strings.Repeat("a", 32)
	directory := filepath.Join(i.StateDir, "jobs", id)
	_ = os.MkdirAll(directory, 0700)
	if e = copyFile(file, filepath.Join(directory, "release.tar.gz"), 0600); e != nil {
		t.Fatal(e)
	}
	plan := Plan{ID: id, Root: i.Root, DataDir: i.DataDir, Stage: stage, NewRoot: newRoot, Executable: i.Executable, RelativeExecutable: "bin/server", Args: []string{"--fixture-app"}, Directory: filepath.Dir(i.Root), OldVersion: "1.0.0", Target: p.Artifact.Target, Payload: p, Nonce: "nonce"}
	raw, _ := json.Marshal(plan)
	path := filepath.Join(directory, "plan.json")
	_ = os.WriteFile(path, raw, 0600)
	if e = exchange(i.Root, newRoot); e != nil {
		t.Fatal(e)
	}
	_ = i.write(contracts.UpdateJob{ID: id, Version: p.Version, Status: "awaiting_health"})
	i.Shutdown()
	if e = RunHelper(path, i.Trust, "1.0.0", true); e != nil {
		t.Fatal(e)
	}
	if i.Job().Status != "rolled_back" {
		t.Fatal(i.Job())
	}
	b, _ := os.ReadFile(filepath.Join(i.Root, "VERSION"))
	if string(b) != "1.0.0" {
		t.Fatal(string(b))
	}
}
