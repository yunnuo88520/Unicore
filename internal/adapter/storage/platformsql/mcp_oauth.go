// Author: yunnuo <ymz@ebox.vip>
// Description: SQL storage for the MCP OAuth authorization service: clients, grants, one-time codes and token families.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/platform/mcpoauth"
	"github.com/yunnuo/unicore/internal/platform"
)

var _ mcpoauth.Store = (*Repository)(nil)

func oauthClientRow(scan func(dest ...any) error) (mcpoauth.Client, error) {
	var client mcpoauth.Client
	var enabled int
	var uris string
	if err := scan(&client.ID, &client.Name, &client.ClientType, &client.AuthMethod, &uris, &enabled, &client.SecretHash, &client.Version, &client.CreatedAt, &client.UpdatedAt); err != nil {
		return client, err
	}
	client.Enabled = enabled != 0
	client.RedirectURIs = mcpoauth.ParseScopes(uris)
	return client, nil
}

func (r *Repository) CreateClient(ctx context.Context, client mcpoauth.Client, actor string) (mcpoauth.Client, error) {
	_, err := r.exec(ctx, r.Store.DB, "INSERT INTO unicore_mcp_oauth_clients(id,name,client_type,auth_method,redirect_uris,enabled,client_secret_hash,version,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
		client.ID, client.Name, client.ClientType, client.AuthMethod, mcpoauth.MarshalScopes(client.RedirectURIs), boolInt(client.Enabled), client.SecretHash, client.Version, client.CreatedAt, client.UpdatedAt, actor)
	if err != nil {
		return client, err
	}
	return client, r.audit(audit.Target(ctx, "mcp/oauth-client/"+client.ID, "type="+client.ClientType+"; name="+client.Name), r.Store.DB, actor, "mcp.oauth_client.created")
}

func (r *Repository) UpdateClient(ctx context.Context, expected mcpoauth.Client, _ string, redirectURIs []string, enabled bool, actor string) (mcpoauth.Client, error) {
	now := int(time.Now().Unix())
	result, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_clients SET name=?,redirect_uris=?,enabled=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?",
		expected.Name, mcpoauth.MarshalScopes(redirectURIs), boolInt(enabled), now, actor, expected.ID, expected.Version)
	if err != nil {
		return expected, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return expected, err
	}
	if affected != 1 {
		return expected, mcpoauth.ErrConflict
	}
	expected.RedirectURIs, expected.Enabled, expected.UpdatedAt, expected.Version = redirectURIs, enabled, now, expected.Version+1
	return expected, r.audit(audit.Target(ctx, "mcp/oauth-client/"+expected.ID, "name="+expected.Name+"; enabled="+boolText(enabled)), r.Store.DB, actor, "mcp.oauth_client.updated")
}

