// Author: yunnuo <ymz@ebox.vip>
// Description: Install-manager-backed MCP OAuth storage port; uninstalled or non-platform instances fail closed.
package mcp

import (
	"context"
	"errors"

	"github.com/yunnuo/unicore/internal/adapter/storage/platformsql"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/runtime"
)

// OAuthStore adapts the install manager's per-profile store into the MCP
// OAuth authorization-service port. Like GovernanceStore it resolves the
// repository on every call, so a composition root can hold one value from
// startup while uninstalled instances keep failing closed.
type OAuthStore struct{ Manager *install.Manager }

var _ mcpoauth.Store = OAuthStore{}

func (s OAuthStore) repository(ctx context.Context) (*platformsql.Repository, error) {
	store, _, _, profile := s.Manager.Services()
	if store == nil || profile != runtime.WebPlatform {
		return nil, errors.New("mcp oauth storage unavailable")
	}
	return &platformsql.Repository{Store: store}, nil
}

func (s OAuthStore) CreateClient(ctx context.Context, client mcpoauth.Client, actor string) (mcpoauth.Client, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Client{}, err
	}
	return repository.CreateClient(ctx, client, actor)
}

func (s OAuthStore) UpdateClient(ctx context.Context, expected mcpoauth.Client, name string, redirectURIs []string, enabled bool, actor string) (mcpoauth.Client, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Client{}, err
	}
	return repository.UpdateClient(ctx, expected, name, redirectURIs, enabled, actor)
}

func (s OAuthStore) Secret(ctx context.Context, clientID, secretHash string, rotate bool, actor string) (mcpoauth.Client, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Client{}, err
	}
	return repository.Secret(ctx, clientID, secretHash, rotate, actor)
}

func (s OAuthStore) Clients(ctx context.Context) ([]mcpoauth.Client, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return nil, err
	}
	return repository.Clients(ctx)
}

func (s OAuthStore) Client(ctx context.Context, id string) (mcpoauth.Client, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Client{}, err
	}
	return repository.Client(ctx, id)
}

func (s OAuthStore) CreateGrant(ctx context.Context, grant mcpoauth.Grant) (mcpoauth.Grant, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Grant{}, err
	}
	return repository.CreateGrant(ctx, grant)
}

func (s OAuthStore) Grant(ctx context.Context, id string) (mcpoauth.Grant, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Grant{}, err
	}
	return repository.Grant(ctx, id)
}

func (s OAuthStore) GrantsForUser(ctx context.Context, userID string) ([]mcpoauth.Grant, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return nil, err
	}
	return repository.GrantsForUser(ctx, userID)
}

func (s OAuthStore) GrantsForClient(ctx context.Context, clientID string) ([]mcpoauth.Grant, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return nil, err
	}
	return repository.GrantsForClient(ctx, clientID)
}

func (s OAuthStore) GrantViewsForClient(ctx context.Context, clientID string) ([]mcpoauth.AdminGrantView, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return nil, err
	}
	return repository.GrantViewsForClient(ctx, clientID)
}

func (s OAuthStore) RevokeGrant(ctx context.Context, grant mcpoauth.Grant, actor string) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.RevokeGrant(ctx, grant, actor)
}

func (s OAuthStore) TouchGrant(ctx context.Context, id string, now int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.TouchGrant(ctx, id, now)
}

func (s OAuthStore) SaveCode(ctx context.Context, hash, grantID, redirectURI, challenge, method, scopes string, consentEpoch int, expiresAt int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.SaveCode(ctx, hash, grantID, redirectURI, challenge, method, scopes, consentEpoch, expiresAt)
}

func (s OAuthStore) ConsumeCode(ctx context.Context, hash string, now int64) (string, string, string, string, string, int, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return "", "", "", "", "", 0, err
	}
	return repository.ConsumeCode(ctx, hash, now)
}

func (s OAuthStore) SaveToken(ctx context.Context, hash, kind, grantID, familyID, parentID, scopes string, consentEpoch int, expiresAt, familyDeadline int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.SaveToken(ctx, hash, kind, grantID, familyID, parentID, scopes, consentEpoch, expiresAt, familyDeadline)
}

func (s OAuthStore) FamilyDeadline(ctx context.Context, familyID string) (int64, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return 0, err
	}
	return repository.FamilyDeadline(ctx, familyID)
}

func (s OAuthStore) UpdateGrantConsent(ctx context.Context, grantID string, scopes []string, anchor string) (mcpoauth.Grant, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.Grant{}, err
	}
	return repository.UpdateGrantConsent(ctx, grantID, scopes, anchor)
}

func (s OAuthStore) Token(ctx context.Context, hash string) (mcpoauth.TokenRecord, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.TokenRecord{}, err
	}
	return repository.Token(ctx, hash)
}

func (s OAuthStore) ConsumeToken(ctx context.Context, hash string, now int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.ConsumeToken(ctx, hash, now)
}

func (s OAuthStore) RevokeFamily(ctx context.Context, familyID string, now int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.RevokeFamily(ctx, familyID, now)
}

func (s OAuthStore) RevokeGrantTokens(ctx context.Context, grantID string, now int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.RevokeGrantTokens(ctx, grantID, now)
}

func (s OAuthStore) GrantActor(ctx context.Context, userID, roleID string) (mcpoauth.GrantActor, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return mcpoauth.GrantActor{}, err
	}
	return repository.GrantActor(ctx, userID, roleID)
}

func (s OAuthStore) PasswordAnchor(ctx context.Context, userID string) (string, error) {
	repository, err := s.repository(ctx)
	if err != nil {
		return "", err
	}
	return repository.PasswordAnchor(ctx, userID)
}

func (s OAuthStore) SweepExpired(ctx context.Context, now int64) error {
	repository, err := s.repository(ctx)
	if err != nil {
		return err
	}
	return repository.SweepExpired(ctx, now)
}
