// Author: yunnuo <ymz@ebox.vip>
package updateinstall

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/updates"
)

// The failure-path rehearsal runs the real installer, helper and fixture application on a
// native OS: a corrupted package, a wrong publisher signature and an interrupted download
// must each fail closed, keep the previous program and its data intact, and leave a
// diagnosable terminal job state behind.

type truncatedProvider struct{ archive string }

func (p truncatedProvider) Name() string                                        { return "fixture-truncated" }
func (p truncatedProvider) Releases(context.Context) ([]updates.Release, error) { return nil, nil }
func (p truncatedProvider) Read(_ context.Context, _ string, _ int64) ([]byte, error) {
	return nil, nil
}
func (p truncatedProvider) Download(_ context.Context, _ string, w io.Writer, _ int64, progress func(int64)) error {
	raw, e := os.ReadFile(p.archive)
	if e != nil {
		return e
	}
	// Simulate a connection that dies mid-transfer: half the bytes, no error. The
	// digest check is the safety net for silent truncation.
	n, e := w.Write(raw[:len(raw)/2])
	if e != nil {
		return e
	}
	progress(int64(n))
	return nil
}

func waitTerminal(t *testing.T, i *Installer, expected string) contracts.UpdateJob {
	t.Helper()
	deadline := time.Now().Add(120 * time.Second)
	for time.Now().Before(deadline) {
		job := i.Job()
		if job.Status == expected {
			return job
		}
		if job.Status == "failed" && expected != "failed" {
			t.Fatal(job)
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("update job did not reach %s in time: %+v", expected, i.Job())
	return i.Job()
}

// previousProgramStillLaunches proves recoverability: after the failed update the old
// binary starts, serves its health acknowledgement and keeps user data untouched.
func previousProgramStillLaunches(t *testing.T, i *Installer, executable string) {
	t.Helper()
	i.Shutdown()
	command := exec.Command(executable, "--fixture-app")
	command.Env = append(os.Environ(), "UNICORE_UPDATE_FIXTURE=1")
	command.Dir = i.Root
	if e := command.Start(); e != nil {
		t.Fatal(e)
	}
	running := false
	for deadline := time.Now().Add(60 * time.Second); time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		if raw, e := os.ReadFile(filepath.Join(i.DataDir, "running")); e == nil && strings.TrimSpace(string(raw)) == "1.0.0" {
			running = true
			break
		}
	}
	_ = os.WriteFile(filepath.Join(i.DataDir, "stop"), nil, 0600)
	_ = command.Wait()
	if !running {
		t.Fatal("the previous program no longer launches after the failed update")
	}
}

func assertProgramAndDataIntact(t *testing.T, i *Installer, executable string) {
	t.Helper()
	raw, e := os.ReadFile(filepath.Join(i.Root, "VERSION"))
	if e != nil || strings.TrimSpace(string(raw)) != "1.0.0" {
		t.Fatalf("installation version changed: %s %v", string(raw), e)
	}
	sentinel, e := os.ReadFile(filepath.Join(i.DataDir, "sentinel"))
	if e != nil || string(sentinel) != "preserve data" {
		t.Fatal("user data did not survive the failed update")
	}
	previousProgramStillLaunches(t, i, executable)
}

func assertTerminalFailureRecorded(t *testing.T, i *Installer) {
	t.Helper()
	state, e := os.ReadFile(filepath.Join(i.StateDir, "state.json"))
	if e != nil || !strings.Contains(string(state), `"status":"failed"`) {
		t.Fatalf("no diagnosable terminal job state: %s %v", string(state), e)
	}
}

func TestCorruptPackageFailsClosed(t *testing.T) {
	i, payload, file := installFixture(t)
	t.Chdir(i.Root)
	raw, e := os.ReadFile(file)
	if e != nil {
		t.Fatal(e)
	}
	// Flip one byte in the middle of the archive payload.
	raw[len(raw)/2] ^= 0xFF
	if e = os.WriteFile(file, raw, 0600); e != nil {
		t.Fatal(e)
	}
	if _, e = i.Start(payload); e != nil {
		t.Fatal(e)
	}
	job := waitTerminal(t, i, "failed")
	if job.Message == "" {
		t.Fatal("failed job must keep a human-readable diagnosis")
	}
	assertProgramAndDataIntact(t, i, i.Executable)
	assertTerminalFailureRecorded(t, i)
}

func TestWrongPublisherSignatureFailsClosed(t *testing.T) {
	i, payload, _ := installFixture(t)
	t.Chdir(i.Root)
	_, foreign, _ := ed25519.GenerateKey(rand.Reader)
	sig, _ := json.Marshal(updates.Signature{KeyID: "test", Algorithm: "ed25519", Value: base64.StdEncoding.EncodeToString(ed25519.Sign(foreign, payload.Manifest))})
	payload.Signature = sig
	if _, e := i.Start(payload); e == nil {
		t.Fatal("a manifest signed by an unknown publisher must be rejected before any job starts")
	}
	if job := i.Job(); job.Status != "idle" {
		t.Fatalf("rejected payload must not create a job: %+v", job)
	}
	assertProgramAndDataIntact(t, i, i.Executable)
}

func TestTruncatedDownloadFailsClosed(t *testing.T) {
	i, payload, file := installFixture(t)
	t.Chdir(i.Root)
	options := i.Options
	options.Provider = truncatedProvider{archive: file}
	truncated := New(options)
	if truncated.Readiness() != "" {
		t.Fatal(truncated.Readiness())
	}
	if _, e := truncated.Start(payload); e != nil {
		t.Fatal(e)
	}
	job := waitTerminal(t, truncated, "failed")
	if job.Message == "" {
		t.Fatal("failed job must keep a human-readable diagnosis")
	}
	assertProgramAndDataIntact(t, i, i.Executable)
	assertTerminalFailureRecorded(t, i)
}
