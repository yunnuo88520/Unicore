// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth authorization service: consent, one-time codes, rotating token families and per-request grant resolution.
package mcpoauth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
)

// Lifecycle constants fixed by the design: short codes, short access
// windows, rotating refresh with an absolute family deadline.
const (
	CodeTTLSeconds      = 60
	AccessTTLSeconds    = 900
	RefreshTTLDays      = 30
	MaxAuthorizePending = 500
)

// Service errors; the HTTP layer maps them onto standard OAuth codes.
var (
	ErrClientDisabled  = errors.New("oauth client is disabled")
	ErrClientNotFound  = errors.New("oauth client not found")
	ErrInvalidClient   = errors.New("client authentication failed")
	ErrInvalidGrant    = errors.New("grant is revoked or expired")
	ErrInvalidRedirect = errors.New("redirect URI does not match the registration")
	ErrInvalidCode     = errors.New("authorization code is invalid, expired or already used")
	ErrInvalidVerifier = errors.New("PKCE verification failed")
	ErrInvalidScope    = errors.New("requested scope is not grantable")
	ErrInvalidRequest  = errors.New("authorization request is invalid")
	ErrConflict        = errors.New("client was modified concurrently")
	ErrForbidden       = errors.New("actor is not allowed to manage this grant")
	ErrRateLimited     = errors.New("too many authorization attempts")
	ErrUnsupported     = errors.New("grant type or client type is not supported")
)

// Issued is one token-endpoint response payload. Secrets exist only here.
type Issued struct {
	AccessToken      string
	RefreshToken     string
	TokenType        string
	ExpiresIn        int
	RefreshExpiresAt int
	Scopes           []string
}

// Store is the persistence port of the authorization service.
type Store interface {
	// Clients
	CreateClient(ctx context.Context, client Client, actor string) (Client, error)
	UpdateClient(ctx context.Context, expected Client, name string, redirectURIs []string, enabled bool, actor string) (Client, error)
	Secret(ctx context.Context, clientID, secretHash string, rotate bool, actor string) (Client, error)
	Clients(ctx context.Context) ([]Client, error)
	Client(ctx context.Context, id string) (Client, error)
	// Grants
	CreateGrant(ctx context.Context, grant Grant) (Grant, error)
	Grant(ctx context.Context, id string) (Grant, error)
	GrantsForUser(ctx context.Context, userID string) ([]Grant, error)
	GrantsForClient(ctx context.Context, clientID string) ([]Grant, error)
	GrantViewsForClient(ctx context.Context, clientID string) ([]AdminGrantView, error)
	RevokeGrant(ctx context.Context, grant Grant, actor string) error
	TouchGrant(ctx context.Context, id string, now int64) error
	// Codes and tokens
	// SaveCode persists a one-time code with the scope snapshot of the
	// consent it was issued under; redemption may never inherit a later
	// consent's budgets.
	SaveCode(ctx context.Context, hash string, grantID, redirectURI, challenge, method, scopes string, expiresAt int64) error
	ConsumeCode(ctx context.Context, hash string, now int64) (grantID, redirectURI, challenge, method, scopes string, err error)
	// SaveToken persists one token digest. Implementations must refuse to
	// mint into a revoked family and coordinate issuance against revocation
	// through the family's own state row: the update on that row takes the
	// lock the revocation also needs, so a racing rotation either lands
	// inside the revoked family (and is swept by it) or is refused — never
	// silently survives. The refresh variant carries the family's absolute
	// deadline, fixed by the first refresh insert and never extended.
	SaveToken(ctx context.Context, hash, kind, grantID, familyID, parentID, scopes string, expiresAt, familyDeadline int64) error
	// FamilyDeadline returns the family's persisted absolute deadline: the
	// earliest refresh expiry rotation inherits instead of renewing. A
	// missing or unreadable row is an error, not a fresh 30-day window.
	FamilyDeadline(ctx context.Context, familyID string) (int64, error)
	Token(ctx context.Context, hash string) (TokenRecord, error)
	ConsumeToken(ctx context.Context, hash string, now int64) error
	RevokeFamily(ctx context.Context, familyID string, now int64) error
	RevokeGrantTokens(ctx context.Context, grantID string, now int64) error
	// UpdateGrantConsent re-binds an active grant to the scope set of the
	// latest consent and refreshes its security anchor. When the anchor
	// changed (password or recovery rotation since the previous consent),
	// the implementation must revoke the grant's existing tokens inside the
	// same transaction: re-authorizing may never resurrect artifacts the
	// anchor change had already invalidated.
	UpdateGrantConsent(ctx context.Context, grantID string, scopes []string, anchor string) (Grant, error)
	// Actor facts rechecked on every use
	GrantActor(ctx context.Context, userID, roleID string) (actor GrantActor, err error)
	PasswordAnchor(ctx context.Context, userID string) (string, error)
	// Sweeps
	SweepExpired(ctx context.Context, now int64) error
}