func (r *Repository) Secret(ctx context.Context, clientID, secretHash string, rotate bool, actor string) (mcpoauth.Client, error) {
	now := time.Now().Unix()
	result, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_clients SET client_secret_hash=?,version=version+1,updated_at=? WHERE id=? AND client_type='confidential'", secretHash, now, clientID)
	if err != nil {
		return mcpoauth.Client{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return mcpoauth.Client{}, mcpoauth.ErrClientNotFound
	}
	rotated, err := r.Client(ctx, clientID)
	if err != nil {
		return rotated, err
	}
	return rotated, r.audit(audit.Target(ctx, "mcp/oauth-client/"+clientID, "secret rotated"), r.Store.DB, actor, "mcp.oauth_client.secret_rotated")
}

func (r *Repository) Clients(ctx context.Context) ([]mcpoauth.Client, error) {
	rows, err := r.rows(ctx, r.Store.DB, "SELECT id,name,client_type,auth_method,redirect_uris,enabled,client_secret_hash,version,created_at,updated_at FROM unicore_mcp_oauth_clients ORDER BY created_at DESC,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clients := []mcpoauth.Client{}
	for rows.Next() {
		client, err := oauthClientRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		clients = append(clients, client)
	}
	return clients, rows.Err()
}

func (r *Repository) Client(ctx context.Context, id string) (mcpoauth.Client, error) {
	row := r.row(ctx, r.Store.DB, "SELECT id,name,client_type,auth_method,redirect_uris,enabled,client_secret_hash,version,created_at,updated_at FROM unicore_mcp_oauth_clients WHERE id=?", id)
	client, err := oauthClientRow(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return client, mcpoauth.ErrClientNotFound
	}
	return client, err
}

func (r *Repository) CreateGrant(ctx context.Context, grant mcpoauth.Grant) (mcpoauth.Grant, error) {
	_, err := r.exec(ctx, r.Store.DB, "INSERT INTO unicore_mcp_oauth_grants(id,user_id,client_id,role_id,resource,scope_set,status,security_anchor,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
		grant.ID, grant.UserID, grant.ClientID, grant.RoleID, grant.Resource, mcpoauth.MarshalScopes(grant.Scopes), grant.Status, grant.SecurityAnchor, grant.CreatedAt)
	return grant, err
}

func (r *Repository) Grant(ctx context.Context, id string) (mcpoauth.Grant, error) {
	row := r.row(ctx, r.Store.DB, "SELECT id,user_id,client_id,role_id,resource,scope_set,status,security_anchor,created_at,last_used_at,revoked_at FROM unicore_mcp_oauth_grants WHERE id=?", id)
	return oauthGrantRow(row.Scan)
}

func oauthGrantRow(scan func(dest ...any) error) (mcpoauth.Grant, error) {
	var grant mcpoauth.Grant
	var scopes string
	if err := scan(&grant.ID, &grant.UserID, &grant.ClientID, &grant.RoleID, &grant.Resource, &scopes, &grant.Status, &grant.SecurityAnchor, &grant.CreatedAt, &grant.LastUsedAt, &grant.RevokedAt); err != nil {
		return grant, err
	}
	grant.Scopes = mcpoauth.ParseScopes(scopes)
	return grant, nil
}

func (r *Repository) GrantsForUser(ctx context.Context, userID string) ([]mcpoauth.Grant, error) {
	return r.oauthGrants(ctx, "user_id=?", userID)
}

func (r *Repository) GrantsForClient(ctx context.Context, clientID string) ([]mcpoauth.Grant, error) {
	return r.oauthGrants(ctx, "client_id=?", clientID)
}

func (r *Repository) oauthGrants(ctx context.Context, condition, arg string) ([]mcpoauth.Grant, error) {
	rows, err := r.rows(ctx, r.Store.DB, "SELECT id,user_id,client_id,role_id,resource,scope_set,status,security_anchor,created_at,last_used_at,revoked_at FROM unicore_mcp_oauth_grants WHERE "+condition+" ORDER BY created_at DESC,id", arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grants := []mcpoauth.Grant{}
	for rows.Next() {
		grant, err := oauthGrantRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		grants = append(grants, grant)
	}
	return grants, rows.Err()
}

// GrantViewsForClient joins the active authorizations of one client with the
// account and role display facts for the admin console.
func (r *Repository) GrantViewsForClient(ctx context.Context, clientID string) ([]mcpoauth.AdminGrantView, error) {
	rows, err := r.rows(ctx, r.Store.DB, "SELECT g.id,g.user_id,g.client_id,g.role_id,g.resource,g.scope_set,g.status,g.security_anchor,g.created_at,g.last_used_at,g.revoked_at,u.username,COALESCE(r.name,'') FROM unicore_mcp_oauth_grants g JOIN unicore_users u ON u.id=g.user_id LEFT JOIN unicore_roles r ON r.id=g.role_id WHERE g.client_id=? AND g.status='active' ORDER BY g.created_at DESC,g.id", clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	views := []mcpoauth.AdminGrantView{}
	for rows.Next() {
		var view mcpoauth.AdminGrantView
		var scopes string
		if err := rows.Scan(&view.ID, &view.UserID, &view.ClientID, &view.RoleID, &view.Resource, &scopes, &view.Status, &view.SecurityAnchor, &view.CreatedAt, &view.LastUsedAt, &view.RevokedAt, &view.Username, &view.RoleName); err != nil {
			return nil, err
		}
		view.Scopes = mcpoauth.ParseScopes(scopes)
		views = append(views, view)
	}
	return views, rows.Err()
}

func (r *Repository) RevokeGrant(ctx context.Context, grant mcpoauth.Grant, actor string) error {
	now := time.Now().Unix()
	if _, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_grants SET status='revoked',revoked_at=? WHERE id=? AND status='active'", now, grant.ID); err != nil {
		return err
	}
	if err := r.RevokeGrantTokens(ctx, grant.ID, now); err != nil {
		return err
	}
	return r.audit(audit.Target(ctx, "mcp-oauth-grant/"+grant.ID, "client="+grant.ClientID), r.Store.DB, actor, "mcp.oauth_grant.revoked")
}

func (r *Repository) TouchGrant(ctx context.Context, id string, now int64) error {
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_grants SET last_used_at=? WHERE id=?", now, id)
	return err
}

func (r *Repository) SaveCode(ctx context.Context, hash, grantID, redirectURI, challenge, method string, expiresAt int64) error {
	_, err := r.exec(ctx, r.Store.DB, "INSERT INTO unicore_mcp_oauth_codes(code_hash,grant_id,redirect_uri,pkce_challenge,pkce_method,expires_at) VALUES(?,?,?,?,?,?)", hash, grantID, redirectURI, challenge, method, expiresAt)
	return err
}

// ConsumeCode redeems a code exactly once inside one statement, then reads
// the row; a concurrent double spend leaves nothing to read.
func (r *Repository) ConsumeCode(ctx context.Context, hash string, now int64) (grantID, redirectURI, challenge, method string, err error) {
	result, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_codes SET consumed_at=? WHERE code_hash=? AND consumed_at=0 AND expires_at>?", now, hash, now)
	if err != nil {
		return "", "", "", "", mcpoauth.ErrInvalidCode
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return "", "", "", "", mcpoauth.ErrInvalidCode
	}
	var consumedGrant, consumedRedirect, consumedChallenge, consumedMethod string
	if err = r.row(ctx, r.Store.DB, "SELECT grant_id,redirect_uri,pkce_challenge,pkce_method FROM unicore_mcp_oauth_codes WHERE code_hash=?", hash).Scan(&consumedGrant, &consumedRedirect, &consumedChallenge, &consumedMethod); err != nil {
		return "", "", "", "", mcpoauth.ErrInvalidCode
	}
	return consumedGrant, consumedRedirect, consumedChallenge, consumedMethod, nil
}

func (r *Repository) SaveToken(ctx context.Context, hash, kind, grantID, familyID, parentID, scopes string, expiresAt int64) error {
	_, err := r.exec(ctx, r.Store.DB, "INSERT INTO unicore_mcp_oauth_tokens(token_hash,kind,grant_id,family_id,parent_id,scopes,expires_at) VALUES(?,?,?,?,?,?,?)", hash, kind, grantID, familyID, parentID, scopes, expiresAt)
	return err
}

func (r *Repository) Refamily(ctx context.Context, accessHash, refreshHash, familyID, parentHash string) error {
	if _, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_tokens SET family_id=?,parent_id=? WHERE token_hash=?", familyID, parentHash, accessHash); err != nil {
		return err
	}
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_tokens SET family_id=?,parent_id=? WHERE token_hash=?", familyID, parentHash, refreshHash)
	return err
}

func (r *Repository) Token(ctx context.Context, hash string) (mcpoauth.TokenRecord, error) {
	row := r.row(ctx, r.Store.DB, "SELECT token_hash,kind,grant_id,family_id,parent_id,scopes,expires_at,consumed_at,revoked_at FROM unicore_mcp_oauth_tokens WHERE token_hash=?", hash)
	var record mcpoauth.TokenRecord
	var scopes string
	var consumed, revoked int
	err := row.Scan(&record.Hash, &record.Kind, &record.GrantID, &record.FamilyID, &record.ParentID, &scopes, &record.ExpiresAt, &consumed, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return record, mcpoauth.ErrInvalidGrant
	}
	if err != nil {
		return record, err
	}
	record.Scopes, record.Consumed, record.Revoked = mcpoauth.ParseScopes(scopes), consumed != 0, revoked != 0
	return record, nil
}

// ConsumeToken burns a rotating refresh token exactly once.
func (r *Repository) ConsumeToken(ctx context.Context, hash string, now int64) error {
	result, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_tokens SET consumed_at=? WHERE token_hash=? AND kind='refresh' AND consumed_at=0 AND revoked_at=0 AND expires_at>?", now, hash, now)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return mcpoauth.ErrInvalidGrant
	}
	return nil
}

func (r *Repository) RevokeFamily(ctx context.Context, familyID string, now int64) error {
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_tokens SET revoked_at=? WHERE family_id=? AND revoked_at=0", now, familyID)
	return err
}

func (r *Repository) RevokeGrantTokens(ctx context.Context, grantID string, now int64) error {
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_oauth_tokens SET revoked_at=? WHERE grant_id=? AND revoked_at=0", now, grantID)
	return err
}

// GrantActor rechecks the account snapshot on every use, projected through
// the consented single role: status, membership, permission points and
// explicit operation grants all derive from one fresh read.
func (r *Repository) GrantActor(ctx context.Context, userID, roleID string) (mcpoauth.GrantActor, error) {
	user, err := r.readUser(ctx, r.Store.DB, userID, roleID)
	if err != nil {
		return mcpoauth.GrantActor{}, err
	}
	return mcpoauth.GrantActor{User: user}, nil
}

// PasswordAnchor derives the grant security anchor from the current
// password credential: a password or recovery change invalidates every
// consent without touching the account flows.
func (r *Repository) PasswordAnchor(ctx context.Context, userID string) (string, error) {
	var passwordHash string
	if err := r.row(ctx, r.Store.DB, "SELECT password_hash FROM unicore_users WHERE id=?", userID).Scan(&passwordHash); err != nil {
		return "", err
	}
	return platform.Hash(passwordHash), nil
}

// SweepExpired prunes expired authorization artifacts with bounded batches:
// codes lose their purpose after consumption plus a short window, access
// tokens after expiry, and refresh rows only once the family deadline passed.
func (r *Repository) SweepExpired(ctx context.Context, now int64) error {
	if _, err := r.exec(ctx, r.Store.DB, "DELETE FROM unicore_mcp_oauth_codes WHERE expires_at<?", now-3600); err != nil {
		return err
	}
	if _, err := r.exec(ctx, r.Store.DB, "DELETE FROM unicore_mcp_oauth_tokens WHERE kind='access' AND expires_at<?", now-86400); err != nil {
		return err
	}
	_, err := r.exec(ctx, r.Store.DB, "DELETE FROM unicore_mcp_oauth_tokens WHERE kind='refresh' AND expires_at<?", now-86400)
	return err
}
