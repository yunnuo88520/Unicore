//go:build !updater

// Author: yunnuo <ymz@ebox.vip>
// Description: Feature-disabled Web composition has no update provider or installer.
package main

import (
	"context"
	"github.com/yunnuo/unicore/internal/updateport"
)

func updateHelper(args []string) (bool, error) { return false, nil }
func updateGuard(directory string) error       { return nil }
func updateHealthy(directory, profile string)  {}
func updateService(ctx context.Context, directory, deployment string, profile func() string, stop func()) (updateport.API, error) {
	return nil, nil
}
