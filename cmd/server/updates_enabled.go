//go:build updater

// Author: yunnuo <ymz@ebox.vip>
// Description: Optional Web update assembly; the CLI never imports these providers or installers.
package main

import (
	"context"
	"github.com/yunnuo/unicore/internal/bootstrap/updating"
	"github.com/yunnuo/unicore/internal/updateport"
)

func updateHelper(args []string) (bool, error) { return updating.Helper(args) }
func updateGuard(directory string) error       { return updating.Guard(directory) }
func updateHealthy(directory, profile string)  { updating.Healthy(directory, profile) }
func updateService(ctx context.Context, directory, deployment string, profile func() string, stop func()) (updateport.API, error) {
	return updating.New(ctx, directory, deployment, profile, stop)
}