// GrantActor is the per-request identity snapshot of a grant's owner,
// projected through the consented single role exactly like a PAT session.
type GrantActor struct {
	User contracts.User
}

// TokenRecord is one stored token row (digests only).
type TokenRecord struct {
	Hash      string
	Kind      string
	GrantID   string
	FamilyID  string
	ParentID  string
	Scopes    []string
	ExpiresAt int64
	Consumed  bool
	Revoked   bool
}

// Service implements the authorization-service semantics on top of the store.
type Service struct {
	Store Store
	// Resource resolves the canonical RFC 8707 resource indicator per use, so
	// a trusted base_url change flows into new grants without a restart.
	Resource func() string
}

func New(store Store, resource func() string) *Service {
	return &Service{Store: store, Resource: resource}
}

// clientSecretHash digests a client secret for storage; secrets are 256-bit
// random tokens, so an unkeyed SHA-256 digest never sees low-entropy input.
func clientSecretHash(secret string) string {
	return platform.Hash("ucs_" + secret)
}

// CreateClient registers one client and returns its one-time secret for
// confidential types; public clients authenticate with PKCE only.
func (s *Service) CreateClient(ctx context.Context, name, clientType, authMethod string, redirectURIs []string, actor string) (Client, string, error) {
	if strings.TrimSpace(name) == "" || len([]rune(name)) > 80 {
		return Client{}, "", ErrInvalidRequest
	}
	var secret string
	secretHash := ""
	switch clientType {
	case ClientPublic:
		authMethod = "none"
	case ClientConfidential:
		if authMethod != AuthClientSecretPost {
			return Client{}, "", ErrInvalidRequest
		}
		secret = platform.Token()
		secretHash = clientSecretHash(secret)
	default:
		return Client{}, "", ErrInvalidRequest
	}
	if err := ValidateRedirectURIs(redirectURIs); err != nil {
		return Client{}, "", err
	}
	now := int(time.Now().Unix())
	client := Client{
		ID: platform.Token(), Name: strings.TrimSpace(name), ClientType: clientType, AuthMethod: authMethod,
		RedirectURIs: redirectURIs, Enabled: false, SecretHash: secretHash, Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	created, err := s.Store.CreateClient(ctx, client, actor)
	if err != nil {
		return Client{}, "", err
	}
	return created, secret, nil
}

// RegisterClient implements the RFC 7591 subset the platform exposes:
// public PKCE clients only, enabled immediately and governed afterwards
// through the admin console like any registered client.
func (s *Service) RegisterClient(ctx context.Context, name string, redirectURIs []string) (Client, error) {
	if strings.TrimSpace(name) == "" || len([]rune(name)) > 80 {
		return Client{}, ErrInvalidRequest
	}
	if err := ValidateRedirectURIs(redirectURIs); err != nil {
		return Client{}, ErrInvalidRedirect
	}
	now := int(time.Now().Unix())
	client := Client{
		ID: platform.Token(), Name: strings.TrimSpace(name), ClientType: ClientPublic, AuthMethod: "none",
		RedirectURIs: redirectURIs, Enabled: true, Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	return s.Store.CreateClient(ctx, client, "dynamic-registration")
}

// RotateClientSecret replaces a confidential client secret; the new value is
// returned once.
func (s *Service) RotateClientSecret(ctx context.Context, clientID, actor string) (Client, string, error) {
	client, err := s.Store.Client(ctx, clientID)
	if err != nil {
		return Client{}, "", err
	}
	if client.ClientType != ClientConfidential {
		return Client{}, "", ErrUnsupported
	}
	secret := platform.Token()
	client, err = s.Store.Secret(ctx, clientID, clientSecretHash(secret), true, actor)
	if err != nil {
		return Client{}, "", err
	}
	_ = actor
	return client, secret, nil
}

// UpdateClient changes metadata, redirect registration or the enablement
// switch behind a CAS version; disabled clients stop issuing and accepting
// tokens immediately.
func (s *Service) UpdateClient(ctx context.Context, clientID, name string, redirectURIs []string, enabled bool, expectedVersion int, actor string) (Client, error) {
	if strings.TrimSpace(name) == "" || len([]rune(name)) > 80 {
		return Client{}, ErrInvalidRequest
	}
	if err := ValidateRedirectURIs(redirectURIs); err != nil {
		return Client{}, err
	}
	client, err := s.Store.Client(ctx, clientID)
	if err != nil {
		return Client{}, err
	}
	if client.Version != expectedVersion {
		return Client{}, ErrConflict
	}
	client.Name, client.RedirectURIs, client.Enabled = strings.TrimSpace(name), redirectURIs, enabled
	return s.Store.UpdateClient(ctx, client, name, redirectURIs, enabled, actor)
}

// authenticateClient checks confidential credentials at the token endpoint.
func (s *Service) authenticateClient(ctx context.Context, client Client, presentedSecret string) error {
	if client.ClientType != ClientConfidential {
		return ErrUnsupported
	}
	if !client.Enabled || client.SecretHash == "" || presentedSecret == "" {
		return ErrInvalidClient
	}
	if !platform.Equal(clientSecretHash(presentedSecret), client.SecretHash) {
		return ErrInvalidClient
	}
	return nil
}

// CreateGrant records the consent decision: one user, one client, exactly
// one role the user holds. The security anchor pins the account state at
// consent time so later security changes invalidate the grant.
func (s *Service) CreateGrant(ctx context.Context, userID, clientID, roleID string, requestedScopes []string, memberRoles []string) (Grant, error) {
	client, err := s.Store.Client(ctx, clientID)
	if err != nil || !client.Enabled {
		return Grant{}, ErrClientDisabled
	}
	held := false
	for _, role := range memberRoles {
		if role == roleID {
			held = true
			break
		}
	}
	if !held {
		return Grant{}, ErrForbidden
	}
	scopes, err := NormalizeScopes(requestedScopes)
	if err != nil {
		return Grant{}, ErrInvalidScope
	}
	anchor, err := s.Store.PasswordAnchor(ctx, userID)
	if err != nil {
		return Grant{}, err
	}
	now := int(time.Now().Unix())
	grant := Grant{
		ID: platform.Token(), UserID: userID, ClientID: clientID, RoleID: roleID,
		Resource: s.Resource(), Scopes: scopes, Status: GrantActive, SecurityAnchor: anchor,
		CreatedAt: now,
	}
	return s.Store.CreateGrant(ctx, grant)
}

// saveCode persists a one-time code under its digest together with the
// consent's scope snapshot.
func (s *Service) saveCode(ctx context.Context, grant Grant, redirectURI, challenge, method string) (string, error) {
	code := platform.Token()
	if err := s.Store.SaveCode(ctx, platform.Hash("ucx_"+code), grant.ID, redirectURI, challenge, method, MarshalScopes(grant.Scopes), time.Now().Add(CodeTTLSeconds*time.Second).Unix()); err != nil {
		return "", err
	}
	return code, nil
}

// IssueCode validates an authorization request and stores a one-time code
// bound to the consent snapshot, redirect and PKCE challenge. The code value
// exists only in this return path; storage keeps its digest.
func (s *Service) IssueCode(ctx context.Context, grant Grant, redirectURI, codeChallenge, codeMethod string) (string, error) {
	client, err := s.Store.Client(ctx, grant.ClientID)
	if err != nil || !client.Enabled {
		return "", ErrClientDisabled
	}
	matched := false
	for _, registered := range client.RedirectURIs {
		if registered == redirectURI {
			matched = true
			break
		}
	}
	if !matched {
		return "", ErrInvalidRedirect
	}
	if grant.Status != GrantActive {
		return "", ErrInvalidGrant
	}
	if codeChallenge != "" && codeMethod != "S256" {
		return "", ErrInvalidRequest
	}
	if client.ClientType == ClientPublic && codeChallenge == "" {
		// Public clients bind PKCE at the authorization step, not only at
		// redemption; a bare code can never exist for them.
		return "", ErrInvalidRequest
	}
	return s.saveCode(ctx, grant, redirectURI, codeChallenge, codeMethod)
}

// ExchangeCode redeems one code for tokens. The single-statement consume is
// the transaction anchor: it burns the code exactly once, and every following
// check (client attribution, redirect, PKCE, actor freshness) runs against
// the consumed row — any failure keeps the code burned, so a rejected
// redemption can never be retried into acceptance.
func (s *Service) ExchangeCode(ctx context.Context, clientID, clientSecret, code, redirectURI, verifier string) (Issued, error) {
	client, err := s.Store.Client(ctx, clientID)
	if err != nil {
		return Issued{}, ErrInvalidClient
	}
	if !client.Enabled {
		return Issued{}, ErrClientDisabled
	}
	if client.ClientType == ClientConfidential {
		if err = s.authenticateClient(ctx, client, clientSecret); err != nil {
			return Issued{}, err
		}
	} else if clientSecret != "" {
		return Issued{}, ErrInvalidClient
	}
	hash := platform.Hash("ucx_" + code)
	grantID, storedRedirect, challenge, method, snapshot, err := s.Store.ConsumeCode(ctx, hash, time.Now().Unix())
	if err != nil {
		return Issued{}, ErrInvalidCode
	}
	if storedRedirect != redirectURI {
		// The code is already consumed; reuse is a hard failure.
		return Issued{}, ErrInvalidRedirect
	}
	grant, err := s.Store.Grant(ctx, grantID)
	if err != nil || grant.Status != GrantActive {
		return Issued{}, ErrInvalidGrant
	}
	// The code belongs to the client it was issued for: client B presenting a
	// lawfully obtained client-A code with its own credentials is refused and
	// the code stays burned.
	if grant.ClientID != clientID {
		return Issued{}, ErrInvalidGrant
	}
	if err = s.verifyGrantFresh(ctx, grant); err != nil {
		return Issued{}, err
	}
	if challenge != "" {
		if verifier == "" || !verifyPKCE(challenge, verifier) {
			return Issued{}, ErrInvalidVerifier
		}
	} else if client.ClientType == ClientPublic {
		// Public clients must always bind PKCE.
		return Issued{}, ErrInvalidVerifier
	}
	_ = method
	// The code redeems under its own consent snapshot: a later authorization
	// may have widened the grant, but this redemption never rides the widen —
	// the effective budget is the snapshot intersected with the current grant.
	effective := effectiveScopes(ParseScopes(snapshot), grant.Scopes)
	if len(effective) == 0 {
		return Issued{}, ErrInvalidGrant
	}
	return s.issueTokens(ctx, grant, effective, "", "", time.Now().Add(RefreshTTLDays*86400*time.Second).Unix())
}

// RefreshConsent re-binds one standing grant to the scope set of the latest
// consent: reuse keeps a single authorization per user+client+role, but the
// grant always carries exactly what the most recent consent approved — an
// old read+write consent downgraded to read-only, and a new consent never
// silently inherits budgets the user just declined to re-confirm. When the
// security anchor changed since the previous consent, the storage layer
// revokes the grant's existing artifacts in the same transaction, so
// re-authorizing after a password rotation cannot resurrect old tokens.
func (s *Service) RefreshConsent(ctx context.Context, grantID string, requestedScopes []string) (Grant, error) {
	scopes, err := NormalizeScopes(requestedScopes)
	if err != nil {
		return Grant{}, ErrInvalidScope
	}
	grant, err := s.Store.Grant(ctx, grantID)
	if err != nil || grant.Status != GrantActive {
		return Grant{}, ErrInvalidGrant
	}
	anchor, err := s.Store.PasswordAnchor(ctx, grant.UserID)
	if err != nil {
		return Grant{}, err
	}
	return s.Store.UpdateGrantConsent(ctx, grantID, scopes, anchor)
}

// verifyPKCE implements S256: BASE64URL(SHA256(verifier)) == challenge.
func verifyPKCE(challenge, verifier string) bool {
	if len(verifier) < 43 || len(verifier) > 128 || strings.ContainsAny(verifier, " \r\n") {
		return false
	}
	digest := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(digest[:])
	return subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) == 1
}

// verifyGrantFresh rechecks the owning client, the actor account, role
// membership and security anchor; every use of a grant pays this cost. The
// grant's resource indicator must also still match this instance: a base_url
// change orphans the tokens minted under the previous one instead of silently
// relocating them.
func (s *Service) verifyGrantFresh(ctx context.Context, grant Grant) error {
	if client, err := s.Store.Client(ctx, grant.ClientID); err != nil || !client.Enabled {
		// A disabled client stops honoring its standing tokens immediately,
		// independent of which endpoint or grant type produced them.
		return ErrClientDisabled
	}
	if grant.Resource != "" && s.Resource != nil {
		if current := s.Resource(); current != "" && grant.Resource != current {
			return ErrInvalidGrant
		}
	}
	actor, err := s.Store.GrantActor(ctx, grant.UserID, grant.RoleID)
	if err != nil {
		return ErrInvalidGrant
	}
	if actor.User.Status != "active" {
		return ErrInvalidGrant
	}
	held := false
	for _, role := range actor.User.Roles {
		if role == grant.RoleID {
			held = true
			break
		}
	}
	if !held {
		return ErrInvalidGrant
	}
	anchor, err := s.Store.PasswordAnchor(ctx, grant.UserID)
	if err != nil {
		return ErrInvalidGrant
	}
	if grant.SecurityAnchor != "" && !strings.EqualFold(anchor, grant.SecurityAnchor) {
		return ErrInvalidGrant
	}
	return nil
}

// effectiveScopes constrains an issuance snapshot by the currently valid
// grant. An empty snapshot (legacy rows predating the snapshot column) falls
// back to the grant itself rather than to an empty — and thus useless — set.
func effectiveScopes(snapshot, current []string) []string {
	if len(snapshot) == 0 {
		return current
	}
	return IntersectScopes(snapshot, current)
}

// issueTokens mints an opaque access token and a rotating refresh token
// bound to the grant family; only digests are stored. The effective scope
// set arrives pre-intersected by the caller: tokens carry their own issuance
// snapshot and never inherit a later consent's budgets. Rotation passes the
// presented family and parent so the new tokens are born inside the family —
// never grafted in afterwards — and never outlive the family deadline.
func (s *Service) issueTokens(ctx context.Context, grant Grant, effective []string, familyID, parentHash string, refreshDeadline int64) (Issued, error) {
	now := time.Now()
	access := "ucm_" + platform.Token()
	refresh := "ucr_" + platform.Token()
	if familyID == "" {
		familyID = platform.Token()
	}
	accessScopes := []string{}
	for _, scope := range effective {
		if scope != ScopeOffline {
			accessScopes = append(accessScopes, scope)
		}
	}
	if len(accessScopes) == 0 {
		accessScopes = []string{ScopeRead}
	}
	refreshScopes := append([]string{ScopeOffline}, accessScopes...)
	if err := s.Store.SaveToken(ctx, platform.Hash(access), TokenAccess, grant.ID, familyID, parentHash, MarshalScopes(accessScopes), now.Add(AccessTTLSeconds*time.Second).Unix(), 0); err != nil {
		return Issued{}, err
	}
	if hasOffline(effective) {
		if err := s.Store.SaveToken(ctx, platform.Hash(refresh), TokenRefresh, grant.ID, familyID, parentHash, MarshalScopes(refreshScopes), refreshDeadline, refreshDeadline); err != nil {
			return Issued{}, err
		}
	}
	if err := s.Store.TouchGrant(ctx, grant.ID, now.Unix()); err != nil {
		return Issued{}, err
	}
	issued := Issued{
		AccessToken: access, TokenType: "Bearer", ExpiresIn: AccessTTLSeconds, Scopes: accessScopes,
		RefreshExpiresAt: int(refreshDeadline),
	}
	if hasOffline(effective) {
		issued.RefreshToken = refresh
	}
	return issued, nil
}

func hasOffline(scopes []string) bool {
	for _, scope := range scopes {
		if scope == ScopeOffline {
			return true
		}
	}
	return false
}

// Refresh rotates one refresh token: the presented token is consumed, a new
// pair is born directly into the same family, and any reuse of a consumed
// token revokes the whole family (replay detection without tolerance
// windows). The replacement refresh never outlives the family's absolute
// deadline, so continuous rotation cannot extend the consent indefinitely.
// The deadline read precedes consumption and a failed or unreadable deadline
// rejects the rotation: a storage failure must never relax back to a fresh
// 30-day window. A lost consume race is replay suspicion — the family dies.
func (s *Service) Refresh(ctx context.Context, clientID, clientSecret, refreshToken string) (Issued, error) {
	client, err := s.Store.Client(ctx, clientID)
	if err != nil {
		return Issued{}, ErrInvalidClient
	}
	if !client.Enabled {
		return Issued{}, ErrClientDisabled
	}
	if client.ClientType == ClientConfidential {
		if err = s.authenticateClient(ctx, client, clientSecret); err != nil {
			return Issued{}, err
		}
	}
	record, err := s.Store.Token(ctx, platform.Hash(refreshToken))
	if err != nil || record.Kind != TokenRefresh {
		return Issued{}, ErrInvalidGrant
	}
	grant, err := s.Store.Grant(ctx, record.GrantID)
	if err != nil || grant.ClientID != clientID {
		return Issued{}, ErrInvalidGrant
	}
	if record.Revoked || record.Consumed {
		_ = s.Store.RevokeFamily(ctx, record.FamilyID, time.Now().Unix())
		return Issued{}, ErrInvalidGrant
	}
	if record.ExpiresAt <= time.Now().Unix() {
		return Issued{}, ErrInvalidGrant
	}
	if err = s.verifyGrantFresh(ctx, grant); err != nil {
		return Issued{}, err
	}
	deadline, err := s.Store.FamilyDeadline(ctx, record.FamilyID)
	if err != nil || deadline <= 0 || deadline <= time.Now().Unix() {
		// Unknown deadline must fail closed: the rotation would otherwise
		// restart the full window the family deadline exists to prevent.
		return Issued{}, ErrInvalidGrant
	}
	if err = s.Store.ConsumeToken(ctx, platform.Hash(refreshToken), time.Now().Unix()); err != nil {
		// Two rotations raced on the same token: one won, this one lost. The
		// family is now suspect (a replay or a client talking twice), so the
		// losing branch revokes it — the winner's fresh tokens included.
		_ = s.Store.RevokeFamily(ctx, record.FamilyID, time.Now().Unix())
		return Issued{}, ErrInvalidGrant
	}
	// The rotation inherits the family's issuance snapshot constrained by the
	// current grant: a later consent may widen or shrink, but a refresh never
	// rides the widen nor silently keeps budgets the consent dropped.
	effective := effectiveScopes(record.Scopes, grant.Scopes)
	if len(effective) == 0 {
		return Issued{}, ErrInvalidGrant
	}
	return s.issueTokens(ctx, grant, effective, record.FamilyID, record.Hash, deadline)
}

// RevokeToken implements RFC 7009 semantics for the revoke endpoint: the
// presented token and, when it is a refresh token, its whole family stop
// working. Revocation is idempotent and never errors on unknown tokens.
func (s *Service) RevokeToken(ctx context.Context, clientID, clientSecret, token string) error {
	client, err := s.Store.Client(ctx, clientID)
	if err != nil {
		return nil // RFC 7009: invalid clients still answer 200 to avoid probing.
	}
	if client.ClientType == ClientConfidential {
		if err = s.authenticateClient(ctx, client, clientSecret); err != nil {
			return nil
		}
	}
	record, err := s.Store.Token(ctx, platform.Hash(token))
	if err != nil {
		return nil
	}
	if record.GrantID != "" {
		grant, err := s.Store.Grant(ctx, record.GrantID)
		if err == nil && grant.ClientID != clientID {
			return nil
		}
	}
	if record.Kind == TokenRefresh {
		return s.Store.RevokeFamily(ctx, record.FamilyID, time.Now().Unix())
	}
	return s.Store.RevokeGrantTokens(ctx, record.GrantID, time.Now().Unix())
}

// Resolve builds the per-request authorization view of an MCP access token:
// token digest, grant, actor account, role membership and security anchor
// are all rechecked; nothing is cached across requests. The returned grant
// carries the effective scope set — the token's own issuance snapshot
// intersected with the currently valid grant — so a later re-authorization
// never widens an already-minted credential, and the caller must scope-check
// against exactly this view.
func (s *Service) Resolve(ctx context.Context, token string) (Grant, GrantActor, error) {
	var zeroGrant Grant
	if !strings.HasPrefix(token, "ucm_") {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	record, err := s.Store.Token(ctx, platform.Hash(token))
	if err != nil || record.Kind != TokenAccess {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	if record.Revoked || record.Consumed || record.ExpiresAt <= time.Now().Unix() {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	grant, err := s.Store.Grant(ctx, record.GrantID)
	if err != nil || grant.Status != GrantActive {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	effective := effectiveScopes(record.Scopes, grant.Scopes)
	if len(effective) == 0 {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	grant.Scopes = effective
	actor, err := s.Store.GrantActor(ctx, grant.UserID, grant.RoleID)
	if err != nil {
		return zeroGrant, GrantActor{}, ErrInvalidGrant
	}
	if err = s.verifyGrantFresh(ctx, grant); err != nil {
		return zeroGrant, GrantActor{}, err
	}
	return grant, actor, nil
}

// RevokeGrant disables one authorization and every token under it.
func (s *Service) RevokeGrant(ctx context.Context, grant Grant, actor string) error {
	return s.Store.RevokeGrant(ctx, grant, actor)
}

// RevokeGrantByID revokes one authorization by identifier for the admin
// console; unknown or already-revoked grants report invalid grant.
func (s *Service) RevokeGrantByID(ctx context.Context, id, actor string) (Grant, error) {
	grant, err := s.Store.Grant(ctx, id)
	if err != nil || grant.Status != GrantActive {
		return Grant{}, ErrInvalidGrant
	}
	return grant, s.Store.RevokeGrant(ctx, grant, actor)
}

// Sweep cleans expired codes and tokens on the retention schedule.
func (s *Service) Sweep(ctx context.Context) error {
	return s.Store.SweepExpired(ctx, time.Now().Unix())
}
