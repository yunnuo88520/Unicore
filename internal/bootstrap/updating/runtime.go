// Author: yunnuo <ymz@ebox.vip>
// Description: Assemble configurable update channels and trust for Web/desktop, without platform identity imports.
package updating

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/yunnuo/unicore/assets/brand"
	updateassets "github.com/yunnuo/unicore/assets/updates"
	"github.com/yunnuo/unicore/internal/adapter/updatechannel"
	"github.com/yunnuo/unicore/internal/adapter/updateinstall"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/edition"
	"github.com/yunnuo/unicore/internal/updates"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

type Configuration struct {
	Repository    string            `json:"repository"`
	Channel       string            `json:"channel"`
	Keys          map[string]string `json:"keys"`
	AllowUnsigned bool              `json:"allow_unsigned_platform"`
}

func configuration() (Configuration, updates.Trust, error) {
	var c Configuration
	var identity struct {
		BundleID string `json:"bundleId"`
	}
	if json.Unmarshal(updateassets.Config, &c) != nil || json.Unmarshal(brand.Identity, &identity) != nil {
		return c, updates.Trust{}, updates.ErrRejected
	}
	if file := os.Getenv("APP_UPDATE_TRUST_FILE"); file != "" {
		raw, e := os.ReadFile(file)
		if e != nil || len(raw) > 32768 || json.Unmarshal(raw, &c) != nil {
			return c, updates.Trust{}, updates.ErrRejected
		}
	}
	if repository := os.Getenv("APP_UPDATE_REPOSITORY"); repository != "" {
		c.Repository = repository
	}
	return c, updates.Trust{Application: identity.BundleID, Keys: c.Keys, AllowUnsignedPlatform: c.AllowUnsigned}, nil
}
func Helper(args []string) (bool, error) {
	if len(args) == 0 || args[0] != "--internal-apply-update" && args[0] != "--internal-recover-update" {
		return false, nil
	}
	if len(args) != 2 {
		return true, updates.ErrRejected
	}
	_, trust, e := configuration()
	if e != nil {
		return true, e
	}
	return true, updateinstall.RunHelper(args[1], trust, buildinfo.Version, args[0] == "--internal-recover-update")
}
func Guard(dataDir string) error {
	directory, err := filepath.Abs(dataDir)
	if err != nil {
		return err
	}
	return updateinstall.Guard(directory, buildinfo.Version)
}
func currentTarget(profile string) updates.Target {
	migration := 1
	if profile == "web-platform" {
		migration = 12
	}
	return updates.Target{Profile: profile, OS: runtime.GOOS, Arch: runtime.GOARCH, Migration: migration, BusinessMigration: 2, License: edition.License, Updater: true}
}
func Healthy(dataDir, profile string) {
	directory, err := filepath.Abs(dataDir)
	if err == nil {
		updateinstall.MarkHealthy(directory, buildinfo.Version, currentTarget(profile))
	}
}
func New(ctx context.Context, dataDir, deployment string, profile func() string, shutdown func()) (*updates.Service, error) {
	c, trust, e := configuration()
	if e != nil {
		return nil, e
	}
	var provider updates.Provider = updatechannel.Offline{}
	if c.Repository != "" || os.Getenv("APP_UPDATE_FEED_URL") != "" {
		var channel *updatechannel.HTTP
		channel, e = updatechannel.New(c.Repository, os.Getenv("APP_UPDATE_FEED_URL"))
		if e != nil {
			return nil, e
		}
		if e = channel.WithRootCA(os.Getenv("APP_UPDATE_CA_FILE")); e != nil {
			return nil, e
		}
		provider = channel
	}
	current := func() updates.Target { return currentTarget(profile()) }
	directory, e := filepath.Abs(dataDir)
	if e != nil {
		return nil, e
	}
	installer := updateinstall.New(updateinstall.Options{DataDir: directory, InstallDir: os.Getenv("APP_UPDATE_INSTALL_DIR"), Deployment: deployment, Version: buildinfo.Version, RestartMode: os.Getenv("APP_UPDATE_RESTART"), Args: os.Args[1:], Target: current, Trust: trust, Provider: provider, Shutdown: shutdown})
	var embedded struct {
		Releases []updates.Release `json:"releases"`
	}
	if json.Unmarshal(updateassets.History, &embedded) != nil {
		return nil, errors.New("invalid embedded release history")
	}
	service := &updates.Service{Provider: provider, Cache: updatechannel.FileCache{Directory: filepath.Join(directory, "updates")}, Installer: installer, Trust: trust, Version: buildinfo.Version, Channel: c.Channel, Current: current, Embedded: embedded.Releases}
	// A supervisor-owned target drains cooperatively if its startup health confirmation expires.
	go func() {
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if updateinstall.RollbackRequested(directory) {
					shutdown()
					return
				}
			}
		}
	}()
	return service, nil
}
