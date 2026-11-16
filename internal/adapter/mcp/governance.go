// Author: yunnuo <ymz@ebox.vip>
// Description: Install-manager-backed MCP policy and call ports; uninstalled or non-platform instances fail closed.
package mcp

import (
	"context"
	"errors"

	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/runtime"
)

// GovernanceStore adapts the install manager's per-profile store into the
// core policy and call ports. The composition root and the protocol tests
// share it so the wiring cannot drift.
type GovernanceStore struct{ Manager *install.Manager }

func (s GovernanceStore) repository(ctx context.Context) (*platformsql.Repository, error) {
	store, _, _, profile := s.Manager.Services()
	if store == nil || profile != runtime.WebPlatform {
		return nil, errors.New("mcp governance storage unavailable")
	}
	return &platformsql.Repository{Store: store}, nil
}

func (s GovernanceStore) Policy(ctx context.Context, kind mcp.Kind, name string) (mcp.Policy, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcp.Policy{}, err
	}
	return repository.MCPPolicy(ctx, kind, name)
}

func (s GovernanceStore) Revision(ctx context.Context) (int64, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return 0, err
	}
	return repository.MCPControlRevision(ctx)
}

func (s GovernanceStore) Begin(ctx context.Context, start mcp.CallStart) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.BeginMCPCall(ctx, start)
}

func (s GovernanceStore) Finish(ctx context.Context, requestID string, finish mcp.CallFinish) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.FinishMCPCall(ctx, requestID, finish)
}
