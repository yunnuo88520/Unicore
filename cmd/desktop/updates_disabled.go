//go:build (desktop || bindings) && !updater

// Author: yunnuo <ymz@ebox.vip>
// Description: Native build with update integration removed.
package main

import (
	"context"
	"github.com/yunnuo/unicore/internal/updateport"
)

func updateHelper(args []string) (bool, error)                               { return false, nil }
func updateGuard() error                                                     { return nil }
func updateHealthy()                                                         {}
func updateService(ctx context.Context, stop func()) (updateport.API, error) { return nil, nil }
