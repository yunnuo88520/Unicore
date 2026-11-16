// Author: yunnuo <ymz@ebox.vip>
package updates

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"io"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (Manifest, []byte, Trust, ed25519.PrivateKey, Target) {
	t.Helper()
	pub, key, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	target := Target{Profile: "web-platform", OS: "linux", Arch: "amd64", SchemaGeneration: "unicore-1", SchemaFingerprint: strings.Repeat("c", 64), Updater: true}
	m := Manifest{Schema: 1, Application: "vip.ebox.unicore", Version: "1.1.0", Commit: strings.Repeat("a", 40), IssuedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour), Artifacts: []Artifact{{Target: target, Name: "release.tar.gz", SHA256: strings.Repeat("b", 64), Size: 100, PlatformSignature: "unsigned"}}}
	raw, _ := json.Marshal(m)
	return m, raw, Trust{Application: m.Application, Keys: map[string]string{"test": base64.StdEncoding.EncodeToString(pub)}}, key, target
}
func signature(raw []byte, key ed25519.PrivateKey) []byte {
	b, _ := json.Marshal(Signature{KeyID: "test", Algorithm: "ed25519", Value: base64.StdEncoding.EncodeToString(ed25519.Sign(key, raw))})
	return b
}
func TestUnsignedNativeStillRequiresPublisherSignature(t *testing.T) {
	for _, os := range []string{"darwin", "windows"} {
		t.Run(os, func(t *testing.T) {
			m, _, trust, key, target := fixture(t)
			target.Profile, target.OS = "desktop", os
			m.Artifacts[0].Target = target
			raw, _ := json.Marshal(m)
			sig := signature(raw, key)
			trust.AllowUnsignedPlatform = true
			if _, _, err := Verify(raw, sig, trust, "1.0.0", m.Version, target, time.Now()); err != nil {
				t.Fatal("publisher-signed native artifact rejected", err)
			}
			_, other, _ := ed25519.GenerateKey(rand.Reader)
			for name, invalid := range map[string][]byte{"missing": nil, "wrong publisher": signature(raw, other)} {
				if _, _, err := Verify(raw, invalid, trust, "1.0.0", m.Version, target, time.Now()); !errors.Is(err, ErrRejected) {
					t.Fatalf("accepted %s signature: %v", name, err)
				}
			}
			trust.AllowUnsignedPlatform = false
			if _, _, err := Verify(raw, sig, trust, "1.0.0", m.Version, target, time.Now()); !errors.Is(err, ErrRejected) {
				t.Fatalf("strict OS policy accepted unsigned artifact: %v", err)
			}
		})
	}
}
func TestSignedTargetRejectsTamperingAndIncompatibility(t *testing.T) {
	m, raw, trust, key, target := fixture(t)
	if _, _, e := Verify(raw, signature(raw, key), trust, "1.0.0", m.Version, target, time.Now()); e != nil {
		t.Fatal(e)
	}
	cases := map[string]func(*Manifest){"application": func(m *Manifest) { m.Application = "other" }, "expired": func(m *Manifest) { m.ExpiresAt = time.Now().Add(-time.Second) }, "future": func(m *Manifest) { m.IssuedAt = time.Now().Add(time.Hour) }, "commit": func(m *Manifest) { m.Commit = "main" }, "migration": func(m *Manifest) { m.Artifacts[0].SchemaGeneration = "unicore-2" }, "business migration": func(m *Manifest) { m.Artifacts[0].SchemaFingerprint = strings.Repeat("d", 64) }, "notes edition": func(m *Manifest) { m.Artifacts[0].NotesDisabled = !target.NotesDisabled }, "features": func(m *Manifest) { m.Artifacts[0].License = true }, "duplicate target": func(m *Manifest) { m.Artifacts = append(m.Artifacts, m.Artifacts[0]) }, "duplicate name": func(m *Manifest) { a := m.Artifacts[0]; a.Arch = "arm64"; m.Artifacts = append(m.Artifacts, a) }, "platform claim": func(m *Manifest) { m.Artifacts[0].PlatformSignature = "trusted" }}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			var altered Manifest
			_ = json.Unmarshal(raw, &altered)
			change(&altered)
			b, _ := json.Marshal(altered)
			if _, _, e := Verify(b, signature(b, key), trust, "1.0.0", m.Version, target, time.Now()); !errors.Is(e, ErrRejected) {
				t.Fatalf("accepted: %v", e)
			}
		})
	}
	for _, current := range []string{"1.1.0", "2.0.0", "dev"} {
		if _, _, e := Verify(raw, signature(raw, key), trust, current, m.Version, target, time.Now()); e == nil {
			t.Fatal("accepted downgrade/invalid current")
		}
	}
	altered := append([]byte(nil), raw...)
	altered[1] = 'x'
	if _, _, e := Verify(altered, signature(raw, key), trust, "1.0.0", m.Version, target, time.Now()); e == nil {
		t.Fatal("accepted tamper")
	}
	trust.Keys = map[string]string{}
	if _, _, e := Verify(raw, signature(raw, key), trust, "1.0.0", m.Version, target, time.Now()); e == nil {
		t.Fatal("accepted unknown key")
	}
}

