// Author: yunnuo <ymz@ebox.vip>
// Description: Offline-first history with explicit network checks and independently reverified install requests.
package updates

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"sort"
	"sync"
	"time"
)

type Service struct {
	Provider         Provider
	Cache            Cache
	Installer        Installer
	Trust            Trust
	Version, Channel string
	Current          func() Target
	Embedded         []Release
	mu               sync.Mutex
}

func (s *Service) Overview(ctx context.Context) contracts.UpdateOverview {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.overview(s.Cache.Load())
}
func (s *Service) overview(c Catalog) contracts.UpdateOverview {
	history := map[string]contracts.UpdateRelease{}
	for _, r := range s.Embedded {
		history[r.Version] = contracts.UpdateRelease{Version: r.Version, Notes: r.Notes, PublishedAt: r.PublishedAt, Prerelease: r.Prerelease, Url: r.URL, Source: "内置日志"}
	}
	for _, r := range c.Releases {
		history[r.Version] = contracts.UpdateRelease{Version: r.Version, Notes: r.Notes, PublishedAt: r.PublishedAt, Prerelease: r.Prerelease, Url: r.URL, Source: "已缓存"}
	}
	entries := make([]contracts.UpdateRelease, 0, len(history))
	latest := ""
	for _, r := range history {
		entries = append(entries, r)
		if Compare(r.Version, latest) > 0 || latest == "" {
			latest = r.Version
		}
	}
	sort.Slice(entries, func(i, j int) bool { return Compare(entries[i].Version, entries[j].Version) > 0 })
	job := s.Installer.Job()
	reason := s.Installer.Readiness()
	installReason := reason
	verified := false
	if c.Verified != nil {
		err := VerifyPayload(*c.Verified, s.Trust, s.Version, s.Current(), time.Now())
		verified = err == nil && c.Verified.Version == latest
	}
	available := Compare(latest, s.Version) > 0
	if reason == "" && !verified {
		reason = "暂无适配当前应用的可信签名更新包"
	}
	if !available && installReason == "" {
		reason = "当前已是最新版本"
		if c.LastError != "" {
			reason = "当前显示本机版本记录，联网后可重新检查"
		} else if c.CheckedAt == "" {
			reason = "可先阅读本机版本记录，点击检查获取最新版本"
		}
	}
	if busy(job.Status) {
		reason = "已有更新任务正在执行"
	}
	return contracts.UpdateOverview{CurrentVersion: s.Version, LatestVersion: latest, Channel: s.Channel, Source: s.Provider.Name(), Available: available, Verified: verified, CanApply: available && verified && reason == "", Reason: reason, CheckedAt: c.CheckedAt, LastError: c.LastError, History: entries, Job: job}
}
func busy(status string) bool {
	return status == "downloading" || status == "preparing" || status == "restarting" || status == "swapping" || status == "awaiting_health" || status == "rolling_back"
}
func (s *Service) Check(ctx context.Context) contracts.UpdateOverview {
	s.mu.Lock()
	defer s.mu.Unlock()
	old := s.Cache.Load()
	bounded, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	releases, err := s.Provider.Releases(bounded)
	if err != nil {
		old.LastError = "暂时无法连接更新渠道，以下保留内置与已缓存的更新日志"
		_ = s.Cache.Save(old)
		return s.overview(old)
	}
	c := Catalog{CheckedAt: time.Now().UTC().Format(time.RFC3339), Releases: releases}
	var latest *Release
	for i := range releases {
		r := &releases[i]
		if !ValidVersion(r.Version) || (r.Prerelease && s.Channel != "preview") {
			continue
		}
		if latest == nil || Compare(r.Version, latest.Version) > 0 {
			latest = r
		}
	}
	// Do not expose excluded preview releases as stable latest/history.
	c.Releases = nil
	for _, r := range releases {
		if ValidVersion(r.Version) && (!r.Prerelease || s.Channel == "preview") {
			c.Releases = append(c.Releases, r)
		}
	}
	if latest != nil && Compare(latest.Version, s.Version) > 0 {
		var manifestURL, signatureURL string
		for _, a := range latest.Assets {
			if a.Name == "update-manifest.json" {
				manifestURL = a.URL
			}
			if a.Name == "update-manifest.sig" {
				signatureURL = a.URL
			}
		}
		if manifestURL != "" && signatureURL != "" {
			raw, e := s.Provider.Read(bounded, manifestURL, 256*1024)
			sig, e2 := s.Provider.Read(bounded, signatureURL, 4096)
			if e == nil && e2 == nil {
				m, artifact, e := Verify(raw, sig, s.Trust, s.Version, latest.Version, s.Current(), time.Now())
				if e == nil {
					for _, a := range latest.Assets {
						if a.Name == artifact.Name {
							c.Verified = &Payload{Manifest: raw, Signature: sig, Artifact: artifact, URL: a.URL, Version: m.Version, Commit: m.Commit}
							break
						}
					}
				}
				if e != nil {
					c.LastError = "新版本签名或兼容性校验未通过，已阻止安装"
				}
			} else {
				c.LastError = "签名更新包暂时无法读取，已保留更新日志"
			}
		}
	}
	if err = s.Cache.Save(c); err != nil {
		c.LastError = "无法保存版本缓存，请检查私有数据目录权限"
	}
	return s.overview(c)
}
func (s *Service) Apply(ctx context.Context, input contracts.UpdateApplyInput) (contracts.UpdateJob, error) {
	if !input.BackupConfirmed {
		return contracts.UpdateJob{}, ErrRejected
	}
	view := s.Check(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	if !view.CanApply || input.Version != view.LatestVersion {
		return contracts.UpdateJob{}, ErrRejected
	}
	c := s.Cache.Load()
	if c.Verified == nil {
		return contracts.UpdateJob{}, ErrRejected
	}
	if err := VerifyPayload(*c.Verified, s.Trust, s.Version, s.Current(), time.Now()); err != nil {
		return contracts.UpdateJob{}, err
	}
	return s.Installer.Start(*c.Verified)
}