type memoryCache struct{ c Catalog }

func (c *memoryCache) Load() Catalog        { return c.c }
func (c *memoryCache) Save(v Catalog) error { c.c = v; return nil }

type testProvider struct {
	releases []Release
	raw, sig []byte
	fail     bool
	calls    int
}

func (p *testProvider) Name() string { return "test" }
func (p *testProvider) Releases(context.Context) ([]Release, error) {
	p.calls++
	if p.fail {
		return nil, ErrUnavailable
	}
	return p.releases, nil
}
func (p *testProvider) Read(_ context.Context, u string, _ int64) ([]byte, error) {
	if u == "sig" {
		return p.sig, nil
	}
	return p.raw, nil
}
func (p *testProvider) Download(context.Context, string, io.Writer, int64, func(int64)) error {
	return nil
}

type testInstaller struct {
	calls  int
	reason string
	status string
}

func (i *testInstaller) Readiness() string        { return i.reason }
func (i *testInstaller) Job() contracts.UpdateJob { return contracts.UpdateJob{Status: i.status} }
func (i *testInstaller) Start(Payload) (contracts.UpdateJob, error) {
	i.calls++
	return contracts.UpdateJob{Status: "downloading"}, nil
}
func TestOfflineHistoryAndApplyReverification(t *testing.T) {
	m, raw, trust, key, target := fixture(t)
	p := &testProvider{raw: raw, sig: signature(raw, key), releases: []Release{{Version: m.Version, Notes: "remote", Assets: []AssetLink{{Name: "update-manifest.json", URL: "manifest"}, {Name: "update-manifest.sig", URL: "sig"}, {Name: m.Artifacts[0].Name, URL: "archive"}}}}}
	cache := &memoryCache{}
	install := &testInstaller{}
	s := &Service{Version: "1.0.0", Channel: "stable", Provider: p, Cache: cache, Installer: install, Trust: trust, Current: func() Target { return target }, Embedded: []Release{{Version: "1.0.0", Notes: "offline built-in"}}}
	if v := s.Overview(context.Background()); len(v.History) != 1 || v.CheckedAt != "" {
		t.Fatal(v)
	}
	install.reason = "容器由宿主机替换镜像"
	if v := s.Overview(context.Background()); v.CanApply || v.Reason != install.reason {
		t.Fatal("deployment limitation must remain visible before checking", v)
	}
	install.reason = ""
	if v := s.Check(context.Background()); !v.CanApply || len(v.History) != 2 {
		t.Fatal(v)
	}
	p.fail = true
	if v := s.Check(context.Background()); len(v.History) != 2 || v.LastError == "" {
		t.Fatal(v)
	}
	if _, e := s.Apply(context.Background(), contracts.UpdateApplyInput{Version: m.Version}); e == nil {
		t.Fatal("missing backup accepted")
	}
	cache.c.Verified.Artifact.SHA256 = strings.Repeat("0", 64)
	if _, e := s.Apply(context.Background(), contracts.UpdateApplyInput{Version: m.Version, BackupConfirmed: true}); e == nil {
		t.Fatal("cached tamper accepted")
	}
	p.fail = false
	if _, e := s.Apply(context.Background(), contracts.UpdateApplyInput{Version: m.Version, BackupConfirmed: true}); e != nil || install.calls != 1 {
		t.Fatal(e, install.calls)
	}
	p.releases[0].Prerelease = true
	if v := s.Check(context.Background()); v.Available || len(v.History) != 1 {
		t.Fatal("stable included preview", v)
	}
}

func TestScheduledChecksThrottleFailuresAndRestartsWithoutInstalling(t *testing.T) {
	m, raw, trust, key, target := fixture(t)
	p := &testProvider{raw: raw, sig: signature(raw, key), releases: []Release{{Version: m.Version, Assets: []AssetLink{{Name: "update-manifest.json", URL: "manifest"}, {Name: "update-manifest.sig", URL: "sig"}, {Name: m.Artifacts[0].Name, URL: "archive"}}}}}
	cache, installer := &memoryCache{}, &testInstaller{}
	newService := func() *Service {
		return &Service{Provider: p, Cache: cache, Installer: installer, Trust: trust, Version: "1.0.0", Channel: "stable", Current: func() Target { return target }}
	}
	s := newService()
	now := time.Now().UTC().Truncate(time.Second)
	if !s.checkScheduled(context.Background(), now) || !s.Overview(context.Background()).CanApply || installer.calls != 0 {
		t.Fatal("scheduled discovery must verify the package without installing it")
	}
	if s.checkScheduled(context.Background(), now.Add(CheckInterval-time.Second)) || p.calls != 1 {
		t.Fatal("scheduled check repeated too soon")
	}
	s.Check(context.Background())
	if p.calls != 2 {
		t.Fatal("manual check was throttled")
	}
	installer.status = "downloading"
	if s.checkScheduled(context.Background(), now.Add(CheckInterval+time.Minute)) {
		t.Fatal("scheduled check ran during an installation")
	}
	installer.status, p.fail = "idle", true
	if !s.checkScheduled(context.Background(), now.Add(CheckInterval+time.Minute)) || cache.c.LastError == "" || len(cache.c.Releases) != 1 {
		t.Fatal("failed check must retain the last verified history")
	}
	restarted := newService()
	if restarted.checkScheduled(context.Background(), now.Add(CheckInterval+2*time.Minute)) || p.calls != 3 {
		t.Fatal("restart retried a recently failed channel")
	}
	if !restarted.checkScheduled(context.Background(), now.Add(2*CheckInterval+time.Minute)) || p.calls != 4 || installer.calls != 0 {
		t.Fatal("failed channel was not retried after the interval")
	}
	target.SchemaFingerprint = ""
	if newService().checkScheduled(context.Background(), now.Add(3*CheckInterval)) {
		t.Fatal("uninstalled instance contacted the update channel")
	}
}

type waitingProvider struct {
	testProvider
	entered chan struct{}
}

func (p *waitingProvider) Releases(ctx context.Context) ([]Release, error) {
	close(p.entered)
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestScheduledCheckKeepsOverviewReadableAndStopsWithLifecycle(t *testing.T) {
	_, _, _, _, target := fixture(t)
	p := &waitingProvider{entered: make(chan struct{})}
	cache := &memoryCache{c: Catalog{Releases: []Release{{Version: "1.0.0", Notes: "cached"}}}}
	s := &Service{Provider: p, Cache: cache, Installer: &testInstaller{}, Version: "1.0.0", Current: func() Target { return target }}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ticks, done := make(chan time.Time, 1), make(chan struct{})
	go func() { s.runChecks(ctx, ticks); close(done) }()
	ticks <- time.Now()
	select {
	case <-p.entered:
	case <-time.After(time.Second):
		t.Fatal("timer did not trigger discovery")
	}
	overview := make(chan contracts.UpdateOverview, 1)
	go func() { overview <- s.Overview(context.Background()) }()
	select {
	case v := <-overview:
		if len(v.History) != 1 || v.History[0].Notes != "cached" {
			t.Fatal("cached history disappeared during discovery")
		}
	case <-time.After(time.Second):
		t.Fatal("slow update source blocked the overview")
	}
	if s.checkScheduled(ctx, time.Now().Add(CheckInterval)) {
		t.Fatal("concurrent scheduled discovery was not skipped")
	}
	manualCtx, cancelManual := context.WithCancel(context.Background())
	cancelManual()
	manual := make(chan contracts.UpdateOverview, 1)
	go func() { manual <- s.Check(manualCtx) }()
	select {
	case <-manual:
	case <-time.After(time.Second):
		t.Fatal("cancelled manual check waited for background discovery")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("scheduled request outlived cancellation")
	}
	if cache.c.LastError != "" || cache.c.AttemptedAt != "" {
		t.Fatal("shutdown corrupted the cached result")
	}
}
